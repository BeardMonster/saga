import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// A single row of chips that scrolls sideways when it doesn't fit. The
// scrollbar is hidden (it renders grey-on-white in dark mode and crowds the
// chips on phones); left/right arrows appear only when there's more to scroll
// to in that direction, so it's obvious the row moves.
export default function ScrollChips({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [update, children]);

  const scrollBy = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * Math.max(160, (ref.current.clientWidth ?? 0) * 0.6), behavior: "smooth" });

  const arrowClass =
    "absolute top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 dark:bg-slate-800/95 text-slate-700 dark:text-slate-200 shadow border border-slate-200 dark:border-slate-600";

  return (
    <div className="relative">
      {canLeft && (
        <button type="button" onClick={() => scrollBy(-1)} aria-label="Scroll left" className={`${arrowClass} left-0`}>
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <nav
        ref={ref}
        aria-label={label}
        onScroll={update}
        className="flex gap-2 overflow-x-auto py-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </nav>
      {canRight && (
        <button type="button" onClick={() => scrollBy(1)} aria-label="Scroll right" className={`${arrowClass} right-0`}>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
