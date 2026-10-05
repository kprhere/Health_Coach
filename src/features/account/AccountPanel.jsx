// ============================================================
// AccountPanel - sync state, conflicts, backup and recovery, privacy, sign out,
// export and permanent deletion. Honest about what is and is not protected;
// with accounts switched off it says so and never fakes a login.
// ============================================================
import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, Check, CloudOff, Download, History, Info, LogOut, RefreshCw, Shield, Trash2,
} from 'lucide-react';
import { SaveStatusPill, saveLabel } from './SaveStatus.jsx';
import { listSnapshots as defaultListSnapshots, snapshot as defaultSnapshot } from '../../storage.js';
import './account.css';

export const PRIVACY_COPY = [
  'Cloud sync is not end-to-end encrypted. Your records travel over an encrypted connection, but they are stored in a form the server can read, so whoever runs the server can read them.',
  'The older encrypted Cloudflare sync is a separate, independent backup. Accounts do not change it, and it does not read from the account.',
];

export const DELETE_COPY = 'Records you delete in the app are soft-deleted: they stay on the server for 30 days so the deletion can reach your other devices, then are purged. Permanently deleting your account removes every record and every uploaded file (scan photos, PDFs) from the server. This cannot be undone. The copy on this device is not removed by it, so export a backup first.';

