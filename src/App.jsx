import React, { useEffect, useState } from 'react';
import BodyRecompOS from './BodyRecompOS.jsx';
import { bootState } from './store/migrateFromLocalStorage.js';
import { getActiveAccountId } from './cloud/activeAccount.js';

// One boot per page load, even under StrictMode's double effect: opening the
// database and running the (idempotent) migration twice concurrently is
// needless risk. Switching accounts reloads the page, so nothing from one
// account's memory can leak into another's.
let bootPromise = null;
const bootOnce = (accountId) => {
  if (!bootPromise) bootPromise = bootState({ accountId });
  return bootPromise;
};

export default function App() {
  const [boot, setBoot] = useState(null);
  const accountId = getActiveAccountId();

  useEffect(() => {
    let alive = true;
    bootOnce(accountId)
      .then((result) => { if (alive) setBoot(result); })
      // If the durable store cannot start at all, BodyRecompOS reads the
      // original localStorage copy exactly as before.
      .catch(() => { if (alive) setBoot({ state: null, store: null, degraded: { reason: 'boot-failed' } }); });
    return () => { alive = false; };
  }, [accountId]);

  if (!boot) return <div className="boot-screen" role="status">Opening your data…</div>;
  return <BodyRecompOS key={accountId} initialState={boot.state || undefined} store={boot.store} degraded={boot.degraded} accountId={accountId} />;
}
