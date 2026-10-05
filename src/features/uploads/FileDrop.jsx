// ============================================================
// FileDrop - accessible file picker that validates BEFORE reading, then runs
// text extraction (injectable, so tests never need pdfjs / tesseract).
//
// Props:
//   accept   'scan' | 'plan'
//   extract  async (file:{name,type,size,bytes}, {onProgress}) -> extraction   (default extractText)
//   onResult ({ file, bytes, fileSha256, check, extraction })
//   onCancel optional (called by the Cancel button only when nothing is running)
//   idPrefix optional
// Uploaded files are untrusted data: nothing is rendered from their content here.
// ============================================================
import React, { useRef, useState } from 'react';
import { Upload, Loader2, AlertTriangle, RotateCcw, X, Check } from 'lucide-react';
import { Banner } from '../../components.jsx';
import { validateUpload, sha256Hex } from '../../imports/fileChecks.js';
import { extractText } from '../../imports/extractText.js';
import './uploads.css';

export const ACCEPT = {
  scan: { attr: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png', hint: 'PDF, JPG or PNG, up to 10 MB.' },
  plan: { attr: '.csv,.json,.txt,.pdf,.png,.jpg,.jpeg,text/csv,application/json,text/plain,application/pdf,image/png,image/jpeg', hint: 'CSV, JSON, text, PDF, PNG or JPG. Spreadsheets: export as CSV first.' },
};

const ERROR_TEXT = {
  'no-bytes': 'That file could not be read. Try choosing it again.',
  empty: 'That file is empty. Choose a file that has content.',
  'size-mismatch': 'The file looks cut short. Try copying it again and re-uploading.',
  'unsupported-type': 'That type of file is not supported. Use a PDF, JPG or PNG (plans can also be CSV, JSON or text).',
  'type-mismatch': 'The file name and its type disagree, so it was not opened. Re-save it in the right format.',
  'spoofed-type': 'The contents do not match the file type, so it was not opened.',
  'binary-content': 'That looks like a binary file, not text. Export it as CSV or text.',
  'too-large': 'That file is too large. Scans, PDFs and images can be up to 10 MB; CSV, JSON and text up to 1 MB.',
  truncated: 'The file looks incomplete. Download or export it again.',
  'too-many-pages': 'That PDF has too many pages (40 at most). Upload just the page with the values.',
  'no-pages': 'That PDF has no readable pages.',
};
const REASON_TEXT = {
  timeout: 'Reading took too long. Try a smaller or clearer file.',
  'ocr-unavailable': 'Reading text from images is not available here.',
  'ocr-failed': 'Text could not be read from the image. A sharper, well-lit screenshot usually works.',
  malformed: 'The PDF could not be read.',
};

const readBytes = (file) => new Promise((resolve, reject) => {
  const viaReader = () => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  };
  if (typeof file.arrayBuffer === 'function') file.arrayBuffer().then((b) => resolve(new Uint8Array(b)), viaReader);
  else viaReader();
});

export default function FileDrop({ accept = 'scan', extract = extractText, onResult, onCancel, idPrefix = 'fd' }) {
  const [status, setStatus] = useState('idle'); // idle | checking | reading | ocr | ready | error
  const [errors, setErrors] = useState([]);
  const [progress, setProgress] = useState(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef(null);
  const run = useRef(0);
  const inputRef = useRef(null);
  const cfg = ACCEPT[accept] || ACCEPT.scan;
  const busy = status === 'checking' || status === 'reading' || status === 'ocr';

  const start = async (file) => {
    run.current += 1;
    const my = run.current;
    const live = () => run.current === my;
    fileRef.current = file;
    setFileName(file.name || 'file');
    setErrors([]);
    setProgress(null);
    setStatus('checking');
    try {
      const bytes = await readBytes(file);
      if (!live()) return;
      const check = validateUpload({ name: file.name, type: file.type, size: file.size, bytes });
      if (!check.ok) {
        setErrors(check.errors.map((e) => ({ code: e.code, text: ERROR_TEXT[e.code] || e.message })));
        setStatus('error');
        return;
      }
      setStatus(check.kind === 'png' || check.kind === 'jpeg' ? 'ocr' : 'reading');
      const payload = { name: file.name, type: file.type, size: file.size, bytes };
      const extraction = await extract(payload, { onProgress: (p) => { if (live() && typeof p === 'number') setProgress(Math.round(p * 100)); } });
      if (!live()) return;
      if (!extraction || extraction.ok === false) {
        const reason = extraction && extraction.reason;
        setErrors([{ code: reason || 'extract-failed', reason, text: REASON_TEXT[reason] || (extraction && extraction.error) || 'The file could not be read.' }]);
        setStatus('error');
        return;
      }
      let fileSha256 = null;
      try { fileSha256 = await sha256Hex(bytes); } catch { fileSha256 = null; }
      if (!live()) return;
      setStatus('ready');
      onResult({ file, bytes, fileSha256, check, extraction });
    } catch {
      if (!live()) return;
      setErrors([{ code: 'extract-failed', text: 'The file could not be processed.' }]);
      setStatus('error');
    }
  };

  const cancel = () => {
    run.current += 1;
    setStatus('idle');
    setErrors([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const STATUS_TEXT = {
    checking: 'Checking file',
    reading: 'Reading text',
    ocr: 'Recognising text (OCR, may take a minute)',
    ready: 'Ready',
  };

  return (
    <div className="fd">
      <div className="fd-pick">
        <input ref={inputRef} id={`${idPrefix}-input`} className="fd-input" type="file" accept={cfg.attr} disabled={busy}
          onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) start(f); }} />
        <label htmlFor={`${idPrefix}-input`} className="btn primary fd-label"><Upload size={15} aria-hidden="true" /> Choose a file</label>
        <div className="hint">{cfg.hint} Files are read on this device first.</div>
      </div>

      <div className="fd-status" role="status" aria-live="polite">
        {status !== 'idle' && status !== 'error' ? (
          <span className="fd-line">
            {status === 'ready' ? <Check size={15} aria-hidden="true" /> : <Loader2 size={15} className="spin" aria-hidden="true" />}
            <span>{STATUS_TEXT[status]}{status === 'ocr' && progress !== null ? ` ${progress}%` : ''}{fileName ? ` - ${fileName}` : ''}</span>
          </span>
        ) : null}
      </div>

      {status === 'error' ? (
        <div role="alert" className="fd-errors">
          {errors.map((e) => <Banner key={e.code} tone="red" icon={AlertTriangle}>{e.text}</Banner>)}
          <div className="btn-row">
            {fileRef.current ? <button type="button" className="btn" onClick={() => start(fileRef.current)}><RotateCcw size={14} aria-hidden="true" /> Try again</button> : null}
            <label htmlFor={`${idPrefix}-input`} className="btn ghost">Choose a different file</label>
          </div>
        </div>
      ) : null}

      {busy ? <div className="btn-row"><button type="button" className="btn ghost" onClick={cancel}><X size={14} aria-hidden="true" /> Cancel</button></div> : null}
      {!busy && onCancel ? <div className="btn-row"><button type="button" className="btn ghost" onClick={onCancel}>Back</button></div> : null}
    </div>
  );
}
