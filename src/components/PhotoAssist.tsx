import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import {
  PHOTO_FIELDS, PHOTO_FIELD_LABELS, PHOTO_MODEL_DOWNLOAD_BYTES,
  type PhotoField, type PhotoFormValues, type PhotoSuggestion, type PhotoWorkerMessage,
} from '../lib/photoAssist';

interface PhotoAssistProps {
  file: File;
  values: PhotoFormValues;
  categoryChosen: boolean;
  disabled: boolean;
  onApply: (suggestion: PhotoSuggestion, selected: PhotoField[]) => void;
}

export function PhotoAssist({ file, values, categoryChosen, disabled, onApply }: PhotoAssistProps) {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [downloaded, setDownloaded] = useState(0);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState<PhotoSuggestion | null>(null);
  const [selected, setSelected] = useState<PhotoField[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopWorker = () => {
    requestRef.current += 1;
    workerRef.current?.terminate();
    workerRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };

  useEffect(() => () => {
    requestRef.current += 1;
    workerRef.current?.terminate();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const start = async () => {
    if (running || disabled) return;
    stopWorker();
    setError('');
    setSuggestion(null);
    setDownloaded(0);
    if (!window.isSecureContext || !('gpu' in navigator)) {
      setError('This browser cannot run photo suggestions. Try an up-to-date desktop Chrome or Edge, or enter details manually.');
      return;
    }
    setRunning(true);
    setStatus('Preparing your photo…');
    const request = requestRef.current;
    const fail = (message: string) => {
      if (request !== requestRef.current) return;
      stopWorker();
      setRunning(false);
      setStatus('');
      setError(message);
    };
    timeoutRef.current = setTimeout(() => fail('This is taking too long on this device. You can try again or enter details manually.'), 15 * 60_000);
    try {
      // Downscale and re-encode locally; EXIF and the original full-resolution photo are not sent to the model.
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) { bitmap.close(); throw new Error('Canvas unavailable'); }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image unavailable')), 'image/jpeg', 0.85));
      if (request !== requestRef.current) return;
      const worker = new Worker(new URL('../workers/photoAssist.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = ({ data }: MessageEvent<PhotoWorkerMessage>) => {
        if (request !== requestRef.current) return;
        if (data.type === 'progress') {
          setStatus(data.message);
          if (typeof data.downloaded === 'number') setDownloaded(data.downloaded);
        } else if (data.type === 'error') {
          fail(data.message);
        } else if (data.type === 'result') {
          stopWorker();
          setRunning(false);
          setSuggestion(data.suggestion);
          // Nothing is preselected: accepting an overwrite always requires an explicit choice.
          setSelected([]);
          setStatus(PHOTO_FIELDS.some(field => data.suggestion[field]) ? '' : 'No reliable details found. Try a clearer photo of one item or enter details manually.');
        }
      };
      worker.onerror = () => fail('Photo suggestions could not start on this device. You can still enter details manually.');
      worker.postMessage({ type: 'analyze', image });
    } catch {
      fail('Could not prepare this photo. Try another JPG, PNG or WebP image, or enter details manually.');
    }
  };

  return (
    <section className="photo-assist" aria-labelledby="photo-assist-title" aria-busy={running}>
      <h3 id="photo-assist-title"><Sparkles size={18} aria-hidden="true" /> Suggest details from photo</h3>
      <p>Optional, free AI assistance. Qwen runs on your device. Your photo is not sent to an AI service.</p>
      <p className="photo-assist-note">First use downloads about 1.5 GB and may take several minutes. Use Wi-Fi and a capable laptop or desktop with an up-to-date browser and hardware acceleration. Some phones are not supported. Model files may be cached for next time.</p>
      <div className="photo-assist-actions">
        <button type="button" className="btn btn-secondary" onClick={() => void start()} disabled={running || disabled}>
          {running ? <Loader2 size={16} className="spin-loader" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
          {running ? 'Preparing suggestions…' : error || suggestion ? 'Try again' : 'Download model & suggest details'}
        </button>
        {running && <button type="button" className="btn btn-ghost" onClick={() => {
          stopWorker(); setRunning(false); setStatus('Cancelled. Your report details are unchanged.');
        }}>Cancel</button>}
      </div>
      <div role="status" aria-live="polite">
        {status && <p>{status}</p>}
      </div>
      {running && downloaded > 0 && (
        <div>
          <progress aria-label="Model download progress" value={Math.min(downloaded, PHOTO_MODEL_DOWNLOAD_BYTES)} max={PHOTO_MODEL_DOWNLOAD_BYTES} />
          <p className="photo-assist-note">{Math.round(downloaded / 1_000_000)} MB loaded. Preparing the model can take time after downloading.</p>
        </div>
      )}
      {error && <p role="alert" className="photo-assist-error">{error}</p>}
      {suggestion && PHOTO_FIELDS.some(field => suggestion[field]) && (
        <fieldset className="photo-assist-review" disabled={disabled}>
          <legend>Review suggested details</legend>
          <p>AI can make mistakes. Select only the details you want to use. You can edit them in the form before submitting.</p>
          {PHOTO_FIELDS.filter(field => suggestion[field]).map(field => {
            const replacing = Boolean(values[field]?.trim()) && (field !== 'category' || categoryChosen) && values[field] !== suggestion[field];
            return (
              <label className="photo-assist-choice" key={field}>
                <input type="checkbox" checked={selected.includes(field)} onChange={event => {
                  setSelected(current => event.target.checked ? [...current, field] : current.filter(value => value !== field));
                }} />
                <span>
                  <strong>{PHOTO_FIELD_LABELS[field]}</strong>
                  <span>{suggestion[field]}</span>
                  {replacing && <small>Replaces your current value: {values[field]}</small>}
                </span>
              </label>
            );
          })}
          <div className="photo-assist-actions">
            <button type="button" className="btn btn-primary" disabled={!selected.length} onClick={() => {
              onApply(suggestion, selected);
              setSuggestion(null);
              setStatus('Selected suggestions applied. Review the form before submitting.');
            }}>Apply selected details</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setSuggestion(null); setStatus('Suggestions dismissed. Your report details are unchanged.'); }}>Dismiss</button>
          </div>
        </fieldset>
      )}
    </section>
  );
}
