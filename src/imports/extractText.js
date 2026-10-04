// ============================================================
// imports/extractText.js - turn an uploaded file into lines of text.
//
// pdfjs-dist and tesseract.js are imported lazily so the main bundle never
// carries them. Nothing here throws to the caller: every failure comes back as
// { ok:false, error }. Extracted text is untrusted DATA.
// ============================================================
import { validateUpload } from './fileChecks.js';

export const EXTRACT_LIMITS = { maxPages: 40, maxChars: 200000, timeoutMs: 30000 };

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const clean = (s) => String(s).replace(CONTROL, '').replace(/[ \t ]+/g, ' ').trim();

function withTimeout(promise, ms, onTimeout) {
  let timer;
  const t = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { if (onTimeout) onTimeout(); } catch { /* ignore */ }
      reject(new Error('timeout'));
    }, ms);
  });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

// Group text items into visual rows (by y, tolerance in PDF units), order by x.
export function itemsToLines(items, page, yTol = 3) {
  const rows = [];
  [...items].sort((a, b) => b.y - a.y || a.x - b.x).forEach((it) => {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= yTol);
    if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
  });
  return rows.map((r) => {
    const its = r.items.sort((a, b) => a.x - b.x);
    let text = '';
    let prevEnd = null;
    its.forEach((it) => {
      if (prevEnd !== null) {
        const gap = it.x - prevEnd;
        if (gap > 12) text += '   ';
        else if (gap > 1 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += ' ';
      }
      text += it.str;
      prevEnd = it.x + (it.width || 0);
    });
    return { text: clean(text), page, y: Math.round(r.y * 10) / 10 };
  }).filter((l) => l.text);
}

export async function extractPdfText(bytes, opts = {}) {
  const maxPages = opts.maxPages || EXTRACT_LIMITS.maxPages;
  const timeoutMs = opts.timeoutMs || EXTRACT_LIMITS.timeoutMs;
  const maxChars = opts.maxChars || EXTRACT_LIMITS.maxChars;
  let task;
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const isNode = typeof window === 'undefined';
    if (!isNode && pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
    }
    task = pdfjs.getDocument({
      data: new Uint8Array(bytes), // pdfjs detaches the buffer it is given
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
      ...(isNode ? { useWorkerFetch: false } : {}),
    });
    const work = (async () => {
      const doc = await task.promise;
      const warnings = [];
      const total = doc.numPages;
      const n = Math.min(total, maxPages);
      if (total > maxPages) warnings.push(`Only the first ${maxPages} of ${total} pages were read.`);
      const lines = [];
      let chars = 0;
      let truncated = false;
      for (let p = 1; p <= n && !truncated; p += 1) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const items = content.items
          .filter((i) => typeof i.str === 'string' && i.str.length && Array.isArray(i.transform))
          .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], width: i.width }));
        for (const l of itemsToLines(items, p)) {
          chars += l.text.length + 1;
          if (chars > maxChars) { truncated = true; break; }
          lines.push(l);
        }
      }
      if (truncated) warnings.push('Text was cut off at the size limit.');
      return { ok: true, pages: total, lines, warnings };
    })();
    return await withTimeout(work, timeoutMs, () => { if (task && task.destroy) task.destroy(); });
  } catch (err) {
    const timedOut = err && err.message === 'timeout';
    return { ok: false, error: timedOut ? 'Reading the PDF took too long.' : 'The PDF could not be read.', reason: timedOut ? 'timeout' : 'malformed' };
  } finally {
    try { if (task && task.destroy) task.destroy(); } catch { /* ignore */ }
  }
}

