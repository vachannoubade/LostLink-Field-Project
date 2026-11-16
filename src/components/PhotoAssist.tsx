import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  PHOTO_FIELDS, PHOTO_FIELD_LABELS, parsePhotoSuggestion,
  type PhotoField, type PhotoFormValues, type PhotoSuggestion,
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
  const [availability, setAvailability] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState<PhotoSuggestion | null>(null);
  const [selected, setSelected] = useState<PhotoField[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    requestRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/photo-assist', { signal: controller.signal, cache: 'no-store' })
      .then(async response => response.ok && (await response.json()).available === true)
      .then(available => { if (!controller.signal.aborted) setAvailability(available ? 'available' : 'unavailable'); })
      .catch(() => { if (!controller.signal.aborted) setAvailability('unavailable'); });
    return () => {
      controller.abort();
      requestRef.current += 1;
      controllerRef.current?.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const start = async () => {
    if (running || disabled || !consent || availability !== 'available') return;
    stop();
    const controller = new AbortController();
    controllerRef.current = controller;
    const request = requestRef.current;
    setError('');
    setSuggestion(null);
    setRunning(true);
    setStatus('Preparing your photo…');
    const fail = (message: string) => {
      if (request !== requestRef.current) return;
      stop(); setRunning(false); setStatus(''); setError(message);
    };
    timeoutRef.current = setTimeout(() => fail('Photo suggestions took too long. Try later or enter details manually.'), 45_000);
    try {
      // Only a small re-encoded photo is sent. No EXIF, report text or ownership evidence.
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) { bitmap.close(); throw new Error('Canvas unavailable'); }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      if (!image || image.length > 666_668) {
        fail('This photo could not be prepared. Try a smaller image or enter details manually.'); return;
      }
      const { data, error: sessionError } = await supabase!.auth.getSession();
      if (request !== requestRef.current) return;
      if (sessionError || !data.session) { fail('Please sign in again before requesting photo suggestions.'); return; }
      setStatus('Looking at your item…');
      const response = await fetch('/api/photo-assist', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ image, consent: true, sensitive: false }),
      });
      if (request !== requestRef.current) return;
      if (!response.ok) {
        const messages: Record<number, string> = {
          401: 'Please sign in again before requesting photo suggestions.',
          403: 'Sign in with your verified college account to use photo suggestions.',
          413: 'This photo is too large. Try a smaller photo or enter details manually.',
          422: 'No reliable details found. Try a clearer photo of one item or enter details manually.',
          429: 'Photo suggestions are busy or the free allowance is exhausted. Try later or enter details manually.',
          504: 'Photo suggestions took too long. Try later or enter details manually.',
        };
        fail(messages[response.status] ?? 'Photo suggestions are temporarily unavailable. Please enter the details manually.');
        return;
      }
      const result = await response.json();
      if (request !== requestRef.current) return;
      const details = parsePhotoSuggestion(JSON.stringify(result.suggestion));
      stop(); setRunning(false); setSuggestion(details); setSelected([]);
      setStatus(PHOTO_FIELDS.some(field => details[field]) ? '' : 'No reliable details found. Try a clearer photo of one item or enter details manually.');
    } catch {
      fail('Could not analyse this photo. Check your connection, try another photo, or enter details manually.');
    }
  };

  return (
    <section className="photo-assist" aria-labelledby="photo-assist-title" aria-busy={running}>
      <h3 id="photo-assist-title"><Sparkles size={18} aria-hidden="true" /> Suggest details from photo</h3>
      <p>Get a suggested title, category, colour and description. Review and choose what to use.</p>
      <p className="photo-assist-note">This optional feature sends a small copy of your photo to Google Gemini. Google may use free-tier submissions to improve its products. Only use photos of the item itself, without people, ID cards, documents or personal details. <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">Google’s data terms</a></p>
      {availability === 'checking' && <p role="status">Checking photo assistance…</p>}
      {availability === 'unavailable' && <p role="status">Photo suggestions are temporarily unavailable. You can enter the details manually.</p>}
      {availability === 'available' && <>
        <label className="photo-assist-choice">
          <input type="checkbox" checked={consent} disabled={running || disabled} onChange={event => setConsent(event.target.checked)} />
          <span>I agree to send this non-sensitive item photo to Google for suggestions.</span>
        </label>
        <div className="photo-assist-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void start()} disabled={running || disabled || !consent}>
            {running ? <Loader2 size={16} className="spin-loader" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
            {running ? 'Preparing suggestions…' : error || suggestion ? 'Try again' : 'Suggest details'}
          </button>
          {running && <button type="button" className="btn btn-ghost" onClick={() => {
            stop(); setRunning(false); setStatus('Cancelled. Your report details are unchanged.');
          }}>Cancel</button>}
        </div>
      </>}
      <div role="status" aria-live="polite">{status && <p>{status}</p>}</div>
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
