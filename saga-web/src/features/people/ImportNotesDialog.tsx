import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../../core/api/client";
import { notifyMoved } from "../../core/api/undoableMove";
import { playUiSound } from "../../shared/lib/celebrate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import RenderGuard from "../../shared/components/RenderGuard";

interface ParsedChild {
  label: string | null;
  text: string;
}
interface ParsedItem extends ParsedChild {
  children: ParsedChild[];
}
interface ParsedNote {
  title: string;
  kind: "list" | "text";
  body: string | null;
  items: ParsedItem[];
  suggestedSection: string;
}

interface Draft extends ParsedNote {
  include: boolean;
  section: string; // an existing section id, or "new:<title>"
}

const countItems = (n: ParsedNote) => n.items.reduce((sum, i) => sum + 1 + i.children.length, 0);

// Paste Google Keep text → review what was found (titles, which section each
// note goes to, which to skip) → import. The parsing is rules-based on the
// server and nothing is saved until "Import". Mounted only while open.
export default function ImportNotesDialog({
  personId,
  sections,
  onClose,
}: {
  personId: string;
  sections: { id: string; title: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [slow, setSlow] = useState(false);

  const preview = useMutation({
    mutationFn: () => apiPost<{ notes: ParsedNote[] }>(`/people/${personId}/import/preview`, { text }),
    onSuccess: (res) => {
      const notes = res.data?.notes ?? [];
      setSlow(false);
      // The review is much taller than the paste box — start at its top.
      setTimeout(() => contentRef.current?.scrollTo({ top: 0 }), 0);
      setDrafts(
        notes.map((n) => {
          const existing = sections.find((s) => s.title.toLowerCase() === n.suggestedSection.toLowerCase());
          return { ...n, include: true, section: existing ? existing.id : `new:${n.suggestedSection}` };
        }),
      );
    },
  });

  // After a few seconds of waiting, say so — it's still working, not stuck.
  useEffect(() => {
    if (!preview.isPending) return;
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, [preview.isPending]);


  const chosen = (drafts ?? []).filter((d) => d.include);
  const chosenItems = chosen.reduce((sum, d) => sum + countItems(d), 0);

  const save = useMutation({
    mutationFn: () =>
      apiPost<{ noteIds: string[]; itemCount: number }>(`/people/${personId}/import`, {
        notes: chosen.map((d) => ({
          title: d.title,
          kind: d.kind,
          body: d.body,
          items: d.items,
          ...(d.section.startsWith("new:") ? { newSectionTitle: d.section.slice(4) } : { sectionId: d.section }),
        })),
      }),
    onSuccess: (res) => {
      const noteIds = res.data?.noteIds ?? [];
      queryClient.invalidateQueries({ queryKey: ["person-notes", personId] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
      playUiSound("add");
      notifyMoved(
        `Imported ${noteIds.length} note${noteIds.length === 1 ? "" : "s"} (${res.data?.itemCount ?? 0} items)`,
        () => apiPost(`/people/${personId}/import/undo`, { noteIds }),
        "Import undone",
      );
      onClose();
    },
  });

  const busy = preview.isPending || save.isPending;
  const lineCount = text.split("\n").filter((l) => l.trim()).length;
  const update = (index: number, patch: Partial<Draft>) => setDrafts((prev) => prev?.map((d, i) => (i === index ? { ...d, ...patch } : d)) ?? null);

  // Where a note can go: this person's sections, plus the suggested one if it doesn't exist yet.
  const optionsFor = (d: Draft) => {
    const options = sections.map((s) => ({ value: s.id, label: s.title }));
    if (d.section.startsWith("new:")) options.push({ value: d.section, label: `New section: ${d.section.slice(4)}` });
    return options;
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent ref={contentRef} className="max-h-[92vh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import notes from Keep</DialogTitle>
          <DialogDescription>
            {drafts
              ? "Check what was found. Pick where each note goes, rename it, or untick it to skip. Nothing is saved until you tap Import."
              : "Paste your Google Keep text. You'll review everything before anything is saved, and nothing is sent to any AI."}
          </DialogDescription>
        </DialogHeader>

        <RenderGuard label="the import screen">
        {!drafts ? (
          <>
            <Field label="Paste text here">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} disabled={preview.isPending} minRows={8} placeholder={"- Fav Foods -\n  - Gumbo\n  - Nectarines\n\nSubway:\n- BMT toasted"} />
            </Field>
            {preview.isPending && (
              <div role="status" className="flex items-center gap-3 rounded-xl bg-slate-100 dark:bg-slate-800 p-3 text-sm text-slate-800 dark:text-slate-100">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                <span>
                  Reading your notes ({lineCount} lines)…
                  {slow && " Still working — long notes can take a moment. Please don't close this."}
                </span>
              </div>
            )}
            {preview.isError && <p className="text-sm text-red-600 dark:text-red-400">Couldn't read that — check your connection and try again.</p>}
            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={preview.isPending}>
                Cancel
              </Button>
              <Button onClick={() => preview.mutate()} disabled={!text.trim() || preview.isPending}>
                {preview.isPending ? "Reading..." : "Preview"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 text-sm text-slate-700 dark:text-slate-200">
              <span className="font-medium">
                Found {drafts.length} note{drafts.length === 1 ? "" : "s"}
              </span>
              <span className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setDrafts((p) => p?.map((d) => ({ ...d, include: true })) ?? null)}>
                  Select all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDrafts((p) => p?.map((d) => ({ ...d, include: false })) ?? null)}>
                  None
                </Button>
              </span>
            </div>

            <ul className="space-y-3">
              {drafts.map((d, i) => (
                <li key={i} className={`rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2 ${d.include ? "" : "opacity-50"}`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={d.include}
                      onChange={(e) => update(i, { include: e.target.checked })}
                      aria-label={`Import ${d.title}`}
                      className="h-5 w-5 shrink-0 rounded accent-indigo-700"
                    />
                    <Input value={d.title} onChange={(e) => update(i, { title: e.target.value })} aria-label="Note title" className="font-semibold" />
                  </div>
                  <Field label="Goes in section">
                    <Select value={d.section} onChange={(e) => update(i, { section: e.target.value })}>
                      {optionsFor(d).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <details className="text-sm text-slate-700 dark:text-slate-200">
                    <summary className="min-h-11 cursor-pointer py-2 text-indigo-700 dark:text-indigo-300">
                      {d.kind === "text" ? "Text note" : `${countItems(d)} item${countItems(d) === 1 ? "" : "s"}`} — show
                    </summary>
                    {d.kind === "text" ? (
                      <p className="whitespace-pre-wrap break-words">{d.body}</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {d.items.map((item, ii) => (
                          <li key={ii} className="break-words">
                            • {item.label ? `${item.label}: ` : ""}
                            {item.text}
                            {item.children.length > 0 && (
                              <ul className="ml-4 space-y-0.5 text-slate-600 dark:text-slate-300">
                                {item.children.map((c, ci) => (
                                  <li key={ci}>
                                    – {c.label ? `${c.label}: ` : ""}
                                    {c.text}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </li>
              ))}
            </ul>
            {drafts.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">Nothing recognizable was found in that text.</p>}
            {save.isError && <p className="text-sm text-red-600 dark:text-red-400">Couldn't import — try again.</p>}

            {save.isPending && (
              <div role="status" className="flex items-center gap-3 rounded-xl bg-slate-100 dark:bg-slate-800 p-3 text-sm text-slate-800 dark:text-slate-100">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                <span>Importing {chosen.length} notes ({chosenItems} items)…</span>
              </div>
            )}
            <DialogFooter className="sticky bottom-0 bg-card pt-2">
              <Button variant="ghost" onClick={() => setDrafts(null)} disabled={save.isPending}>
                Back
              </Button>
              <Button onClick={() => save.mutate()} disabled={chosen.length === 0 || save.isPending}>
                {save.isPending ? "Importing..." : `Import ${chosen.length} note${chosen.length === 1 ? "" : "s"} (${chosenItems} items)`}
              </Button>
            </DialogFooter>
          </>
        )}
        </RenderGuard>
      </DialogContent>
    </Dialog>
  );
}
