import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoHandler, createPhotoLimiter } from '../server/photoAssist.ts';

const environment = {
  PHOTO_ASSIST_ENABLED: 'true', GEMINI_API_KEY: 'private-test-key',
  VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};
const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 0xff, 0xd9]).toString('base64');
const body = { image, consent: true, sensitive: false };
const user = { id: 'student-1', email: '123456@sguk.ac.in', email_confirmed_at: '2026-01-01', is_anonymous: false };
const suggestion = { title: 'Green bottle', category: 'Accessories', color: 'Green', description: 'A green bottle with a screw cap.' };
const model = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(suggestion) }] } }] };

function request(value: unknown = body, headers: Record<string, string> = {}) {
  return new Request('https://lostlink.example/api/photo-assist', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test.token', ...headers },
    body: JSON.stringify(value),
  });
}

function setup(overrides: {
  env?: Record<string, string>; auth?: unknown; authStatus?: number;
  model?: unknown; modelStatus?: number; allow?: () => boolean;
} = {}) {
  const calls: { url: string; options?: RequestInit }[] = [];
  const handler = createPhotoHandler({
    env: () => ({ ...environment, ...overrides.env }),
    allow: overrides.allow ?? (() => true),
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      return String(url).includes('/auth/v1/user')
        ? Response.json(overrides.auth ?? user, { status: overrides.authStatus ?? 200 })
        : Response.json(overrides.model ?? model, { status: overrides.modelStatus ?? 200 });
    },
  });
  return { handler, calls };
}

test('disabled or missing configuration never contacts the AI provider', async () => {
  for (const env of [{ PHOTO_ASSIST_ENABLED: 'false' }, { GEMINI_API_KEY: '' }, { VITE_SUPABASE_URL: 'https://evil.example' }]) {
    const { handler, calls } = setup({ env });
    assert.equal((await handler(request())).status, 503);
    assert.deepEqual(await (await handler(new Request('https://lostlink.example/api/photo-assist'))).json(), { available: false });
    assert.equal(calls.length, 0);
  }
});

test('public availability does not expose credentials and is never cached', async () => {
  const { handler } = setup();
  const response = await handler(new Request('https://lostlink.example/api/photo-assist'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { available: true });
  assert.equal((await handler(new Request('https://lostlink.example/api/photo-assist', { method: 'DELETE' }))).status, 405);
});

test('rejects missing authentication and cross-site requests before upstream calls', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request(body, { Authorization: '' }))).status, 401);
  assert.equal((await handler(request(body, { 'Sec-Fetch-Site': 'cross-site' }))).status, 403);
  assert.equal(calls.length, 0);
});

test('rejects sensitive images, missing consent, URLs and extra private fields before forwarding', async () => {
  const { handler, calls } = setup();
  for (const invalid of [null, [], { ...body, consent: false }, { ...body, sensitive: true }, { image },
    { ...body, category: 'ID Cards' }, { ...body, privateEvidence: 'secret' },
    { ...body, image: 'https://example.com/photo.jpg' }, { ...body, image: 'YWJjZA==' }]) {
    assert.equal((await handler(request(invalid))).status, 400);
  }
  assert.equal(calls.length, 0);
});

test('bounds JSON body size even without a content-length header', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request({ ...body, image: 'a'.repeat(750_001) }))).status, 413);
  assert.equal((await handler(request(body, { 'Content-Length': '750001' }))).status, 413);
  assert.equal((await handler(request(body, { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal(calls.length, 0);
});

test('expired or unverified/non-college/anonymous sessions never reach Gemini', async () => {
  for (const options of [
    { authStatus: 401 }, { authStatus: 500 }, { auth: { ...user, email_confirmed_at: null } },
    { auth: { ...user, email: 'outsider@example.com', user_metadata: { role: 'admin' } } },
    { auth: { ...user, is_anonymous: true } }, { auth: { email: user.email } },
  ]) {
    const { handler, calls } = setup(options);
    assert.notEqual((await handler(request())).status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/auth\/v1\/user$/);
  }
});

test('successful request forwards only the image and fixed prompt, with credentials separated', async () => {
  const { handler, calls } = setup();
  const response = await handler(request());
  assert.deepEqual(await response.json(), { suggestion });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options?.headers?.['Authorization'], 'Bearer test.token');
  assert.equal(calls[1].options?.headers?.['Authorization'], undefined);
  assert.equal(calls[1].options?.headers?.['x-goog-api-key'], 'private-test-key');
  assert.equal(calls[0].options?.headers?.['x-goog-api-key'], undefined);
  const payload = JSON.parse(String(calls[1].options?.body));
  assert.deepEqual(payload.contents, [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: image } }] }]);
  assert.equal(payload.generationConfig.maxOutputTokens, 300);
  assert.equal(payload.tools, undefined);
  assert.match(calls[1].url, /gemini-2\.5-flash-lite:generateContent$/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('local request limits reject before AI calls', async () => {
  const { handler, calls } = setup({ allow: () => false });
  assert.equal((await handler(request())).status, 429);
  assert.equal(calls.length, 1);
});

test('quota exhaustion never retries, switches provider or exposes provider errors', async () => {
  for (const modelStatus of [429, 403, 500]) {
    const { handler, calls } = setup({ modelStatus, model: { error: 'secret provider diagnostics' } });
    const response = await handler(request());
    assert.equal(response.status, modelStatus === 429 ? 429 : 503);
    assert.doesNotMatch(await response.text(), /secret|private-test-key/);
    assert.equal(calls.length, 2);
  }
});

test('blocked, truncated or malformed model output leaves manual reporting available', async () => {
  for (const value of [{}, { candidates: [{ finishReason: 'SAFETY' }] },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(suggestion) }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] }]) {
    const { handler } = setup({ model: value });
    assert.equal((await handler(request())).status, 422);
  }
});

test('network failures are contained without leaking diagnostic data', async () => {
  const handler = createPhotoHandler({ env: () => environment, fetch: async () => { throw new Error('secret diagnostic'); } });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret/);
});

test('warm-instance limiter handles cooldown, daily cap and global bursts', () => {
  let now = 100_000;
  const allow = createPhotoLimiter(() => now);
  assert.equal(allow('student'), true);
  assert.equal(allow('student'), false);
  for (let i = 1; i < 20; i++) { now += 21_000; assert.equal(allow('student'), true); }
  now += 21_000;
  assert.equal(allow('student'), false);
  now += 86_400_001;
  assert.equal(allow('student'), true);
  for (let i = 0; i < 9; i++) assert.equal(allow(`other-${i}`), true);
  assert.equal(allow('one-more'), false);
});
