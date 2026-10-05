// ============================================================
// MoveDataFlow - the explicit, confirmed copy of on-device data into a cloud
// account. Never automatic, never merges one person's data into another's.
//
//   preview  ->  confirm  ->  snapshot -> copy -> sync -> read back + compare  ->  complete
//
// "Complete" (onComplete) fires ONLY after the account has been read back from
// the server and every record's hash matches. On any failure nothing on this
// device is changed, and recovery options (retry, export, stay local) are shown.
// The logic lives in cloud/useCloudSync.js (previewMove, runMove).
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Circle, Loader2, ShieldAlert } from 'lucide-react';
import { previewMove, runMove } from '../../cloud/useCloudSync.js';
import { snapshot as defaultSnapshot } from '../../storage.js';
import './account.css';

const KINDS = [
  ['workouts', 'Workout days'], ['meals', 'Meal days'], ['scans', 'Body scans'], ['habits', 'Habit days'],
  ['watch', 'Watch / health days'], ['supplements', 'Supplement days'], ['exerciseNotes', 'Exercise notes'], ['customExercises', 'Custom exercises'],
];

const STEPS = [
  ['snapshot', 'Save a safety snapshot of this device'],
  ['check', 'Check what the account already holds'],
  ['copy', 'Queue your records for upload'],
  ['sync', 'Upload and wait for the server to confirm'],
  ['verify', 'Read everything back and compare'],
];

export const FAILURE_COPY = {
  'snapshot-failed': 'A safety snapshot could not be saved. Export a backup, then try again.',
  offline: 'The connection dropped. Records already queued are safe on this device. Retry to continue.',
  'not-drained': 'Some records are still waiting to upload. Retry to continue.',
  conflicts: 'The account changed while copying, so some records conflict. Nothing was overwritten. Resolve them in Account, then retry.',
  'verify-mismatch': 'The account does not match your on-device data, so this is NOT marked complete.',
  'session-expired': 'Your sign-in ended. Sign in again, then retry.',
  'populated-account': 'This account already holds data and it is not confirmed to be yours.',
  'local-write-failed': 'This device could not write the upload queue. Free up storage or export a backup, then retry.',
  'wrong-account': 'The wrong account was selected. Nothing was changed.',
};

const Count = ({ n }) => <span className="num">{n}</span>;

