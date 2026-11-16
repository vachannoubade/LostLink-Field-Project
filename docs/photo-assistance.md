# Server-based photo-assisted reporting

LostLink sends an optional, resized item photo through `/api/photo-assist` to
Google Gemini 2.5 Flash-Lite. Students and administrators do not download a model,
install software, create an AI account, or supply an API key. This integrates a
pretrained model; LostLink does not claim to have trained it.

## Student flow

1. Choose a JPG, PNG or WebP photo in a lost/found report.
2. Read the Google data-use notice and agree to send the non-sensitive item photo.
3. Click **Suggest details**.
4. Review suggestions for title, category, colour and description. Select the
   fields to apply; nothing is preselected or submitted automatically.
5. Edit the report and submit normally.

The manual form stays usable when assistance is disabled, unavailable, slow or
out of quota. Choosing ID Cards or marking a photo sensitive hides assistance.
Replacing/removing the image, cancelling or navigating away aborts the client
request and ignores late responses. Cancellation cannot retract an image that
has already reached Google or guarantee that Google cancels processing.

## Free-only setup

Use a dedicated Google AI Studio project on **Free tier with billing disabled**.
Do not link billing, enable paid services, use a paid key, or enable fallback
providers. See Google's [pricing](https://ai.google.dev/gemini-api/docs/pricing)
and [billing](https://ai.google.dev/gemini-api/docs/billing) documentation.
The model currently has free image input and text output, subject to account,
region and model availability. Quotas can change; do not promise a fixed daily
allowance. The function makes one request, with no retries or paid fallback.

The API key itself does not disclose the project's billing status to this app.
The operator must verify that billing remains disabled. `PHOTO_ASSIST_ENABLED`
is an explicit deployment switch, not proof of an account's billing status.
If the free tier becomes unavailable, disable the feature instead of upgrading.
Existing Vercel/Supabase hosting quotas still apply; this feature does not create
new hosting services or change a plan. There is no unlimited free-service claim.

### Environment variables

Keep these server-side, without a `VITE_` prefix:

- `GEMINI_API_KEY`: sensitive secret from the free-tier project.
- `PHOTO_ASSIST_ENABLED=true`: enable only after verifying free-tier account status.

The endpoint reuses `VITE_SUPABASE_URL` and the existing public
`VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY` to validate sessions
with Supabase Auth. No service-role credential or schema migration is needed.

For rollout, configure the key and switch for the **Preview** environment on
`feat/server-photo-assistance`, deploy and test. Keep the restored production
site in place. A later production release needs the server variables set for
Production and a tested deployment; publishing a preview does not do this.

For local work, copy `.env.example` to `.env.local`, fill in the public Supabase
values and optional server values, then run `npm ci` and `npm run dev`. Vite's
local middleware runs the same handler. Secrets are explicitly excluded from
client environment injection. `npm run preview` serves only built static files;
use a Vercel preview for production API testing.

## Privacy and access

- Before analysis, the browser resizes the image to a maximum 768-pixel edge and
  re-encodes it as JPEG, stripping EXIF. Only that image and consent flags go to
  the endpoint; report text, private clues, locations and dates are not included.
- The endpoint validates the Bearer token against Supabase Auth, requires a
  verified college account, and excludes anonymous users. Supabase receives the
  session token, not the image. Google receives the image and fixed instruction,
  not the session token or user identity. The API key stays on the server.
- Google may use free-tier images and responses to improve its products. The UI
  discloses this and links to [Google's terms](https://ai.google.dev/gemini-api/terms).
  Do not use people, identity documents or photos containing personal details.
  User flags and model instructions cannot reliably detect all sensitive content.
- Requests accept JPEG bytes, not URLs, prompts or arbitrary report fields. JSON
  requests are bounded at 750 KB; image bytes at 500 KB. No image is saved by this
  endpoint. Normal report photo storage still happens during report submission.
- Responses use `Cache-Control: no-store`. The implementation does not log photos,
  tokens, keys, model output or provider error bodies. Google's retention is
  governed by its terms; this app does not promise zero provider retention.
- Generated JSON is restricted to four fields and filtered for obvious contact
  details, identifiers and markup. It is rendered as text and reviewed by users.
  AI cannot establish ownership, approve claims or fill private verification data.

## Limits and failure handling

The handler uses a 35-second upstream deadline, with an 8-second auth deadline;
the browser cancels after 45 seconds. Vercel's function duration is 45 seconds.
There is best-effort in-memory burst protection: one request per user per 20
seconds, 20 per user per day and 10 total per minute **per warm server instance**.
These counters reset on restart and are not shared across instances/deployments.
Google's project-level quota is the authoritative free-tier limit. A larger
rollout should add a shared limiter before relying on per-user quotas.

Quota errors, upstream outages, safety blocks, malformed results and timeouts all
return a manual-reporting fallback. The function does not silently switch models
or retry. The old Transformers.js/ONNX dependencies, worker, model downloads and
WebAssembly CSP exceptions have been removed.

## Verification

Run `npm run build`, `npm test`, `npm run lint` and `git diff --check`.
The tests cover authentication, consent, sensitive/extra input rejection, body
limits, quota/outage behavior, no fallback/retry, credential separation, bounded
output and explicit field application. Browser checks exercise both report types,
mobile/desktop review, manual edits, cancel/replacement, consent and API failures.
Provider responses in automated tests are simulated. A signed-in preview test
with a non-sensitive item photo is required to confirm the actual account's key,
model availability and end-to-end Google response before a production release.
