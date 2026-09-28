import { useRef, type MouseEvent, type PointerEvent } from "react";

// Press-and-hold for touch/pen input (mouse users get visible buttons
// instead). A scroll or drag cancels it — moving more than a few pixels, or
// the browser taking over the touch to scroll (pointercancel) — so swiping
// past a row never triggers it. Spread the returned handlers onto the
// element. If the hold fired, the click that follows the release is
// swallowed so it doesn't also activate whatever was under the finger.
export function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef(0);
  const fired = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const clear = () => window.clearTimeout(timer.current);

  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      // A long press inside a text field belongs to the phone (paste / select
      // menu) — never treat it as ours, or pasting into an item being edited breaks.
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(15);
        onLongPress();
      }, ms);
    },
    onPointerMove: (e: PointerEvent) => {
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: MouseEvent) => {
      if (fired.current) e.preventDefault();
    },
    onClickCapture: (e: MouseEvent) => {
      if (fired.current) {
        fired.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    },
  };
}
