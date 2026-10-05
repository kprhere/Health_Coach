import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_UPLOAD_BYTES, USER_QUOTA_BYTES, buildUploadPath, pathBelongsTo, sha256Hex, sniffMime, validateUpload,
} from '../src/cloud/uploadChecks.js';

const bytes = (...b) => new Uint8Array([...b, ...new Array(32).fill(0)]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d);

test('magic bytes decide the type, not the declared mime', () => {
  assert.equal(sniffMime(PDF), 'application/pdf');
  assert.equal(sniffMime(JPG), 'image/jpeg');
  assert.equal(sniffMime(PNG), 'image/png');
  assert.equal(sniffMime(bytes(0x4d, 0x5a)), null); // exe
  assert.equal(sniffMime(new TextEncoder().encode('<svg onload=alert(1)>')), null);
  assert.equal(sniffMime(new TextEncoder().encode('%PDF')), null); // needs the dash
  assert.equal(sniffMime(new Uint8Array(0)), null);
  assert.equal(sniffMime(undefined), null);
});

test('validateUpload accepts good files and reports every reason it refuses', () => {
  assert.deepEqual(validateUpload({ bytes: PDF, declaredMime: 'application/pdf', kind: 'plan' }), { ok: true, mime: 'application/pdf', reasons: [] });
  assert.deepEqual(validateUpload({ bytes: JPG, kind: 'scan' }).reasons, []);
  assert.deepEqual(validateUpload({ bytes: JPG, declaredMime: 'application/pdf', kind: 'scan' }).reasons, ['mime-mismatch']);
  assert.deepEqual(validateUpload({ bytes: bytes(1, 2, 3), kind: 'scan' }).reasons, ['unsupported-type']);
  assert.deepEqual(validateUpload({ bytes: PDF, kind: 'avatar' }).reasons, ['unknown-kind']);
  assert.deepEqual(validateUpload({ bytes: new Uint8Array(0), kind: 'scan' }).reasons.sort(), ['empty', 'unsupported-type']);
});

test('size limit is 10 MB and the per-user quota is enforced', () => {
  assert.equal(MAX_UPLOAD_BYTES, 10 * 1024 * 1024);
  assert.equal(USER_QUOTA_BYTES, 150 * 1024 * 1024);
  const edge = validateUpload({ bytes: PNG, size: MAX_UPLOAD_BYTES, kind: 'scan' });
  assert.equal(edge.ok, true);
  assert.deepEqual(validateUpload({ bytes: PNG, size: MAX_UPLOAD_BYTES + 1, kind: 'scan' }).reasons, ['too-large']);
  assert.deepEqual(validateUpload({ bytes: PNG, size: 1000, kind: 'scan', usedBytes: USER_QUOTA_BYTES - 999 }).reasons, ['quota-exceeded']);
  assert.equal(validateUpload({ bytes: PNG, size: 1000, kind: 'scan', usedBytes: USER_QUOTA_BYTES - 1000 }).ok, true);
});

test('upload paths stay inside the owner folder', () => {
  const uid = '11111111-1111-4111-8111-111111111111';
  assert.equal(buildUploadPath(uid, 'scan', 'abc_1', 'image/png'), `${uid}/scan/abc_1.png`);
  assert.equal(buildUploadPath(uid, 'plan', 'p1', 'application/pdf'), `${uid}/plan/p1.pdf`);
  assert.throws(() => buildUploadPath(uid, 'scan', '../x', 'image/png'));
  assert.throws(() => buildUploadPath(uid, 'secret', 'x', 'image/png'));
  assert.throws(() => buildUploadPath(uid, 'scan', 'x', 'text/html'));
  assert.equal(pathBelongsTo(uid, `${uid}/scan/a.png`), true);
  assert.equal(pathBelongsTo(uid, `other/scan/a.png`), false);
  assert.equal(pathBelongsTo(uid, `${uid}/../other/a.png`), false);
  assert.equal(pathBelongsTo(uid, `${uid}`), false);
  assert.equal(pathBelongsTo(uid, `${uid}//a.png`), false);
});

test('sha256Hex matches a known vector', async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
