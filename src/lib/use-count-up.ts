"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Eases a displayed number from 0 up to `target` once the element scrolls
 * into view. Reduced-motion users get the final value immediately.
 */
export function useCountUp<T extends Element>(target: number, duration = 900) {
  const ref = useRef<T | null>(null);
  const [started, setStarted] = useState(false);
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || started) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const span = reduced ? 0 : duration;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = span === 0 ? 1 : Math.min(1, (now - t0) / span);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, target, duration]);

  return { ref, value: shown };
}
