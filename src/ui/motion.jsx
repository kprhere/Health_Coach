// ============================================================
// ui/motion.jsx - small motion helpers. Everything here resolves to the final
// value instantly under prefers-reduced-motion, so numbers are never wrong.
// ============================================================
import React, { useEffect, useRef, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useCountUp(target, ms = 700) {
  const num = Number(target);
  const valid = Number.isFinite(num);
  const [shown, setShown] = useState(valid ? num : 0);
  const from = useRef(valid ? num : 0);
  useEffect(() => {
    if (!valid) return undefined;
    if (reduced() || typeof requestAnimationFrame !== 'function') { setShown(num); from.current = num; return undefined; }
    const start = performance.now();
    const origin = from.current;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = origin + (num - origin) * eased;
      setShown(value);
      if (t < 1) raf = requestAnimationFrame(tick); else from.current = num;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [num, valid, ms]);
  return valid ? shown : null;
}

// Renders the final value for assistive tech; only the visual number animates.
export function CountUp({ value, decimals = 0, fallback = '-' }) {
  const shown = useCountUp(value);
  if (shown == null) return <>{fallback}</>;
  return <span aria-label={Number(value).toFixed(decimals)}>{shown.toFixed(decimals)}</span>;
}