export default function MoveDataFlow({
  localState, destination, destStore, cloud, sameOwner = false, onComplete, onCancel, onExport,
  runner = runMove, snapshotFn = defaultSnapshot,
}) {
  const [phase, setPhase] = useState('loading'); // loading | needs-signin | preview | running | failed | done
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [mergeOk, setMergeOk] = useState(false);
  const [exported, setExported] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [step, setStep] = useState(null);
  const [progress, setProgress] = useState(null);
  const [failure, setFailure] = useState(null);
  const [result, setResult] = useState(null);
  const attempted = useRef(false); // a previous run may have left this person's own records in the account
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const label = (destination && (destination.label || destination.userTag)) || 'this account';
  const signedIn = !!(cloud && cloud.session && destination && cloud.session.userId === destination.accountId);

  const load = useCallback(async () => {
    setLoadError(null);
    if (!signedIn) { setPhase('needs-signin'); return; }
    setPhase('loading');
    try {
      const records = await cloud.readRemote();
      if (!alive.current) return;
      setPreview(previewMove({ localState, remoteRecords: records, sameOwner: sameOwner || attempted.current }));
      setPhase('preview');
    } catch (e) {
      if (!alive.current) return;
      setLoadError(e && e.code === 'SESSION_EXPIRED' ? 'Your sign-in ended. Sign in again.' : 'Could not read the account. Check your connection and try again. Nothing was changed.');
      setPhase('needs-signin');
    }
  }, [cloud, localState, sameOwner, signedIn]);

  useEffect(() => { load(); }, [load]);

  const doExport = async () => {
    setExportError(null);
    try {
      const r = onExport ? await onExport() : null;
      if (r && r.ok === false) setExportError('The backup could not be created.'); else setExported(true);
    } catch { setExportError('The backup could not be created.'); }
  };

  const start = async () => {
    setFailure(null);
    setStep('snapshot');
    setProgress(null);
    setPhase('running');
    const res = await runner({
      localState, destination, destStore,
      sync: () => cloud.syncNow(), readRemote: () => cloud.readRemote(),
      takeSnapshot: snapshotFn, allowMerge: mergeOk, sameOwner: sameOwner || attempted.current, allowNoSnapshot: exported,
      onProgress: (p) => {
        if (!alive.current) return;
        if (p.step === 'copy') attempted.current = true;
        setStep(p.step);
        setProgress(p);
      },
    });
    if (!alive.current) return;
    if (res && res.ok) {
      setResult(res);
      setPhase('done');
      // Only now, after read-back verification, is the move recorded as complete.
      if (onComplete) onComplete(res.completion);
    } else {
      setFailure(res || { code: 'unexpected' });
      setPhase('failed');
    }
  };

  const blocked = !!(preview && preview.blocked);
  const canStart = phase === 'preview' && !!preview && confirmed && (!blocked || mergeOk);

  return (
    <section className="acct" aria-labelledby="move-title">
      <h2 id="move-title">Move my data to {label}</h2>
      <p className="acct-sub">
        This copies what is on this device into the account. It is never done automatically, nothing on this device is
        deleted or changed, and the account is read back and compared before it is called complete.
      </p>
      <div className="acct-note" role="status">
        <ShieldAlert size={16} aria-hidden="true" />
        <p>Destination: <strong>{label}</strong>{destination && destination.userTag && destination.label ? ` (${destination.userTag})` : ''}. Make sure this is your own account.</p>
      </div>

      {phase === 'loading' ? <p role="status"><Loader2 size={14} className="acct-spin" aria-hidden="true" /> Checking what the account holds</p> : null}

      {phase === 'needs-signin' ? (
        <div className="acct-note amber" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <p>{loadError || `Sign in to ${label} first.`}</p>
          {loadError ? <button type="button" className="btn xs" onClick={load}>Try again</button> : null}
        </div>
      ) : null}

      {phase === 'preview' && preview ? (
        <>
          <table className="acct-table">
            <caption>Records, on this device and in the account</caption>
            <thead><tr><th scope="col">Type</th><th scope="col" className="num">On this device</th><th scope="col" className="num">In {label}</th></tr></thead>
            <tbody>
              {KINDS.map(([k, name]) => (
                <tr key={k}><th scope="row">{name}</th><td className="num"><Count n={preview.local[k]} /></td><td className="num"><Count n={preview.remote[k]} /></td></tr>
              ))}
            </tbody>
          </table>

          {!preview.localHasHistory ? (
            <div className="acct-note" role="status"><Circle size={16} aria-hidden="true" /><p>There are no logged days on this device yet. Only settings and plan would be copied.</p></div>
          ) : null}

          {blocked ? (
            <div className="acct-note red" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <div>
                <p><strong>This account already holds data, and it is not confirmed to be yours.</strong> Replacing it is not offered. Nothing has been changed.</p>
                <p>If this really is your own account, you can add only the records it is missing. Anything it already holds stays as it is; any of yours that clash are left on this device.</p>
                <div className="acct-check">
                  <input id="merge-ok" type="checkbox" checked={mergeOk} onChange={(e) => setMergeOk(e.target.checked)} />
                  <label htmlFor="merge-ok">This is my account. Add only what is missing and never replace anything.</label>
                </div>
              </div>
            </div>
          ) : null}
          {preview.kind === 'same-owner' || preview.kind === 'light' ? (
            <div className="acct-note" role="status"><Circle size={16} aria-hidden="true" /><p>The account already has some records. Only records it lacks will be added; nothing it holds will be overwritten.</p></div>
          ) : null}

          <div className="acct-check">
            <input id="move-confirm" type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <label htmlFor="move-confirm">Copy my on-device data to {label}. I have seen the counts above.</label>
          </div>

          <div className="acct-actions">
            <button type="button" className="btn primary" onClick={start} disabled={!canStart}>Move my data</button>
            <button type="button" className="btn" onClick={doExport}>Export a backup first</button>
            {onCancel ? <button type="button" className="btn ghost" onClick={onCancel}>Stay on this device</button> : null}
          </div>
          {exported ? <p role="status" className="acct-hint">Backup file created.</p> : null}
          {exportError ? <p role="alert" className="acct-err">{exportError}</p> : null}
        </>
      ) : null}

      {phase === 'running' || phase === 'failed' || phase === 'done' ? (
        <ol className="acct-steps" aria-label="Move progress">
          {STEPS.map(([id, text]) => {
            const idx = STEPS.findIndex(([s]) => s === id);
            const cur = STEPS.findIndex(([s]) => s === step);
            let state = idx < cur ? 'done' : idx === cur ? 'active' : 'todo';
            if (phase === 'done') state = 'done';
            if (phase === 'failed' && idx === cur) state = 'failed';
            const Icon = state === 'done' ? Check : state === 'failed' ? AlertTriangle : state === 'active' ? Loader2 : Circle;
            return (
              <li key={id} data-state={state}>
                <Icon size={15} aria-hidden="true" className={state === 'active' ? 'acct-spin' : ''} />
                <span>{text}{state === 'active' && id === 'copy' && progress && progress.of ? ` (${progress.done || 0} of ${progress.of})` : ''}</span>
                <span className="acct-sub">{state === 'done' ? ' done' : state === 'failed' ? ' failed' : ''}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {phase === 'running' ? <p role="status" className="acct-hint">Keep this screen open. Your data on this device is not being changed.</p> : null}

      {phase === 'failed' && failure ? (
        <div className="acct-note red" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <p><strong>{FAILURE_COPY[failure.code] || failure.message || 'The move stopped.'}</strong></p>
            <p>Your on-device data is untouched.{failure.queued ? ' Records already copied stay queued for this account on this device, and a retry continues from there.' : ''}</p>
            {failure.code === 'verify-mismatch' ? <p className="acct-sub">{failure.mismatchCount || 0} record(s) differed or were missing on read-back.</p> : null}
            <div className="acct-actions">
              <button type="button" className="btn primary" onClick={load}>Review and retry</button>
              <button type="button" className="btn" onClick={doExport}>Export a backup</button>
              {onCancel ? <button type="button" className="btn ghost" onClick={onCancel}>Stay on this device</button> : null}
            </div>
            {exported ? <p role="status" className="acct-hint">Backup file created.</p> : null}
            {exportError ? <p role="alert" className="acct-err">{exportError}</p> : null}
          </div>
        </div>
      ) : null}

      {phase === 'done' && result ? (
        <div className="acct-note green" role="status">
          <Check size={16} aria-hidden="true" />
          <div>
            <p><strong>Moved and verified.</strong> The account was read back and {result.copied} record(s) matched.</p>
            {result.skipped && result.skipped.length ? <p>{result.skipped.length} record(s) already in the account were left as they were; yours are still on this device.</p> : null}
            <p className="acct-sub">Your on-device copy is still here. It is not deleted.</p>
            {onCancel ? <div className="acct-actions"><button type="button" className="btn" onClick={onCancel}>Done</button></div> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
