import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EllipsisVertical, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { apiPatch, apiPost } from "../../core/api/client";
import { deleteWithUndo } from "../../core/api/undoableDelete";
import { useConfirm } from "../../shared/hooks/useConfirm";
import ExpandableTitle from "../../shared/components/ExpandableTitle";
import { SortableList, DragHandle, type SortableHandleProps } from "../../shared/components/SortableList";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import PersonNoteCard from "./PersonNoteCard";
import type { PersonSection } from "./types";

// A big group of notes (Favorites, Orders, ...). Private sections stay
// closed and hidden until you tap Show, and reset to hidden on reload.
export default function NoteSectionCard({
  section,
  personId,
  allSections,
  filtering,
  dragHandleProps,
}: {
  section: PersonSection;
  personId: string;
  allSections: { id: string; title: string; notes: { id: string; title: string }[] }[];
  filtering: boolean;
  dragHandleProps?: SortableHandleProps;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(!section.isPrivate);
  const [revealed, setRevealed] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteKind, setNoteKind] = useState<"list" | "text">("list");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["person-notes", personId] });

  const updateSection = useMutation({
    mutationFn: (body: { title?: string; isPrivate?: boolean }) => apiPatch(`/person-sections/${section.id}`, body),
    onSuccess: invalidate,
  });
  const deleteSection = useMutation({
    mutationFn: () => deleteWithUndo(`/person-sections/${section.id}`, "person_section", section.id, "Section"),
    onSuccess: invalidate,
  });
  const addNote = useMutation({
    mutationFn: () => apiPost(`/person-sections/${section.id}/notes`, { title: noteTitle, kind: noteKind }),
    onSuccess: () => {
      setNoteTitle("");
      setAddingNote(false);
      invalidate();
    },
  });
  const reorderNotes = useMutation({
    mutationFn: (ids: string[]) => apiPatch("/person-notes/reorder", { ids }),
    onSuccess: invalidate,
  });

  const isGift = section.kind === "gift_ideas";
  const hidden = section.isPrivate && !revealed && !filtering;
  const isOpen = open || filtering;

  return (
    <section id={`section-${section.id}`} className="scroll-mt-20 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3">
      <div className="flex items-center gap-1">
        {dragHandleProps && <DragHandle {...dragHandleProps} />}
        <h3 className="min-w-0 flex-1 font-semibold text-slate-800 dark:text-slate-100">
          <ExpandableTitle value={section.title} onSave={(title) => updateSection.mutate({ title })} expanded={isOpen} onToggle={() => setOpen((o) => !o)} />
          {section.isPrivate && <Lock className="ml-2 inline h-3.5 w-3.5 text-slate-600 dark:text-slate-400" aria-label="Private" />}
        </h3>
        <span className="shrink-0 text-xs text-slate-600 dark:text-slate-400">{section.notes.reduce((n, note) => n + note.items.length, 0)}</span>
        {!isGift && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="Section actions">
              <EllipsisVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setOpen(true);
                setRevealed(true);
                setAddingNote(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add note
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => updateSection.mutate({ isPrivate: !section.isPrivate })}>
              {section.isPrivate ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {section.isPrivate ? "Make not private" : "Make private"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() =>
                setTimeout(async () => {
                  if (await confirm(`Move the "${section.title}" section and all its notes to Trash? You can restore it within 30 days.`)) deleteSection.mutate();
                }, 0)
              }
            >
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}
      </div>

      {isOpen && hidden && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">Private notes are hidden.</p>
          <Button variant="secondary" size="sm" onClick={() => setRevealed(true)}>
            Show
          </Button>
        </div>
      )}

      {isOpen && !hidden && (
        <div className="mt-2 space-y-3">
          {section.isPrivate && !filtering && (
            <Button variant="ghost" size="sm" onClick={() => setRevealed(false)}>
              <Lock className="h-4 w-4" /> Hide again
            </Button>
          )}
          {filtering ? (
            section.notes.map((n) => (
              <PersonNoteCard key={n.id} note={n} personId={personId} sections={allSections} currentSectionId={section.id} filtering isGift={isGift} />
            ))
          ) : (
            <SortableList items={section.notes} onReorder={(ids) => reorderNotes.mutate(ids)}>
              {(n, dragProps) => (
                <div className="mb-3">
                  <PersonNoteCard note={n} personId={personId} sections={allSections} currentSectionId={section.id} filtering={false} isGift={isGift} dragHandleProps={dragProps} />
                </div>
              )}
            </SortableList>
          )}
          {section.notes.length === 0 && !addingNote && <p className="text-sm text-slate-600 dark:text-slate-400">No notes yet.</p>}

          {!filtering &&
            (addingNote ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (noteTitle.trim()) addNote.mutate();
                }}
                className="grid gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
              >
                <Field label="Note title">
                  <Input autoFocus value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="e.g. Fav Foods, Subway order" />
                </Field>
                <Field label="Type">
                  <Select value={noteKind} onChange={(e) => setNoteKind(e.target.value as "list" | "text")}>
                    <option value="list">List (bullet items)</option>
                    <option value="text">Text (a paragraph or story)</option>
                  </Select>
                </Field>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setAddingNote(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Add Note</Button>
                </div>
              </form>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setAddingNote(true)}>
                <Plus className="h-4 w-4" /> Add note
              </Button>
            ))}
        </div>
      )}
      {dialog}
    </section>
  );
}