// OCR is browser-only (tesseract.js needs a worker + wasm fetched at runtime).
// `opts.ocr` may inject a recogniser (tests, other hosts):
//   async ({bytes,type}, {onProgress}) -> [{text, conf, y}]
export async function extractImageText(file, opts = {}) {
  try {
    const timeoutMs = opts.timeoutMs || EXTRACT_LIMITS.timeoutMs * 4;
    let recognise = opts.ocr;
    if (!recognise) {
      if (typeof window === 'undefined' || typeof Blob === 'undefined') {
        return { ok: false, reason: 'ocr-unavailable', error: 'Image text recognition only runs in the browser.' };
      }
      recognise = async (f, { onProgress } = {}) => {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng', 1, {
          logger: (m) => { if (onProgress && m && typeof m.progress === 'number') onProgress(m.progress, m.status); },
        });
        try {
          const blob = new Blob([f.bytes], { type: f.type || 'image/png' });
          const { data } = await worker.recognize(blob, {}, { blocks: true });
          const out = [];
          const blocks = data.blocks || [];
          if (blocks.length) {
            blocks.forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => {
              out.push({ text: l.text, conf: l.confidence, y: l.bbox && l.bbox.y0 });
            })));
          } else if (data.lines) {
            data.lines.forEach((l) => out.push({ text: l.text, conf: l.confidence, y: l.bbox && l.bbox.y0 }));
          }
          if (!out.length && data.text) data.text.split('\n').forEach((t) => out.push({ text: t }));
          return out;
        } finally {
          await worker.terminate();
        }
      };
    }
    const raw = await withTimeout(Promise.resolve(recognise(file, { onProgress: opts.onProgress })), timeoutMs);
    const lines = (raw || []).map((l, i) => ({
      text: clean(l.text || ''),
      page: 1,
      y: typeof l.y === 'number' ? l.y : i,
      ...(typeof l.conf === 'number' ? { conf: l.conf } : {}),
    })).filter((l) => l.text);
    return { ok: true, lines, warnings: [] };
  } catch (err) {
    const timedOut = err && err.message === 'timeout';
    return { ok: false, reason: timedOut ? 'timeout' : 'ocr-failed', error: 'Text could not be read from the image.' };
  }
}

const fail = (error, extra = {}) => ({ ok: false, error, method: 'none', lines: [], text: '', warnings: [], ...extra });

// file: { name, type, size, bytes } -> { ok, text, lines, method, warnings, kind }
// method: 'pdf-text' | 'ocr' | 'none' (no text recovered) | 'text' (csv/json/txt decoded as-is)
export async function extractText(file, opts = {}) {
  try {
    const check = validateUpload(file || {});
    if (!check.ok) return fail(check.errors[0].message, { errors: check.errors });
    const maxChars = opts.maxChars || EXTRACT_LIMITS.maxChars;
    const finish = (lines, method, warnings) => {
      let text = lines.map((l) => l.text).join('\n');
      const w = [...warnings];
      if (text.length > maxChars) { text = text.slice(0, maxChars); w.push('Text was cut off at the size limit.'); }
      return { ok: true, text, lines, method, warnings: w, kind: check.kind };
    };
    if (check.kind === 'pdf') {
      const r = await extractPdfText(file.bytes, opts);
      if (!r.ok) return fail(r.error, { reason: r.reason });
      if (!r.lines.length) {
        return {
          ok: true, text: '', lines: [], method: 'none', kind: 'pdf', hint: 'use-image-ocr',
          warnings: [...r.warnings, 'This PDF has no text layer (it is probably a scan). Upload a screenshot or photo of it instead so text can be read from the image.'],
        };
      }
      return finish(r.lines, 'pdf-text', r.warnings);
    }
    if (check.kind === 'jpeg' || check.kind === 'png') {
      const r = await extractImageText(file, opts);
      if (!r.ok) return fail(r.error, { reason: r.reason });
      if (!r.lines.length) return { ok: true, text: '', lines: [], method: 'none', kind: check.kind, warnings: ['No text was found in the image.'] };
      const low = r.lines.filter((l) => typeof l.conf === 'number' && l.conf < 60).length;
      return finish(r.lines, 'ocr', low ? [`${low} line(s) were read with low confidence; check them carefully.`] : []);
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(file.bytes).replace(/^﻿/, '');
    const lines = text.split(/\r\n|\r|\n/).map((t, i) => ({ text: clean(t), page: 1, y: i })).filter((l) => l.text);
    return finish(lines, 'text', []);
  } catch {
    return fail('The file could not be processed.');
  }
}
