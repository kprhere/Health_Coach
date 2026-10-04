import React, { useEffect, useState } from 'react';
import BodyRecompOS from './BodyRecompOS.jsx';
import { bootState } from './store/migrateFromLocalStorage.js';

// One boot per page load, even under StrictMode's double effect: opening the
// database and running the (idempotent) migration twice concurrently is
// needless risk.
let bootPromise = null;
const bootOnce = () => {
  if (!bootPromise) bootPromise = bootState({ accountId: 'local' });
  return bootPromise;
};

export default function App() {
  const [boot, setBoot] = useState(null);

  useEffect(() => {
    let alive = true;
    bootOnce()
      .then((result) => { if (alive) setBoot(result); })
      // If the durable store cannot start at all, BodyRecompOS reads the
      // original localStorage copy exactly as before.
      .catch(() => { if (alive) setBoot({ state: null, store: null, degraded: { reason: 'boot-failed' } }); });
    return () => { alive = false; };
  }, []);

  if (!boot) return <div className="boot-screen" role="status">Opening your data…</div>;
  return <BodyRecompOS initialState={boot.state || undefined} store={boot.store} degraded={boot.degraded} />;
}
