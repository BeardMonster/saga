import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, EllipsisVertical, Trash2 } from "lucide-react";
import { apiPatch, apiPost } from "../../core/api/client";
import { deleteWithUndo } from "../../core/api/undoableDelete";
import { useConfirm } from "../../shared/hooks/useConfirm";
import InlineEditText from "../../shared/components/InlineEditText";
import { SortableList, DragHandle, type SortableHandleProps } from "../../shared/components/SortableList";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NoteItemRow from "./NoteItemRow";
import MoveToPicker from "../../shared/components/MoveToPicker";
import { notifyMoved } from "../../core/api/undoableMove";
import { useDraftState } from "../../shared/hooks/useDraftState";
import type { PersonNote } from "./types";

// A titled card inside a section: a bullet list or a free paragraph.
export default function PersonNoteCard({
  note,
  personId,
  sections,
  currentSectionId,
  filtering,
  isGift,
  dragHandleProps,
}: {
  note: PersonNote;
  personId: string;
  sections: { id: string; title: string; notes: { id: string; title: string }[] }[];
  currentSectionId: string;
  filtering: boolean;
  isGift: boolean;
  dragHandleProps?: SortableHandleProps;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [lines, setLines] = useDraftState(`saga-draft-person-note-lines-${note.id}`);
  const [pickingSection, setPickingSection] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["person-notes", personId] });
    queryClient.invalidateQueries({ queryKey: ["people"] });
  };

  const updateNote = useMutation({
    mutationFn: (body: { title?: string; body?: string; sectionId?: string }) => apiPatch(`/person-notes/${note.id}`, body),
    onSuccess: invalidate,
  });
  const moveNote = useMutation({
    mutationFn: ({ sectionId }: { sectionId: string; label: string }) => apiPatch(`/person-notes/${note.id}`, { sectionId }),
    onSuccess: (_r, vars) => {
      invalidate();
      notifyMoved(`Moved "${note.title}" to ${vars.label}`, () => apiPatch(`/person-notes/${note.id}`, { sectionId: currentSectionId }));
    },
  });
  const moveItem = useMutation({
    mutationFn: ({ itemId, noteId }: { itemId: string; noteId: string; label: string; text: string }) => apiPatch(`/person-note-items/${itemId}`, { noteId }),
    onSuccess: (_r, vars) => {
      invalidate();
      notifyMoved(`Moved "${vars.text}" to ${vars.label}`, () => apiPatch(`/person-note-items/${vars.itemId}`, { noteId: note.id }));
    },
  });
  const deleteNote = useMutation({
    mutationFn: () => deleteWithUndo(`/person-notes/${note.id}`, "person_note", note.id, "Note"),
    onSuccess: invalidate,
  });
  const addItems = useMutation({
    mutationFn: () => apiPost(`/person-notes/${note.id}/items`, { lines: lines.split("\n") }),
    onSuccess: () => {
      setLines("");
      invalidate();
    },
  });
  const updateItem = useMutation({
    mutationFn: ({ id, ...body }: { id: string; text?: string; label?: string | null; isPinned?: boolean; giftStatus?: "idea" | "purchased" | "given" }) => apiPatch(`/person-note-items/${id}`, body),
    onSuccess: invalidate,
  });
  const deleteItem = useMutation({
    mutationFn: (id: string) => deleteWithUndo(`/person-note-items/${id}`, "person_note_item", id, "Item"),
    onSuccess: invalidate,
  });
  const reorderItems = useMutation({
    mutationFn: (ids: string[]) => apiPatch("/person-note-items/reorder", { ids }),
    onSuccess: invalidate,
  });

  const otherSections = sections.filter((s) => s.id !== currentSectionId);

  const renderRow = (item: PersonNote["items"][number], dragProps?: SortableHandleProps) => (
    <NoteItemRow
      key={item.id}
      item={item}
      isGift={isGift}
      dragProps={dragProps}
      onStatus={(giftStatus) => updateItem.mutate({ id: item.id, giftStatus })}
      onSave={({ label, text }) => updateItem.mutate({ id: item.id, label, text })}
      onTogglePin={() => updateItem.mutate({ id: item.id, isPinned: !item.isPinned })}
      moveGroups={sections.map((s) => ({ label: s.title, options: s.notes.filter((n) => n.id !== note.id).map((n) => ({ id: n.id, label: n.title })) }))}
      onMove={(noteId, label) => moveItem.mutate({ itemId: item.id, noteId, label, text: item.text })}
      onDelete={async () => {
        if (await confirm(`Move "${item.text}" to Trash? You can restore it within 30 days.`)) deleteItem.mutate(item.id);
      }}
    />
  );

  return (
    <div id={`note-${note.id}`} className="scroll-mt-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
      <div className="mb-2 flex items-center gap-1">
        {dragHandleProps && <DragHandle {...dragHandleProps} />}
        <h4 className="min-w-0 flex-1 font-semibold text-slate-800 dark:text-slate-100 break-words">
          <InlineEditText value={note.title} onSave={(title) => updateNote.mutate({ title })} />
        </h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="Note actions">
              <EllipsisVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {otherSections.length > 0 && (
              <>
                <DropdownMenuItem onSelect={() => setTimeout(() => setPickingSection(true), 0)}>
                  <ArrowRightLeft className="h-4 w-4" /> Move to section…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              destructive
              onSelect={() =>
                setTimeout(async () => {
                  if (await confirm(`Move "${note.title}" and everything in it to Trash? You can restore it within 30 days.`)) deleteNote.mutate();
                }, 0)
              }
            >
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {note.kind === "text" ? (
        <div className="text-sm text-slate-700 dark:text-slate-200">
          <InlineEditText value={note.body ?? ""} onSave={(body) => updateNote.mutate({ body })} placeholder="Write something..." as="textarea" allowEmpty />
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {note.items.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">{filtering ? "No matching items." : "Nothing here yet."}</p>}
            {filtering ? (
              note.items.map((item) => renderRow(item))
            ) : (
              <SortableList items={note.items} onReorder={(ids) => reorderItems.mutate(ids)}>
                {(item, dragProps) => renderRow(item, dragProps)}
              </SortableList>
            )}
          </div>
          {!filtering && (
            <div className="mt-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (lines.trim()) addItems.mutate();
                }}
                className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
              >
                <Field label="Add items (one per line)">
                  <Textarea value={lines} onChange={(e) => setLines(e.target.value)} minRows={1} />
                </Field>
                <Button type="submit" variant="secondary">
                  Add
                </Button>
              </form>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Tip: "Label: value" lines show the label in front.</p>
            </div>
          )}
        </>
      )}
      {pickingSection && (
        <MoveToPicker
          title="Move note to…"
          groups={[{ label: "Sections", options: otherSections.map((s) => ({ id: s.id, label: s.title })) }]}
          onPick={(id, label) => {
            setPickingSection(false);
            moveNote.mutate({ sectionId: id, label });
          }}
          onClose={() => setPickingSection(false)}
        />
      )}
      {dialog}
    </div>
  );
}
