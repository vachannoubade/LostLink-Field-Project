/// <reference lib="webworker" />
import {
  AutoModelForImageTextToText, AutoProcessor, RawImage, Tensor, env,
} from '@huggingface/transformers';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import {
  PHOTO_MODEL, PHOTO_MODEL_REVISION, PHOTO_ASSIST_PROMPT, parsePhotoSuggestion, isHardwarePhotoAdapter,
  type PhotoGpuAdapter, type PhotoWorkerMessage, type PhotoWorkerRequest,
} from '../lib/photoAssist';

const worker = self as unknown as DedicatedWorkerGlobalScope;
const send = (message: PhotoWorkerMessage) => worker.postMessage(message);
env.allowLocalModels = false;
env.useWasmCache = false;
env.backends.onnx.wasm!.wasmPaths = {
  wasm: new URL(wasmUrl, worker.location.href).href,
  mjs: new URL(wasmModuleUrl, worker.location.href).href,
};
env.backends.onnx.wasm!.numThreads = 1;
// Model files are downloaded from Hugging Face; photos never leave this worker.
let busy = false;

worker.onmessage = async ({ data }: MessageEvent<PhotoWorkerRequest>) => {
  if (data.type !== 'analyze' || busy) return;
  busy = true;
  let model: Awaited<ReturnType<typeof AutoModelForImageTextToText.from_pretrained>> | undefined;
  try {
    const gpu = (worker.navigator as WorkerNavigator & {
      gpu?: { requestAdapter(): Promise<PhotoGpuAdapter | null> };
    }).gpu;
    if (!gpu || !isHardwarePhotoAdapter(await gpu.requestAdapter())) {
      send({ type: 'error', message: 'Photo suggestions need hardware graphics acceleration. This device cannot run the model efficiently, so no model files were downloaded. Try an up-to-date desktop Chrome or Edge with hardware acceleration, or enter details manually.' });
      return;
    }
    send({ type: 'progress', message: 'Loading Qwen on your device…' });
    const downloaded = new Map<string, number>();
    const progress = (event: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (event.file && typeof event.loaded === 'number') downloaded.set(event.file, event.loaded);
      if (event.file && event.status === 'done' && typeof event.total === 'number') downloaded.set(event.file, event.total);
      send({ type: 'progress', message: 'Downloading and preparing Qwen…', downloaded: [...downloaded.values()].reduce((a, b) => a + b, 0) });
    };
    const processor = await AutoProcessor.from_pretrained(PHOTO_MODEL, {
      revision: PHOTO_MODEL_REVISION, progress_callback: progress,
    });
    model = await AutoModelForImageTextToText.from_pretrained(PHOTO_MODEL, {
      revision: PHOTO_MODEL_REVISION, device: 'webgpu', dtype: 'q4', progress_callback: progress,
    });
    send({ type: 'progress', message: 'Looking at your photo… This may take a few minutes.' });
    const image = await RawImage.fromBlob(data.image);
    const prompt = processor.apply_chat_template([
      { role: 'user', content: [{ type: 'image' }, { type: 'text', text: PHOTO_ASSIST_PROMPT }] },
    ], { add_generation_prompt: true });
    const inputs = await processor(prompt, image);
    const output = await model.generate({ ...inputs, max_new_tokens: 180, do_sample: false });
    if (!(output instanceof Tensor)) throw new Error('Unexpected model response');
    const generated = output.slice(null, [inputs.input_ids.dims[1], null]);
    const text = processor.batch_decode(generated, { skip_special_tokens: true })[0];
    send({ type: 'result', suggestion: parsePhotoSuggestion(text) });
  } catch {
    send({ type: 'error', message: 'Photo suggestions could not finish. Check your connection, close other tabs, or try a clearer photo. Your report details are unchanged; you can continue manually.' });
  } finally {
    await model?.dispose().catch(() => {});
    busy = false;
  }
};
