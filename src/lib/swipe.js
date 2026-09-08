import { useRef } from "react";

/* Horizontal swipe, deliberately fussy about what counts:
   long presses, mostly-vertical drags and anything that starts on a control
   are all left alone so scrolling and text selection still work. */
export function useSwipe(onLeft, onRight) {
  const s = useRef({ x: 0, y: 0, t: 0, skip: true });

  return {
    onTouchStart: (e) => {
      const p = e.touches[0];
      const onControl =
        e.target instanceof Element &&
        e.target.closest("textarea, input, select, a, [data-noswipe]");
      s.current = { x: p.clientX, y: p.clientY, t: Date.now(), skip: !!onControl };
    },
    onTouchEnd: (e) => {
      if (s.current.skip) return;
      const p = e.changedTouches[0];
      const dx = p.clientX - s.current.x;
      const dy = p.clientY - s.current.y;
      if (Date.now() - s.current.t > 700) return;
      if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      if (dx < 0) onLeft?.();
      else onRight?.();
    },
  };
}
