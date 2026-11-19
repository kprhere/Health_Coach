import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { listPhotos, savePhoto, deletePhoto, groupByDate, defaultPair, photoFor } from '../src/photoStore.js';

const img = (id, date, pose, addedAt = 1) => ({ id, date, pose, addedAt, bytes: new Uint8Array([1, 2, 3]).buffer, type: 'image/jpeg', w: 3, h: 4 });

test('photos are stored on the device and come back newest first', async () => {
  await savePhoto(img('a', '2026-11-15', 'front'));
  await savePhoto(img('b', '2026-11-29', 'front'));
  await savePhoto(img('c', '2026-11-29', 'side'));
  const all = await listPhotos();
  assert.deepEqual(all.map((p) => p.date), ['2026-11-29', '2026-11-29', '2026-11-15']);
  assert.equal(all[2].id, 'a');
  assert.equal(new Uint8Array(all[0].bytes)[2], 3, 'image bytes survive');
  await deletePhoto('c');
  assert.ok(!(await listPhotos()).some((p) => p.id === 'c'));
});

test('timeline groups one photo per pose per date, and compare defaults to oldest vs newest', () => {
  const photos = [img('1', '2026-11-15', 'front', 1), img('2', '2026-11-15', 'front', 2), img('3', '2026-12-01', 'front'), img('4', '2026-11-15', 'back')];
  const tl = groupByDate(photos);
  assert.deepEqual(tl.map((d) => d.date), ['2026-12-01', '2026-11-15']);
  assert.equal(tl[1].poses.front.id, '2', 'newest photo of a pose that day');
  assert.deepEqual(defaultPair(photos, 'front'), { before: '2026-11-15', after: '2026-12-01' });
  assert.equal(defaultPair(photos, 'back'), null, 'needs two dates');
  assert.equal(photoFor(photos, 'front', '2026-12-01').id, '3');
});
