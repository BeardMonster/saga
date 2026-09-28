import { useState } from "react";
import { useConfirm } from "../hooks/useConfirm";
import AutoGrowTextarea from "./AutoGrowTextarea";

interface Props {
  value: string;
  onSave: (newValue: string) => void;
  as?: "input" | "textarea";
  className?: string;
  displayClassName?: string;
  placeholder?: string;
  minRows?: number;
  // Optional fields (descriptions, notes): saving an emptied field asks to
  // confirm the erase, then saves "". Required fields (names, titles) leave
  // this off, so emptying one is just ignored.
  allowEmpty?: boolean;
}

// Click text to edit it in place. Single-line (`as="input"`, the default):
// Enter saves, Escape cancels. Multi-line (`as="textarea"`): Enter inserts a
// newline like any normal text box — saving/canceling is only via the
// buttons or Escape, since Enter-to-submit is exactly wrong on a multi-line
// field (and actively broken on mobile, where Enter is just a newline key).
// There's no save-on-blur: with explicit buttons present, blur-to-save
// races against clicking Cancel (blur fires first, saving before the
// cancel click lands), so committing only happens via an explicit action.
export default function InlineEditText({ value, onSave, as = "input", className, displayClassName, placeholder, minRows = 2, allowEmpty }: Props) {
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed && allowEmpty && value) {
      if (!(await confirm("Erase this text? The field will be left empty.", "Erase"))) return;
      setEditing(false);
      onSave("");
      return;
    }
    setEditing(false);
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <>
      {dialog}
      <span
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={`cursor-text hover:bg-slate-100 dark:hover:bg-slate-800 rounded px-0.5 -mx-0.5 whitespace-pre-wrap ${displayClassName ?? ""}`}
        title="Click to edit"
      >
        {value || <span className="text-slate-500 dark:text-slate-500 italic">{placeholder}</span>}
      </span>
      </>
    );
  }

  const fieldClassName = `rounded border border-slate-300 dark:border-slate-600 px-1.5 py-1 text-sm w-full ${className ?? ""}`;

  return (
    <span className="inline-flex flex-col gap-1.5 w-full">
      {dialog}
      {as === "textarea" ? (
        <AutoGrowTextarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
          minRows={minRows}
          className={fieldClassName}
        />
      ) : (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          className={fieldClassName}
        />
      )}
      <span className="flex gap-2">
        <button
          type="button"
          onClick={save}
          className="text-xs rounded bg-slate-800 text-white px-2 py-1 hover:bg-slate-700 dark:hover:bg-slate-600"
        >
          Save
        </button>
        <button
          type="button"
          onClick={cancel}
          className="text-xs rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-1 hover:bg-slate-200 dark:hover:bg-slate-600"
        >
          Cancel
        </button>
      </span>
    </span>
  );
}
