import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import {
  POSES, listPhotos, savePhoto, deletePhoto, groupByDate, defaultPair, photoFor, prepareImage,
} from './photoStore.js';

// Object URLs for stored photos, revoked when the list changes or unmounts.
function usePhotoUrls(photos) {
  const urls = useMemo(() => {
    const m = new Map();
    photos.forEach((p) => {
      try { m.set(p.id, URL.createObjectURL(new Blob([p.bytes], { type: p.type || 'image/jpeg' }))); } catch { /* skip */ }
    });
    return m;
  }, [photos]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

const pretty = (date) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function ProgressPhotos({ today }) {
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(today);
  const [pose, setPose] = useState('front');
  const [comparePose, setComparePose] = useState('front');
  const [pair, setPair] = useState(null);
  const [split, setSplit] = useState(50);
  const [confirmId, setConfirmId] = useState('');
  const fileRef = useRef(null);
  const urls = usePhotoUrls(photos);

  const refresh = () => listPhotos().then(setPhotos).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const timeline = groupByDate(photos);
  const dates = [...new Set(photos.filter((p) => p.pose === comparePose).map((p) => p.date))].sort();
  const current = pair && dates.includes(pair.before) && dates.includes(pair.after) ? pair : defaultPair(photos, comparePose);
  const before = current && photoFor(photos, comparePose, current.before);
  const after = current && photoFor(photos, comparePose, current.after);

  const onPick = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {
      const img = await prepareImage(file);
      await savePhoto({ id: `${date}-${pose}-${Date.now()}`, date, pose, addedAt: Date.now(), ...img });
      await refresh();
    } catch (e) {
      setError(`${e.message || 'Could not save the photo.'} If storage is full, delete a few old photos and try again.`);
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (confirmId !== id) { setConfirmId(id); return; }
    setConfirmId('');
    await deletePhoto(id).catch((e) => setError(e.message));
    refresh();
  };

  return (
    <div className="photos">
      <div className="card">
        <div className="block-tag"><span className="bar" />Add a progress photo</div>
        <div className="field"><label htmlFor="photo-date">Date</label><input id="photo-date" type="date" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field">
          <label>Pose</label>
          <div className="pill-toggle photo-poses">
            {POSES.map((p) => <button key={p.key} type="button" className={pose === p.key ? 'active' : ''} onClick={() => setPose(p.key)}>{p.label}</button>)}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} aria-label="Choose progress photo" />
        <button className="btn sm primary" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}><Camera size={14} /> {busy ? 'Saving…' : `Add ${POSES.find((p) => p.key === pose).label.toLowerCase()} photo`}</button>
        <div className="hint">Same spot every 2 weeks: morning, before eating, phone at chest height, relaxed. Photos stay on this phone only; they are not in the cloud backup or JSON export.</div>
        {error ? <div className="hint" style={{ color: 'var(--amber)' }}>{error}</div> : null}
      </div>

      <div className="card">
        <div className="block-tag"><span className="bar" />Before / after</div>
        <div>
          <div className="pill-toggle photo-poses" style={{ margin: '8px 0 10px' }}>
            {POSES.map((p) => <button key={p.key} type="button" className={comparePose === p.key ? 'active' : ''} onClick={() => { setComparePose(p.key); setPair(null); }}>{p.label}</button>)}
          </div>
        </div>
        {before && after ? (
          <>
            <div className="field-row cols-2">
              <div className="field"><label htmlFor="cmp-before">Before</label>
                <select id="cmp-before" className="input" value={current.before} onChange={(e) => setPair({ ...current, before: e.target.value })}>
                  {dates.map((d) => <option key={d} value={d}>{pretty(d)}</option>)}
                </select></div>
              <div className="field"><label htmlFor="cmp-after">After</label>
                <select id="cmp-after" className="input" value={current.after} onChange={(e) => setPair({ ...current, after: e.target.value })}>
                  {dates.map((d) => <option key={d} value={d}>{pretty(d)}</option>)}
                </select></div>
            </div>
            <div className="compare" style={{ aspectRatio: `${before.w || 3} / ${before.h || 4}` }}>
              <img src={urls.get(before.id)} alt={`${comparePose} on ${pretty(current.before)}`} />
              <img src={urls.get(after.id)} alt={`${comparePose} on ${pretty(current.after)}`} style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
              <div className="compare-line" style={{ left: `${split}%` }} aria-hidden="true" />
              <span className="compare-tag left">{pretty(current.before)}</span>
              <span className="compare-tag right">{pretty(current.after)}</span>
            </div>
            <input type="range" min="0" max="100" value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Drag to compare before and after" className="compare-range" />
          </>
        ) : (
          <div className="hint">Add {POSES.find((p) => p.key === comparePose).label.toLowerCase()} photos on two different dates to compare them here.</div>
        )}
      </div>

      <div className="card">
        <div className="block-tag"><span className="bar" />Timeline</div>
        {timeline.length ? timeline.map(({ date: d, poses }) => (
          <div key={d} className="photo-day">
            <div className="photo-day-date">{pretty(d)}</div>
            <div className="photo-row">
              {POSES.map((p) => (poses[p.key] ? (
                <figure key={p.key} className="photo-thumb">
                  <img src={urls.get(poses[p.key].id)} alt={`${p.label} on ${pretty(d)}`} loading="lazy" />
                  <figcaption>
                    {p.label}
                    <button className="btn xs ghost" onClick={() => remove(poses[p.key].id)} aria-label={`Delete ${p.label} photo from ${pretty(d)}`}>
                      <Trash2 size={12} /> {confirmId === poses[p.key].id ? 'Tap again' : ''}
                    </button>
                  </figcaption>
                </figure>
              ) : <div key={p.key} className="photo-thumb empty">{p.label}</div>))}
            </div>
          </div>
        )) : <div className="hint">No photos yet. Your first set is the baseline everything is compared to.</div>}
      </div>
    </div>
  );
}
