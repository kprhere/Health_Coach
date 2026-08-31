import { useEffect, useState } from 'react';

export const screenWakeLockSupported = () => (
  typeof navigator !== 'undefined' && navigator.wakeLock?.request instanceof Function
);

// Browsers release a screen wake lock whenever the page is backgrounded. This
// hook remembers the user's intent and requests a fresh lock when the app is
// visible again. Unsupported browsers simply continue with normal screen sleep.
export function useScreenWakeLock(enabled) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled || !screenWakeLockSupported()) {
      setActive(false);
      return undefined;
    }

    let sentinel = null;
    let pending = false;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || pending || sentinel || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (cancelled) {
          next.release().catch(() => {});
          return;
        }
        sentinel = next;
        setActive(true);
        next.addEventListener('release', () => {
          if (sentinel === next) sentinel = null;
          if (!cancelled) setActive(false);
        });
      } catch {
        // Low Power Mode and some browsers can reject this request. Screen sleep
        // remains unchanged and we try again after the next visibility change.
        setActive(false);
      } finally {
        pending = false;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    acquire();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      setActive(false);
      const held = sentinel;
      sentinel = null;
      if (held) held.release().catch(() => {});
    };
  }, [enabled]);

  return active;
}
