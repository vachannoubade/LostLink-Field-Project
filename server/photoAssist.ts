import { PHOTO_ASSIST_PROMPT, parsePhotoSuggestion } from '../src/lib/photoAssist.ts';
import { isCollegeEmail } from '../src/lib/collegeEmail.ts';
import { validateSupabaseUrl, isPrivilegedCredential } from '../config/supabaseUrl.ts';

// Use a documented free-tier model directly. No gateway, paid fallback or retries.
const MODEL = 'gemini-2.5-flash-lite';
const MAX_BODY_BYTES = 750_000;
const MAX_IMAGE_BYTES = 500_000;
const UNAVAILABLE = 'Photo suggestions are temporarily unavailable. Please enter the details manually.';

type Environment = Record<string, string | undefined>;
type Fetch = typeof globalThis.fetch;
type Diagnostic = { stage: 'health' | 'auth' | 'generation' | 'request'; status?: number; reason: string };

// Only fixed classifications leave the server. Never include upstream messages,
// headers, request bodies, photos, user IDs or credential values in diagnostics.
async function providerFailure(response: Response): Promise<string> {
  try {
    const data = await response.json() as { error?: { details?: { reason?: string }[] } };
    const known = new Set(['API_KEY_INVALID', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED',
      'API_KEY_IP_ADDRESS_BLOCKED', 'SERVICE_DISABLED', 'CONSUMER_INVALID', 'BILLING_DISABLED']);
    const reason = data.error?.details?.find(detail => known.has(detail.reason ?? ''))?.reason;
    if (reason) return reason;
  } catch { /* A provider may return a non-JSON error page. */ }
  return ({ 400: 'INVALID_REQUEST', 401: 'INVALID_CREDENTIAL', 403: 'ACCESS_DENIED',
    404: 'MODEL_UNAVAILABLE', 429: 'QUOTA_EXHAUSTED' } as Record<number, string>)[response.status] ?? 'PROVIDER_UNAVAILABLE';
}

class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, {
    status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders },
  });
}

// Best-effort burst protection per warm server instance, NOT a durable quota.
// The provider's project quota and disabled Google billing enforce the free tier.
export function createPhotoLimiter(now = Date.now) {
  const users = new Map<string, number[]>();
  let recent: number[] = [];
  return (userId: string): boolean => {
    const time = now();
    for (const [id, entries] of users) {
      const active = entries.filter(value => value > time - 86_400_000);
      if (active.length) users.set(id, active); else users.delete(id);
    }
    recent = recent.filter(value => value > time - 60_000);
    const entries = users.get(userId) ?? [];
    if (recent.length >= 10 || entries.length >= 20 || entries.some(value => value > time - 20_000)) return false;
    // Bound memory without evicting live limits and inadvertently admitting more traffic.
    if (!users.has(userId) && users.size >= 5000) return false;
    users.set(userId, [...entries, time]);
    recent.push(time);
    return true;
  };
}

async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new RequestError(415, 'Please send a JPEG photo.');
  }
  const length = Number(request.headers.get('content-length'));
  if (length > MAX_BODY_BYTES) throw new RequestError(413, 'The photo is too large. Please choose a smaller photo.');
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'Please choose a photo first.');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError(413, 'The photo is too large. Please choose a smaller photo.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RequestError(400, 'Could not read this photo request.'); }
}

function validateImage(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError(400, 'Please choose a photo first.');
  const data = body as Record<string, unknown>;
  if (data.consent !== true || data.sensitive !== false || data.category === 'ID Cards') {
    throw new RequestError(400, 'Only non-sensitive item photos can be used for photo suggestions.');
  }
  // No remote URLs, custom prompts, reports or private ownership evidence are accepted.
  if (Object.keys(data).some(key => !['image', 'consent', 'sensitive'].includes(key))) {
    throw new RequestError(400, 'Only the selected photo can be sent for suggestions.');
  }
  if (typeof data.image !== 'string' || data.image.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.image)) {
    throw new RequestError(400, 'Could not read this photo. Try another JPG, PNG or WebP image.');
  }
  const bytes = Buffer.from(data.image, 'base64');
  if (bytes.length < 4 || bytes.length > MAX_IMAGE_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes[2] !== 0xff || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new RequestError(400, 'Could not read this photo. Try another JPG, PNG or WebP image.');
  }
  return data.image;
}

