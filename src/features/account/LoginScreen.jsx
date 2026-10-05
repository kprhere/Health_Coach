// ============================================================
// LoginScreen - access-code sign-in.
//
// The code is the account password. It lives only in this component's state:
// never logged, never written to storage, never put in a URL, cleared on
// success. The shape is checked locally (parseAccessCode) before any network
// call, so a typo never leaves the device.
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Info, Loader2, WifiOff } from 'lucide-react';
import { parseAccessCode } from '../../cloud/accessCode.js';
import './account.css';

// Copy for every login outcome. None of it echoes the code.
export const LOGIN_MESSAGES = {
  'invalid-format': 'That does not look like an access code. It has two parts joined by a dash: 6 characters, then 24 more (letters A to Z and digits 2 to 7). Check for a missing or extra character.',
  'invalid-credentials': 'That code was not accepted. Check it for typos. If it worked before, the owner may have replaced it: ask the owner for a new code.',
  locked: 'This account is locked or its code was replaced. Ask the owner for a new code.',
  network: 'Could not reach the server. Check your connection and try again. Nothing was sent.',
  offline: 'You are offline. Connect and try again. Nothing was sent.',
  disabled: 'Accounts are not enabled on this install.',
  'client-error': 'Sign-in could not start on this device. Reload and try again.',
  'pending-changes': 'You have changes that have not synced yet under the account that is signed in. Sync or export them, or sign out from the Account screen first.',
  'pending-unknown': 'Could not check for unsynced changes, so sign-in was stopped to keep your data safe. Reload and try again.',
};

export const loginMessage = (code) => LOGIN_MESSAGES[code] || 'Sign-in failed. Try again, or ask the owner for a new code.';

function useOnline() {
  const read = () => (typeof navigator === 'undefined' || navigator.onLine !== false);
  const [online, setOnline] = useState(read);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

export default function LoginScreen({ cloud, onSignedIn, onCancel }) {
  const [code, setCode] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const online = useOnline();
  const input = useRef(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const disabled = !cloud || cloud.status === 'disabled';
  const expired = cloud && cloud.error && cloud.error.code === 'session-expired';

  if (disabled) {
    return (
      <section className="acct" aria-labelledby="login-title">
        <h2 id="login-title">Sign in</h2>
        <div className="acct-note amber" role="status">
          <Info size={16} aria-hidden="true" />
          <p>Accounts are not enabled on this install. Everything works on this device without one. Setup steps are in docs/SETUP_SUPABASE.md.</p>
        </div>
        {onCancel ? <div className="acct-actions"><button type="button" className="btn" onClick={onCancel}>Back</button></div> : null}
      </section>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!parseAccessCode(code)) { setError('invalid-format'); input.current && input.current.focus(); return; }
    if (!online) { setError('offline'); return; }
    setBusy(true);
    let res;
    try { res = await cloud.login(code); } catch { res = { ok: false, error: 'network' }; }
    if (!alive.current) return;
    setBusy(false);
    if (res && res.ok) {
      setCode('');
      setReveal(false);
      if (onSignedIn) onSignedIn(res);
    } else {
      setError((res && res.error) || 'invalid-credentials');
      if (input.current) input.current.focus();
    }
  };

  return (
    <section className="acct" aria-labelledby="login-title">
      <h2 id="login-title">Sign in with your access code</h2>
      <p className="acct-sub">
        Signing in does not upload anything. Your logs stay on this device until you choose to move them
        to your account. Using the app without an account stays fully available.
      </p>

      {expired ? (
        <div className="acct-note amber" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <p>{cloud.error.message}</p>
        </div>
      ) : null}
      {!online ? (
        <div className="acct-note amber" role="status">
          <WifiOff size={16} aria-hidden="true" />
          <p>You are offline. You can sign in once you are connected.</p>
        </div>
      ) : null}

      <form onSubmit={submit} noValidate>
        <div className="acct-field">
          <label htmlFor="access-code">Access code</label>
          <div className="acct-code">
            <input
              id="access-code"
              ref={input}
              className="input"
              type={reveal ? 'text' : 'password'}
              value={code}
              onChange={(e) => { setCode(e.target.value); if (error) setError(null); }}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              placeholder="XXXXXX-XXXXXXXXXXXXXXXXXXXXXXXX"
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? 'access-code-hint access-code-error' : 'access-code-hint'}
              disabled={busy}
            />
            <button
              type="button"
              className="btn"
              onClick={() => setReveal((v) => !v)}
              aria-pressed={reveal}
              aria-label={reveal ? 'Hide access code' : 'Show access code'}
            >
              {reveal ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          <div id="access-code-hint" className="acct-hint">Paste it as the owner sent it. Spaces and lower case are fine. It is not saved on this device.</div>
          {error ? <div id="access-code-error" className="acct-err" role="alert">{loginMessage(error)}</div> : null}
        </div>
        <div className="acct-actions">
          <button type="submit" className="btn primary" disabled={busy || !code.trim()}>
            {busy ? <><Loader2 size={16} className="acct-spin" aria-hidden="true" /> Signing in</> : 'Sign in'}
          </button>
          {onCancel ? <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>Use without an account</button> : null}
        </div>
      </form>
    </section>
  );
}
