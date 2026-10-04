// ============================================================
// imports-files.test.mjs - upload validation + text extraction.
// All fixtures are SYNTHETIC (invented values, built in code).
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateUpload, sha256Hex, sanitizeFileName, LIMITS } from '../src/imports/fileChecks.js';
import { extractPdfText, extractImageText, extractText } from '../src/imports/extractText.js';

// Hand-written minimal PDF. rows: [{x, y, text}] on one page.
export function buildPdf(rows, { pages = 1 } = {}) {
  const objs = [];
  const content = rows.map((r) => `BT /F1 12 Tf ${r.x} ${r.y} Td (${r.text}) Tj ET`).join('\n');
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const kids = [];
  for (let i = 0; i < pages; i += 1) kids.push(`${4 + i * 2} 0 R`);
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (let i = 0; i < pages; i += 1) {
    const pageNo = 4 + i * 2;
    objs[pageNo] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageNo + 1} 0 R >>`;
    const c = i === 0 ? content : 'BT /F1 12 Tf 72 700 Td (page) Tj ET';
    objs[pageNo + 1] = `<< /Length ${c.length} >>\nstream\n${c}\nendstream`;
  }
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objs.length; i += 1) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i += 1) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

const PNG = () => {
  const b = new Uint8Array(60);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  b.set(Buffer.from('IEND'), 40);
  return b;
};
const JPEG = () => {
  const b = new Uint8Array(40);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  b[38] = 0xff; b[39] = 0xd9;
  return b;
};
const file = (name, type, bytes) => ({ name, type, size: bytes.length, bytes });

const ROWS = [
  { x: 72, y: 700, text: 'Weight' }, { x: 300, y: 700, text: '182.4 lb' },
  { x: 72, y: 680, text: 'Body Fat Percentage' }, { x: 300, y: 680, text: '21.3 %' },
];

test('valid synthetic PDF passes checks and its text layer is extracted row by row', async () => {
  const bytes = buildPdf(ROWS);
  const v = validateUpload(file('scan.pdf', 'application/pdf', bytes));
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.equal(v.kind, 'pdf');
  const r = await extractPdfText(bytes);
  assert.equal(r.ok, true);
  assert.equal(r.lines.length, 2);
  assert.match(r.lines[0].text, /^Weight\s+182\.4 lb$/);
  assert.match(r.lines[1].text, /^Body Fat Percentage\s+21\.3 %$/);
  assert.ok(r.lines[0].y > r.lines[1].y, 'rows keep their vertical positions');
  const via = await extractText(file('scan.pdf', 'application/pdf', bytes));
  assert.equal(via.ok, true);
  assert.equal(via.method, 'pdf-text');
  assert.match(via.text, /Weight/);
});

test('PDF with no text layer reports method none with an OCR hint', async () => {
  const bytes = buildPdf([]);
  const via = await extractText(file('blank.pdf', 'application/pdf', bytes));
  assert.equal(via.ok, true);
  assert.equal(via.method, 'none');
  assert.equal(via.hint, 'use-image-ocr');
  assert.match(via.warnings.join(' '), /no text layer/);
});

test('a PNG renamed .pdf is rejected as spoofed', () => {
  const v = validateUpload(file('scan.pdf', 'application/pdf', PNG()));
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.code === 'spoofed-type'));
  const v2 = validateUpload(file('scan.png', 'image/png', buildPdf(ROWS)));
  assert.ok(v2.errors.some((e) => e.code === 'spoofed-type'));
  const v3 = validateUpload(file('notes.txt', 'text/plain', PNG()));
  assert.ok(v3.errors.some((e) => e.code === 'spoofed-type'));
});

test('declared type and extension disagreeing is rejected', () => {
  const v = validateUpload(file('scan.pdf', 'image/png', PNG()));
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.code === 'type-mismatch'));
});

test('truncated, empty and oversize files are rejected', async () => {
  const full = buildPdf(ROWS);
  const cut = full.slice(0, Math.floor(full.length / 2));
  const v = validateUpload(file('scan.pdf', 'application/pdf', cut));
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.code === 'truncated'));
  assert.equal(validateUpload(file('a.pdf', 'application/pdf', new Uint8Array(0))).errors[0].code, 'empty');
  const big = new Uint8Array(LIMITS.csv + 1).fill(65);
  assert.ok(validateUpload(file('big.csv', 'text/csv', big)).errors.some((e) => e.code === 'too-large'));
  const bigPdf = new Uint8Array(LIMITS.pdf + 1);
  bigPdf.set(Buffer.from('%PDF-1.4'));
  assert.ok(validateUpload(file('big.pdf', 'application/pdf', bigPdf)).errors.some((e) => e.code === 'too-large'));
  // extractText never throws on a truncated file.
  const r = await extractText(file('scan.pdf', 'application/pdf', cut));
  assert.equal(r.ok, false);
  assert.ok(r.error);
  assert.ok(validateUpload(file('x.png', 'image/png', PNG().slice(0, 20))).errors.some((e) => e.code === 'truncated'));
  assert.ok(validateUpload(file('x.jpg', 'image/jpeg', JPEG().slice(0, 20))).errors.some((e) => e.code === 'truncated'));
  assert.equal(validateUpload(file('x.jpg', 'image/jpeg', JPEG())).ok, true);
  assert.equal(validateUpload(file('x.png', 'image/png', PNG())).ok, true);
});

test('too many PDF pages is rejected', () => {
  const v = validateUpload(file('long.pdf', 'application/pdf', buildPdf(ROWS, { pages: 41 })));
  assert.ok(v.errors.some((e) => e.code === 'too-many-pages'));
  assert.equal(validateUpload(file('ok.pdf', 'application/pdf', buildPdf(ROWS, { pages: 40 }))).ok, true);
});

test('garbage that starts like a PDF fails safely in extraction', async () => {
  const bytes = new Uint8Array(Buffer.from('%PDF-1.4\n/Type /Page\nthis is not a pdf at all\n%%EOF\n'));
  const r = await extractText(file('bad.pdf', 'application/pdf', bytes));
  assert.equal(r.ok, false);
  assert.equal(r.method, 'none');
});

test('maxPages limits what is read', async () => {
  const r = await extractPdfText(buildPdf(ROWS, { pages: 3 }), { maxPages: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.lines.length, 2);
  assert.match(r.warnings.join(' '), /first 1 of 3/);
});

test('OCR is unavailable in Node unless injected', async () => {
  const f = file('shot.png', 'image/png', PNG());
  assert.deepEqual(await extractImageText(f), { ok: false, reason: 'ocr-unavailable', error: 'Image text recognition only runs in the browser.' });
  const via = await extractText(f);
  assert.equal(via.ok, false);
  assert.equal(via.reason, 'ocr-unavailable');
  const injected = await extractText(f, { ocr: async () => [{ text: 'Weight 182.4 lb', conf: 91 }, { text: 'Body F4t 2l.3 %', conf: 40 }] });
  assert.equal(injected.ok, true);
  assert.equal(injected.method, 'ocr');
  assert.equal(injected.lines.length, 2);
  assert.match(injected.warnings.join(' '), /low confidence/);
  const boom = await extractText(f, { ocr: async () => { throw new Error('x'); } });
  assert.equal(boom.ok, false);
});

test('csv/json/text files are decoded; BOM stripped; control chars removed', async () => {
  const bytes = new Uint8Array(Buffer.from('﻿Day,Exercise\r\nMon,Back\u0007 Squat\r\n'));
  const r = await extractText(file('plan.csv', 'text/csv', bytes));
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines.map((l) => l.text), ['Day,Exercise', 'Mon,Back Squat']);
  assert.ok(validateUpload(file('bin.csv', 'text/csv', new Uint8Array([65, 0, 66]))).errors.some((e) => e.code === 'binary-content'));
});

test('unknown extensions and unsafe names', () => {
  assert.ok(validateUpload(file('run.exe', 'application/octet-stream', new Uint8Array([77, 90, 1, 2]))).errors.some((e) => e.code === 'unsupported-type'));
  assert.equal(sanitizeFileName('..\\..\\evil/../scan<1>\u0000.pdf'), 'scan_1_.pdf');
  assert.equal(sanitizeFileName(''), 'upload');
  assert.ok(sanitizeFileName('a'.repeat(300) + '.pdf').length <= 100);
});

test('sha256Hex is stable and distinguishes content', async () => {
  const a = await sha256Hex(new Uint8Array([1, 2, 3]));
  assert.equal(a, '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
  assert.notEqual(a, await sha256Hex(new Uint8Array([1, 2, 4])));
});