export function createPhotoHandler(options: {
  env?: () => Environment; fetch?: Fetch; allow?: (userId: string) => boolean;
  diagnose?: (event: Diagnostic) => void; now?: () => number;
} = {}) {
  const getEnv = options.env ?? (() => process.env);
  const fetch = options.fetch ?? globalThis.fetch;
  const allow = options.allow ?? createPhotoLimiter();
  const diagnose = options.diagnose ?? (event => console.warn('[photo-assist]', JSON.stringify(event)));
  const now = options.now ?? Date.now;
  let health: { key: string; expires: number; result: Promise<boolean> } | undefined;

  const checkProvider = (key: string) => {
    if (health?.key === key && health.expires > now()) return health.result;
    // Metadata only: this never submits a photo or generates billable output.
    // Cache success AND failure, sharing in-flight checks within each instance.
    const result = (async () => {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`, {
          headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) { diagnose({ stage: 'health', status: response.status, reason: await providerFailure(response) }); return false; }
        const metadata = await response.json() as { supportedGenerationMethods?: string[] };
        const available = metadata.supportedGenerationMethods?.includes('generateContent') === true;
        if (!available) diagnose({ stage: 'health', reason: 'GENERATION_UNSUPPORTED' });
        return available;
      } catch { diagnose({ stage: 'health', reason: 'NETWORK_OR_TIMEOUT' }); return false; }
    })();
    health = { key, expires: now() + 60_000, result };
    return result;
  };

  return async (request: Request): Promise<Response> => {
    if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
    const env = getEnv();
    const url = validateSupabaseUrl(env.VITE_SUPABASE_URL);
    const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
    const configured = env.PHOTO_ASSIST_ENABLED === 'true' && Boolean(env.GEMINI_API_KEY?.trim()) &&
      url.valid && Boolean(publicKey) && !isPrivilegedCredential(publicKey);
    if (request.method === 'GET') return json(200, { available: configured && await checkProvider(env.GEMINI_API_KEY!.trim()) });
    if (!configured || !url.valid || !publicKey) return json(503, { error: UNAVAILABLE });

    // Browser calls are same-origin; no permissive CORS headers are returned.
    if (request.headers.get('sec-fetch-site') === 'cross-site') return json(403, { error: 'Please use photo suggestions from LostLink.' });
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization) || authorization.length > 8192) {
      return json(401, { error: 'Please sign in again before requesting photo suggestions.' });
    }

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(35_000)]);
    let stage: Diagnostic['stage'] = 'request';
    try {
      const image = validateImage(await readBody(request));
      // Validate with the Auth server; never trust a decoded JWT or user_metadata.
      stage = 'auth';
      const auth = await fetch(`${url.url}/auth/v1/user`, {
        headers: { apikey: publicKey, Authorization: authorization },
        signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
      });
      if (!auth.ok) {
        diagnose({ stage, status: auth.status, reason: 'AUTH_REJECTED' });
        return auth.status === 401 || auth.status === 403
          ? json(401, { error: 'Please sign in again before requesting photo suggestions.' })
          : json(503, { error: UNAVAILABLE });
      }
      const user = await auth.json() as { id?: string; email?: string; email_confirmed_at?: string; is_anonymous?: boolean };
      if (!user.id || user.is_anonymous || !user.email_confirmed_at || !user.email || !isCollegeEmail(user.email)) {
        return json(403, { error: 'Sign in with your verified college account to use photo suggestions.' });
      }
      if (!allow(user.id)) return json(429, { error: 'Photo suggestions are busy or your request limit has been reached. Try later or enter details manually.' }, { 'Retry-After': '60' });

      stage = 'generation';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY!.trim() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PHOTO_ASSIST_PROMPT }] },
          contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: image } }] }],
          generationConfig: {
            temperature: 0, maxOutputTokens: 300, responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT', required: ['title', 'category', 'color', 'description'],
              properties: {
                title: { type: 'STRING', nullable: true },
                category: { type: 'STRING', nullable: true, enum: ['Electronics', 'Bags', 'Books', 'Accessories', 'Keys', 'Other'] },
                color: { type: 'STRING', nullable: true }, description: { type: 'STRING', nullable: true },
              },
            },
          },
        }),
      });
      if (!response.ok) {
        diagnose({ stage, status: response.status, reason: await providerFailure(response) });
        if (response.status === 429) return json(429, { error: 'The free photo-assistance allowance is currently exhausted. Please try later or enter details manually.' }, { 'Retry-After': '60' });
        return json(503, { error: UNAVAILABLE });
      }
      const result = await response.json() as {
        candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      };
      const candidate = result.candidates?.[0];
      if (candidate?.finishReason !== 'STOP') return json(422, { error: 'No reliable details found. Try a clearer photo of one item or enter details manually.' });
      const output = candidate.content?.parts?.filter(part => !part.thought).map(part => part.text ?? '').join('') ?? '';
      try { return json(200, { suggestion: parsePhotoSuggestion(output) }); }
      catch { return json(422, { error: 'No reliable details found. Try a clearer photo of one item or enter details manually.' }); }
    } catch (error) {
      if (error instanceof RequestError) return json(error.status, { error: error.message });
      diagnose({ stage, reason: signal.aborted ? 'REQUEST_CANCELLED_OR_TIMEOUT' : 'REQUEST_FAILED' });
      return json(signal.aborted ? 504 : 503, { error: signal.aborted
        ? 'Photo suggestions took too long. Try later or enter details manually.' : UNAVAILABLE });
    }
  };
}
