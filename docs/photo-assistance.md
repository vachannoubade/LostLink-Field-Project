# Free photo-assisted reporting

LostLink runs Qwen3-VL-2B-Instruct in the student's browser. No paid inference
endpoint, API key, server model, or additional cloud service is configured.
Existing website hosting and a student's internet/data usage are separate from
model inference. The feature is optional; manual reporting always remains available.

## Student flow

1. Open Report Lost Item or Report Found Item, then choose a JPG, PNG or WebP photo.
2. Read the download/device notice and select **Download model & suggest details**.
3. The browser downloads approximately 1.5 GB of quantized model files on first use.
   The Cache API may retain completed files; eviction, private browsing, or a new
   browser/device can require another download. Loading/generation can take minutes.
4. Review suggestions for title, category, primary colour and description.
5. Explicitly check the fields to use, then select **Apply selected details**.
   Existing values are shown before replacement. Continue editing and submit normally.

Cancelling, replacing/removing a photo, marking it sensitive, selecting ID Cards,
or navigating away terminates the worker. These actions do not apply suggestions.
AI does not fill location/date, brand/model, custody, distinguishing features or
private ownership evidence. AI does not establish ownership or approve a handover.

## Runtime and privacy

- Requires HTTPS (or localhost) and an available WebGPU adapter. Recent desktop
  Chrome/Edge on a capable machine is recommended; not every phone/browser has
  enough memory or GPU support. Unsupported devices retain the manual form.
- Software-only/fallback graphics adapters (including SwiftShader) are rejected
  before model downloads, because they cannot provide practical inference speed.
- A dedicated worker keeps model work off the UI thread. The model loads only
  after an explicit click; it is not loaded during normal browsing or uploading.
- The selected image is downscaled to a maximum 512-pixel edge and re-encoded
  locally. No image, report text, Supabase session, or ownership evidence is sent
  to Hugging Face or another AI service. Hugging Face receives model download
  requests; the normal photo upload to Supabase happens when submitting the report.
- Model output is parsed as JSON, restricted to four fields, validated against
  existing form limits, and rendered as text. Obvious contact details, identifiers,
  and markup are filtered. These filters are not a guarantee against hallucinations
  or personal information; students must review every accepted suggestion.
- Sensitive images and ID-card reports do not offer photo assistance. The prompt
  also instructs the model to avoid document transcription and uncertain details.
- A 15-minute overall timeout and a Cancel action terminate stuck requests.
- Model downloads use the pinned public Hugging Face revision. Runtime JavaScript
  and WASM are bundled with the app, not executed from an external CDN.

## Model and attribution

- Original model: [Qwen/Qwen3-VL-2B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct)
- Official source: [QwenLM/Qwen3-VL](https://github.com/QwenLM/Qwen3-VL)
- Browser conversion: [onnx-community/Qwen3-VL-2B-Instruct-ONNX](https://huggingface.co/onnx-community/Qwen3-VL-2B-Instruct-ONNX)
- Revision: `5dc9194ba42fa62c2f1440d98a71f7cd5280afe2`; quantization: `q4`.
- Original Qwen model and Transformers.js: Apache-2.0. ONNX Runtime: MIT.
  Preserve upstream notices when redistributing model/runtime files.
- This project integrates a pretrained model; it does not claim to have trained it.

## Development and deployment

Run `npm ci`, `npm run dev`, `npm run build`, `npm run lint`, and `npm test`.
The `.npmrc` setting skips extra ONNX Runtime Node/CUDA binary downloads because
production inference uses ONNX Runtime Web. The Node CPU binary is not required
by the application. The runtime and model revisions are pinned in the lockfile
and `src/lib/photoAssist.ts`.

Vercel's Content Security Policy permits model downloads from Hugging Face's
model/CDN domains and WebAssembly compilation (`wasm-unsafe-eval`). It continues
to restrict executable scripts and workers to the site's own origin. No general
`unsafe-eval`, wildcard script source, or paid inference origin is added.

## Verification

`tests/photoAssist.test.ts` exercises invalid/model-shaped responses, length limits,
obvious personal-data filtering, and explicit field application without changes to
unrelated or private fields. Browser checks should cover lost/found reports,
unsupported WebGPU, cancel, stale response after replacement, sensitive images,
manual edits during generation, selecting only some fields, and retry after failure.
Real model evaluation must use representative campus photos; a successful smoke
test is not an accuracy benchmark or a claim of reliable brand/identity recognition.

### Implementation checks

- Build and 56 unit tests passed; lint reports the existing warnings elsewhere in the app.
- Desktop (1280 px) and mobile (390 px) browser checks used simulated sign-in and
  model responses to exercise field selection, preserving manual edits, cancellation,
  stale responses, replacement/removal, errors, ID cards and sensitive images.
- A real production worker under the exact deployment CSP rejected the software
  graphics adapter before downloading any model files. A separate small WebGPU
  inference checked the bundled runtime under the same CSP.
- The pinned Qwen weights were exercised on CPU with a real green-bottle photo.
  The final prompt produced `water bottle`, `Accessories`, `green`, and
  `A matte green water bottle with a cylindrical shape and a cap.`
- This environment has software graphics only. Full Qwen inference on a physical
  GPU has not been verified here; device compatibility and speed still vary.
