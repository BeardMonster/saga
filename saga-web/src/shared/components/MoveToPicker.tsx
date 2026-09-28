import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";

export interface PickerOption {
  id: string;
  label: string;
}

export interface PickerGroup {
  label?: string;
  options: PickerOption[];
}

// "Move to…" chooser. Opens as a bottom sheet on phones and a centered
// dialog on larger screens. Options are grouped, and a search box appears
// when the list is long. Mount it only while open.
export default function MoveToPicker({
  title,
  groups,
  onPick,
  onClose,
}: {
  title: string;
  groups: PickerGroup[];
  onPick: (id: string, label: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const total = groups.reduce((n, g) => n + g.options.length, 0);
  const q = query.trim().toLowerCase();
  const shown = groups
    .map((g) => ({ ...g, options: g.options.filter((o) => !q || `${g.label ?? ""} ${o.label}`.toLowerCase().includes(q)) }))
    .filter((g) => g.options.length > 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent sheet>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Choose where to move it.</DialogDescription>
        </DialogHeader>

        {total > 8 && <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label="Search destinations" />}

        <div className="grid gap-3">
          {shown.map((g, gi) => (
            <div key={g.label ?? gi}>
              {g.label && <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">{g.label}</p>}
              <ul>
                {g.options.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => onPick(o.id, o.label)}
                      className="flex min-h-12 w-full items-center rounded-xl px-3 text-left text-sm text-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      {o.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {shown.length === 0 && <p className="px-3 text-sm text-slate-600 dark:text-slate-400">No matches.</p>}
        </div>

        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
