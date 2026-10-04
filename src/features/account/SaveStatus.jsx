// ============================================================
// SaveStatus - the one place the app says whether the person's data is safe.
//
//   Saving...          a write is in flight (never shown as saved yet)
//   Saved on device    the local transaction has COMPLETED
//   Pending sync (n)   saved on device, n changes not yet confirmed by the server
//   Synced             saved on device and every change confirmed
//   Save failed        the device refused the write; the unsaved state is held in
//                      memory and can be retried or exported
// ============================================================
import React from 'react';
import { AlertTriangle, Check, Cloud, CloudOff, Loader2, HardDrive } from 'lucide-react';

export function saveLabel({ status, pending = 0, accountMode = false, online = true }) {
  if (status === 'failed') return { text: 'Save failed', tone: 'red', icon: AlertTriangle };
  if (status === 'saving') return { text: 'Saving…', tone: 'amber', icon: Loader2 };
  if (!accountMode) return { text: 'Saved on device', tone: 'green', icon: HardDrive };
  if (pending > 0) return { text: `Pending sync (${pending})`, tone: 'amber', icon: online ? Cloud : CloudOff };
  return { text: 'Synced', tone: 'green', icon: Check };
}

export function SaveStatusPill(props) {
  const { text, tone, icon: Icon } = saveLabel(props);
  return (
    <span className={`save-pill ${tone}`} role="status" aria-live="polite" title={text}>
      <Icon size={13} aria-hidden="true" className={props.status === 'saving' ? 'spin' : ''} />
      <span>{text}</span>
    </span>
  );
}

const REASON = {
  quota: 'This device is out of storage, so nothing you log is being saved.',
  unavailable: 'This browser is blocking storage, so nothing you log is being saved.',
  aborted: 'The last save was interrupted.',
};

// Persistent until the next successful write: everything logged since the
// failure exists only in memory and closing the tab ends it.
export function SaveFailureBanner({ reason, onRetry, onExport }) {
  return (
    <div className="sync-toast error persistent" role="alert">
      <AlertTriangle size={15} aria-hidden="true" />
      <span>
        {REASON[reason] || 'This device is not saving your logs.'}{' '}
        Export a backup before closing the app.
      </span>
      <span className="toast-actions">
        <button className="btn xs" onClick={onRetry}>Retry</button>
        <button className="btn xs" onClick={onExport}>Export backup</button>
      </span>
    </div>
  );
}

export function UpdateBanner({ onUpdate, onDismiss }) {
  return (
    <div className="sync-toast" role="status">
      <span>A new version is ready. Update when you are between sets.</span>
      <span className="toast-actions">
        <button className="btn xs primary" onClick={onUpdate}>Update</button>
        <button className="btn xs ghost" onClick={onDismiss}>Later</button>
      </span>
    </div>
  );
}