const COUNT_LABELS = {
  scans: 'scans', workouts: 'workouts', meals: 'meal days', habits: 'habit days', watch: 'watch days',
  supplements: 'supplement days', exerciseNotes: 'notes', customExercises: 'custom exercises',
};
const countText = (counts) => Object.entries(counts || {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${COUNT_LABELS[k] || k}`).join(', ') || 'no logged records';

const fmtTime = (ms) => {
  if (!ms) return null;
  try { return new Date(ms).toLocaleString(); } catch { return null; }
};

// A short, safe view of one side of a conflict.
function describeSide(rec) {
  if (!rec) return 'No data (this side was rolled back with its group).';
  if (rec.deleted || rec.deletedAt) return 'Deleted';
  let text;
  try { text = JSON.stringify(rec.data, null, 1); } catch { text = String(rec.data); }
  return text && text.length > 600 ? `${text.slice(0, 600)}\n...` : (text || 'Empty');
}

export function statusChip({ cloud, enabled, pending }) {
  const st = cloud && enabled ? cloud.status : 'disabled';
  switch (st) {
    case 'offline': return { text: pending ? `Offline: ${pending} change${pending === 1 ? '' : 's'} waiting` : 'Offline', tone: 'amber', icon: CloudOff };
    case 'conflict': return { text: `Needs your decision (${(cloud.conflicts || []).length})`, tone: 'amber', icon: AlertTriangle };
    case 'failed': return { text: 'Sync problem: will retry', tone: 'red', icon: AlertTriangle };
    case 'signed-out': return { text: pending ? `Signed out, ${pending} unsynced` : 'Signed out', tone: pending ? 'amber' : '', icon: LogOut };
    case 'synced': case 'pending': return { ...saveLabel({ status: 'saved', pending: st === 'pending' ? Math.max(1, pending) : pending, accountMode: true }) };
    default: return { ...saveLabel({ status: 'saved', accountMode: false }) };
  }
}

function Note({ tone = '', icon: Icon = Info, role, children }) {
  return (
    <div className={`acct-note ${tone}`} role={role}>
      <Icon size={16} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export default function AccountPanel({
  state, accountInfo = {}, cloud, enabled = false, saveStatus = 'saved', outbox,
  onExport, onExportAccount, onDeleteAccount, onRestoreSnapshot, onOpenLogin, onStartMove, onSignedOut,
  listSnapshotsFn = defaultListSnapshots, snapshotFn = defaultSnapshot,
}) {
  const signedIn = !!(cloud && cloud.session);
  const pending = (cloud && cloud.pendingCount) || 0;
  const conflicts = (cloud && cloud.conflicts) || [];
  const chip = statusChip({ cloud, enabled, pending });
  const ChipIcon = chip.icon;

  const [note, setNote] = useState(null); // { tone, msg }
  const [snapKey, setSnapKey] = useState(0);
  const snaps = useMemo(() => { try { return listSnapshotsFn(); } catch { return []; } }, [listSnapshotsFn, snapKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [restoring, setRestoring] = useState(null);
  const [signOutWarn, setSignOutWarn] = useState(null); // { pendingCount }
  const [busy, setBusy] = useState(null);
  const [deleteText, setDeleteText] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const say = (tone, msg) => setNote({ tone, msg });

  const run = async (name, fn) => {
    setBusy(name);
    try { return await fn(); } finally { setBusy(null); }
  };

  const doExport = () => run('export', async () => {
    try {
      const r = onExport ? await onExport() : null;
      if (r && r.ok === false) say('red', 'The backup could not be created.'); else say('green', 'Backup file created.');
    } catch { say('red', 'The backup could not be created.'); }
  });

  const resolve = (c, choice) => run(`resolve:${c.id || c.opId}`, async () => {
    const id = c.id || `c:${c.opId}`;
    try {
      const fn = cloud && cloud.resolveConflict ? cloud.resolveConflict : (outbox ? (i, ch) => outbox.resolveConflict(i, ch) : null);
      if (!fn) { say('red', 'Conflicts cannot be resolved right now.'); return; }
      const r = await fn(id, choice);
      if (r && r.ok === false) say('red', 'That conflict could not be resolved. Nothing was changed.');
      else say('green', choice === 'local' ? 'Kept your version. It will sync now.' : 'Kept the other version.');
    } catch { say('red', 'That conflict could not be resolved. Nothing was changed.'); }
  });

  const restore = (key) => run('restore', async () => {
    try {
      snapshotFn('before-restore', state);
      const r = onRestoreSnapshot ? await onRestoreSnapshot(key) : null;
      if (r && r.ok === false) say('red', 'That snapshot could not be restored. Your current data was not changed.');
      else say('green', 'Restored. The data you replaced was snapshotted first.');
    } catch { say('red', 'That snapshot could not be restored. Your current data was not changed.'); }
    setRestoring(null);
    setSnapKey((k) => k + 1);
  });

  const signOut = (force) => run('signout', async () => {
    const r = await cloud.logout({ force });
    if (r && r.ok) { setSignOutWarn(null); say('green', 'Signed out. Your data on this device is kept.'); if (onSignedOut) onSignedOut(r); return; }
    if (r && (r.reason === 'pending-changes' || r.reason === 'pending-unknown')) { setSignOutWarn({ pendingCount: r.pendingCount }); return; }
    say('red', 'Sign-out could not be completed. You are still signed in.');
  });

  const syncNow = () => run('sync', async () => {
    const r = await cloud.syncNow();
    if (r && r.ok) say('green', 'Synced.'); else say('amber', 'Could not sync yet. Your changes are kept and will be retried.');
  });

  const doDelete = () => run('delete', async () => {
    try {
      const r = await onDeleteAccount();
      if (r && r.ok === false) say('red', 'The account was not deleted. Nothing was removed.');
      else say('green', 'Account deletion requested.');
    } catch { say('red', 'The account was not deleted. Nothing was removed.'); }
    setDeleteText('');
    setDeleteOpen(false);
  });

  return (
    <section className="acct" aria-labelledby="acct-title">
      <div className="acct-row between">
        <h2 id="acct-title">Account</h2>
        {saveStatus === 'failed' ? <SaveStatusPill status="failed" /> : (
          <span className={`acct-chip ${chip.tone}`} role="status" aria-live="polite">
            <ChipIcon size={13} aria-hidden="true" /><span>{chip.text}</span>
          </span>
        )}
      </div>

      {note ? <Note tone={note.tone} icon={note.tone === 'red' || note.tone === 'amber' ? AlertTriangle : Check} role={note.tone === 'red' ? 'alert' : 'status'}><p>{note.msg}</p></Note> : null}

      {/* ---------- sync status ---------- */}
      {!enabled ? (
        <Note tone="amber" role="status">
          <p><strong>Accounts are not enabled on this install.</strong></p>
          <p className="acct-sub">Everything below that is local still works: your data is saved on this device. To turn accounts on, follow docs/SETUP_SUPABASE.md.</p>
        </Note>
      ) : (
        <div className="acct-section">
          <h3>Sync</h3>
          <p>
            {accountInfo.label ? <strong>{accountInfo.label}</strong> : null}
            {accountInfo.userTag ? <span className="acct-sub"> {accountInfo.userTag}</span> : null}
            {!accountInfo.label && !accountInfo.userTag ? 'Using this device without an account.' : null}
          </p>
          <p className="acct-sub">
            {cloud && cloud.lastSyncAt ? `Last synced ${fmtTime(cloud.lastSyncAt)}.` : (signedIn ? 'Not synced yet in this session.' : 'Not signed in, so nothing is synced.')}
            {' '}{pending ? `${pending} change${pending === 1 ? '' : 's'} not yet confirmed by the server.` : ''}
          </p>
          {cloud && cloud.error ? (
            <Note tone={cloud.error.code === 'session-expired' ? 'amber' : ''} role="alert"><p>{cloud.error.message}</p></Note>
          ) : null}
          {cloud && cloud.needsAccountSwitch ? (
            <Note tone="amber" role="status"><p>You are signed in to a different account than the one open on this device. Switch accounts to sync.</p></Note>
          ) : null}
          <div className="acct-actions">
            {signedIn ? <button type="button" className="btn" onClick={syncNow} disabled={busy === 'sync'}><RefreshCw size={16} aria-hidden="true" /> Sync now</button> : null}
            {!signedIn && onOpenLogin ? <button type="button" className="btn primary" onClick={onOpenLogin}>Sign in with an access code</button> : null}
            {signedIn && onStartMove ? <button type="button" className="btn" onClick={onStartMove}>Move my on-device data to this account</button> : null}
          </div>
        </div>
      )}

      {/* ---------- conflicts ---------- */}
      {enabled && conflicts.length ? (
        <div className="acct-section" aria-labelledby="acct-conflicts">
          <h3 id="acct-conflicts">Changes that clash ({conflicts.length})</h3>
          <p className="acct-sub">The same record changed here and on the server. Neither version has been overwritten. Choose which to keep; the other is discarded.</p>
          <ul className="acct-list">
            {conflicts.map((c) => {
              const id = c.id || c.opId;
              const where = `${(c.collection || (c.local && c.local.collection) || 'record')} / ${(c.key || (c.local && c.local.key) || '')}`;
              return (
                <li key={id} className="acct-item">
                  <div><strong>{where}</strong>{c.reason === 'group-rolled-back' ? <span className="acct-sub"> (held because another change in the same action clashed)</span> : null}</div>
                  <details>
                    <summary>Compare both versions</summary>
                    <div className="acct-two">
                      <div><div className="acct-hint">Yours (this device)</div><pre>{describeSide(c.local)}</pre></div>
                      <div><div className="acct-hint">Theirs (server)</div><pre>{describeSide(c.server)}</pre></div>
                    </div>
                  </details>
                  <div className="acct-actions">
                    <button type="button" className="btn" disabled={!!busy} onClick={() => resolve(c, 'local')} aria-label={`Keep mine for ${where}`}>Keep mine</button>
                    <button type="button" className="btn" disabled={!!busy || c.reason === 'group-rolled-back'} onClick={() => resolve(c, 'server')} aria-label={`Keep theirs for ${where}`}>Keep theirs</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* ---------- backup and recovery ---------- */}
      <div className="acct-section" aria-labelledby="acct-backup">
        <h3 id="acct-backup">Backup and recovery</h3>
        <p className="acct-sub">An export file restores everything on any device. Local snapshots are taken automatically before anything that could remove data; the newest few are kept in this browser, which can erase them if site data is cleared.</p>
        <div className="acct-actions">
          <button type="button" className="btn" onClick={doExport} disabled={busy === 'export'}><Download size={16} aria-hidden="true" /> Export backup</button>
        </div>
        <h4 style={{ margin: 'var(--sp-4) 0 var(--sp-2)', fontSize: 'var(--fs-md)' }}>Snapshots on this device</h4>
        {snaps.length === 0 ? (
          <p className="acct-sub">No snapshots yet. One is taken automatically before a reset, an import or a restore.</p>
        ) : (
          <ul className="acct-list">
            {snaps.map((s) => (
              <li key={s.key} className="acct-item">
                <div className="acct-row between">
                  <div>
                    <div><History size={14} aria-hidden="true" /> {fmtTime(s.at) || 'Unknown time'} <span className="acct-sub">({s.reason})</span></div>
                    <div className="acct-sub">{countText(s.counts)}</div>
                  </div>
                  {restoring === s.key ? null : <button type="button" className="btn xs" onClick={() => setRestoring(s.key)} aria-label={`Restore snapshot from ${fmtTime(s.at) || s.key}`}>Restore</button>}
                </div>
                {restoring === s.key ? (
                  <div role="alert" className="acct-note amber" style={{ marginTop: 'var(--sp-2)' }}>
                    <AlertTriangle size={16} aria-hidden="true" />
                    <div>
                      <p>Replace what is on this device with this snapshot? Your current data is snapshotted first, so this can be undone.</p>
                      <div className="acct-actions">
                        <button type="button" className="btn amber" disabled={!!busy} onClick={() => restore(s.key)}>Yes, restore</button>
                        <button type="button" className="btn ghost" onClick={() => setRestoring(null)}>Cancel</button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- privacy ---------- */}
      <div className="acct-section" aria-labelledby="acct-privacy">
        <h3 id="acct-privacy"><Shield size={15} aria-hidden="true" /> Privacy</h3>
        {PRIVACY_COPY.map((t) => <p key={t}>{t}</p>)}
        <p className="acct-sub">Without an account, your data stays in this browser only. Browsers can delete it, so export regularly.</p>
      </div>

      {/* ---------- sign out ---------- */}
      {enabled && signedIn ? (
        <div className="acct-section" aria-labelledby="acct-signout">
          <h3 id="acct-signout">Sign out</h3>
          <p className="acct-sub">Signing out keeps your data on this device. It stops syncing until you sign in again.</p>
          {signOutWarn ? (
            <div className="acct-note amber" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <div>
                <p><strong>{signOutWarn.pendingCount != null ? `${signOutWarn.pendingCount} change${signOutWarn.pendingCount === 1 ? ' has' : 's have'} not reached the server.` : 'Unsynced changes could not be counted.'}</strong></p>
                <p>If you sign out now they stay on this device only and will sync the next time you sign in to this account. Clearing this browser's data before then would lose them.</p>
                <div className="acct-actions">
                  <button type="button" className="btn primary" onClick={async () => { await syncNow(); setSignOutWarn(null); }} disabled={!!busy}>Sync now</button>
                  <button type="button" className="btn danger" onClick={() => signOut(true)} disabled={!!busy}>Sign out anyway</button>
                  <button type="button" className="btn ghost" onClick={() => setSignOutWarn(null)}>Stay signed in</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="acct-actions"><button type="button" className="btn" onClick={() => signOut(false)} disabled={!!busy}><LogOut size={16} aria-hidden="true" /> Sign out</button></div>
          )}
        </div>
      ) : null}

      {/* ---------- account export and deletion ---------- */}
      {enabled && signedIn && (onExportAccount || onDeleteAccount) ? (
        <div className="acct-section danger" aria-labelledby="acct-data">
          <h3 id="acct-data">Your account data</h3>
          {onExportAccount ? (
            <div className="acct-actions" style={{ marginTop: 0 }}>
              <button type="button" className="btn" onClick={() => run('export-account', async () => {
                try { const r = await onExportAccount(); if (r && r.ok === false) say('red', 'The account export failed.'); else say('green', 'Account export created.'); } catch { say('red', 'The account export failed.'); }
              })} disabled={!!busy}><Download size={16} aria-hidden="true" /> Export account data</button>
            </div>
          ) : null}
          {onDeleteAccount ? (
            <>
              <p style={{ marginTop: 'var(--sp-3)' }}>{DELETE_COPY}</p>
              {!deleteOpen ? (
                <div className="acct-actions"><button type="button" className="btn danger" onClick={() => setDeleteOpen(true)}><Trash2 size={16} aria-hidden="true" /> Delete my account</button></div>
              ) : (
                <div>
                  <div className="acct-field">
                    <label htmlFor="delete-confirm">Type DELETE to confirm</label>
                    <input id="delete-confirm" className="input" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" spellCheck={false} autoCapitalize="characters" />
                  </div>
                  <div className="acct-actions">
                    <button type="button" className="btn danger" disabled={deleteText !== 'DELETE' || !!busy} onClick={doDelete}>Permanently delete account</button>
                    <button type="button" className="btn ghost" onClick={() => { setDeleteOpen(false); setDeleteText(''); }}>Cancel</button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

