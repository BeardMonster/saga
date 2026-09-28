import { useRef, useState } from "react";

// A card title that opens/closes its card when clicked. Renaming is
// deliberately separate so a tap never edits by accident: on touch devices,
// press and hold the title (~half a second); on desktop there's a small
// "edit" link beside it.
export default function ExpandableTitle({
  value,
  onSave,
  expanded,
  onToggle,
}: {
  value: string;
  onSave: (name: string) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const timer = useRef<number>(0);
  const longPressed = useRef(false);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  const save = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== value) onSave(trimmed);
  };

  const startPress = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      navigator.vibrate?.(15);
      startEdit();
    }, 500);
  };
  const cancelPress = () => window.clearTimeout(timer.current);

  if (editing) {
    return (
      <span className="inline-flex flex-col gap-1.5 flex-1 min-w-0">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="rounded border border-slate-300 dark:border-slate-600 px-1.5 py-1 text-sm w-full font-normal"
        />
        <span className="flex gap-2">
          <button type="button" onClick={save} className="text-xs rounded bg-slate-800 text-white px-2 py-1 hover:bg-slate-700">
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-1 hover:bg-slate-200 dark:hover:bg-slate-600"
          >
            Cancel
          </button>
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-baseline gap-2 min-w-0">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onToggle();
        }}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => e.preventDefault()}
        className="flex items-center gap-1.5 min-w-0 py-2 -my-2 text-left select-none [-webkit-touch-callout:none]"
      >
        <span className="text-xs text-slate-500 dark:text-slate-500 shrink-0">{expanded ? "▾" : "▸"}</span>
        <span className="break-words">{value}</span>
      </button>
      <button
        type="button"
        onClick={startEdit}
        className="hidden sm:inline shrink-0 text-[10px] font-normal text-slate-500 dark:text-slate-500 hover:underline"
      >
        edit
      </button>
    </span>
  );
}
