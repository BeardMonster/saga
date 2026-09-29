import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "../../core/api/client";
import ChecklistCard from "../../shared/components/ChecklistCard";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SortableList } from "../../shared/components/SortableList";
import { useDraftState } from "../../shared/hooks/useDraftState";

interface NoteSummary {
  id: string;
  name: string;
  body: string | null;
  kind: "generic" | "grocery" | "note";
  isPinned: boolean;
  completedAt: string | null;
}

// A Google Keep-style catch-all — a "note" is the same Checklist row every
// standalone checklist uses, just with kind: "note" (free text in `body`,
// no items). ChecklistCard already renders that shape well (a body preview
// collapsed, an editable text field expanded); this page just gives notes
// their own home instead of being mixed in among real to-do checklists on
// the Checklists page. Brain Dump can also create one directly, as its
// catch-all for information that isn't really a task.
export default function NotesPage() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useDraftState("saga-draft-note-title");
  const [newBody, setNewBody] = useDraftState("saga-draft-note-body");
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["checklists", "standalone"],
    queryFn: () => apiGet<NoteSummary[]>("/checklists?standalone=true"),
  });
  const notes = (data?.data ?? []).filter((c) => c.kind === "note");

  // Client-side, same reasoning as Recipes' search — a personal note stash
  // isn't big enough to need a server endpoint for this.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.name.toLowerCase().includes(q) || (n.body ?? "").toLowerCase().includes(q));
  }, [notes, search]);

  // Split after filtering — a search still narrows both groups, it just
  // keeps pinned notes surfaced first.
  const pinned = filtered.filter((n) => n.isPinned);
  const unpinned = filtered.filter((n) => !n.isPinned);
  const searching = search.trim().length > 0;

  const createNote = useMutation({
    mutationFn: () => apiPost("/checklists", { name: newName, kind: "note", body: newBody }),
    onSuccess: () => {
      setNewName("");
      setNewBody("");
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
    },
  });

  // Reorders only the ids in whichever group was dragged — the endpoint
  // re-indexes exactly the ids it's given, so pinned and unpinned can be
  // reordered as two independent lists without touching each other.
  const reorderNotes = useMutation({
    mutationFn: (checklistIds: string[]) => apiPatch("/checklists/reorder", { projectId: null, checklistIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklists"] }),
  });

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Notes</h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          A catch-all for things worth keeping that aren't really tasks — facts, thoughts, things to look up later.
          Brain Dump can drop things here too when nothing else fits.
        </p>
      </div>

      {notes.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
          <Field label="Search notes">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search titles and contents" />
          </Field>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) createNote.mutate();
        }}
        className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-4 space-y-3"
      >
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">New note</h3>
        <Field label="Title">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Give it a short title" />
        </Field>
        <Field label="Body">
          <Textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="Write it out..." rows={3} />
        </Field>
        <Button type="submit" disabled={createNote.isPending || !newName.trim()}>
          Add
        </Button>
      </form>

      <div className="space-y-3">
        {pinned.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pinned</h3>
            <SortableList items={pinned} onReorder={(ids) => reorderNotes.mutate(ids)}>
              {(n, dragProps) => <ChecklistCard key={n.id} checklistId={n.id} dragHandleProps={searching ? undefined : dragProps} />}
            </SortableList>
          </div>
        )}

        {pinned.length > 0 && unpinned.length > 0 && (
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 pt-1">Other notes</h3>
        )}

        <div className="space-y-3">
          <SortableList items={unpinned} onReorder={(ids) => reorderNotes.mutate(ids)}>
            {(n, dragProps) => <ChecklistCard key={n.id} checklistId={n.id} dragHandleProps={searching ? undefined : dragProps} />}
          </SortableList>
        </div>

        {notes.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No notes yet — add one below.</p>}
        {notes.length > 0 && filtered.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No notes match "{search}".</p>}
      </div>
    </div>
  );
}
