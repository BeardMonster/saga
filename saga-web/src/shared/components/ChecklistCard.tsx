import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete, apiPatch } from "../../core/api/client";
import { deleteWithUndo } from "../../core/api/undoableDelete";
import { celebrate } from "../lib/celebrate";
import { useConfirm } from "../hooks/useConfirm";
import { GOLD_STAR_ICON, TREASURE_CHEST_OPEN_ICON, PIXEL_ICON_CLASS } from "../lib/icons";
import InlineEditText from "./InlineEditText";
import ExpandableTitle from "./ExpandableTitle";
import ChecklistItemRow from "./ChecklistItemRow";
import MoveToPicker from "./MoveToPicker";
import { notifyMoved } from "../../core/api/undoableMove";
import { ArrowRightLeft, EllipsisVertical, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortableList, DragHandle, type SortableHandleProps } from "./SortableList";

interface ChecklistItemData {
  id: string;
  title: string;
  isComplete: boolean;
  isQuickWin: boolean;
}

interface ChecklistData {
  id: string;
  name: string;
  kind: "generic" | "grocery" | "note";
  description: string | null;
  body: string | null;
  completedAt: string | null;
  projectId: string | null;
  items: ChecklistItemData[];
}

interface ChecklistSummary {
  id: string;
  name: string;
  completedAt: string | null;
  kind: "generic" | "grocery" | "note";
  projectId: string | null;
}

export default function ChecklistCard({
  checklistId,
  dragHandleProps,
}: {
  checklistId: string;
  dragHandleProps?: SortableHandleProps;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [newItemTitle, setNewItemTitle] = useState("");
  const [poppedItemId, setPoppedItemId] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [pickingProject, setPickingProject] = useState(false);

  const { data } = useQuery({
    queryKey: ["checklist", checklistId],
    queryFn: () => apiGet<ChecklistData>(`/checklists/${checklistId}`),
  });

  const checklist = data?.data;

  // For the "move to a different checklist" picker — every checklist the
  // user has, so an item can be reassigned to one it didn't start in.
  const allChecklistsQuery = useQuery({
    queryKey: ["checklists", "all-for-move"],
    queryFn: () => apiGet<ChecklistSummary[]>("/checklists"),
  });
  const otherChecklists = (allChecklistsQuery.data?.data ?? []).filter((c) => c.id !== checklistId && !c.completedAt);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["checklist", checklistId] });
    queryClient.invalidateQueries({ queryKey: ["checklists"] });
  };

  const addItem = useMutation({
    mutationFn: (title: string) => apiPost(`/checklists/${checklistId}/items`, { title }),
    onSuccess: () => {
      setNewItemTitle("");
      invalidate();
    },
  });

  const toggleItem = useMutation({
    // sound: null — celebrate() below plays this mutation's actual sound.
    mutationFn: ({ itemId }: { itemId: string; origin: { x: number; y: number } }) =>
      apiPatch(`/checklists/${checklistId}/items/${itemId}/toggle`, undefined, { sound: null }),
    onMutate: ({ itemId, origin }) => {
      const item = checklist?.items.find((i) => i.id === itemId);
      if (item && !item.isComplete) {
        // Checking off the last open item is a bigger moment than a single one.
        const lastOpen = checklist!.items.filter((i) => !i.isComplete).length === 1;
        celebrate(lastOpen ? "checklist" : "item", origin);
        setPoppedItemId(itemId);
        setTimeout(() => setPoppedItemId(null), 500);
      }
    },
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => deleteWithUndo(`/checklists/${checklistId}/items/${itemId}`, "checklist_item", itemId, "Item"),
    onSuccess: invalidate,
  });

  const reorderItems = useMutation({
    mutationFn: (itemIds: string[]) => apiPatch(`/checklists/${checklistId}/items/reorder`, { itemIds }),
    onSuccess: invalidate,
  });

  const moveItemToChecklist = useMutation({
    mutationFn: ({ itemId, targetChecklistId }: { itemId: string; targetChecklistId: string; label: string }) =>
      apiPatch(`/checklists/${checklistId}/items/${itemId}`, { checklistId: targetChecklistId }),
    onSuccess: (_result, vars) => {
      queryClient.invalidateQueries({ queryKey: ["checklist"] });
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      notifyMoved(`Moved to ${vars.label}`, () => apiPatch(`/checklists/${vars.targetChecklistId}/items/${vars.itemId}`, { checklistId }));
    },
  });

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<{ id: string; name: string; status: string; page: string }[]>("/projects"),
  });
  const moveTargets = (projectsQuery.data?.data ?? []).filter((p) => p.status === "active" && p.id !== checklist?.projectId);

  const moveChecklist = useMutation({
    // "__own_project" wraps this checklist in a new project of its own;
    // null puts it back on the Checklists page as a standalone checklist.
    mutationFn: ({ target }: { target: string | null; label: string; from: string | null }) =>
      target === "__own_project"
        ? apiPost<{ id: string }>(`/checklists/${checklistId}/make-project`, {})
        : apiPatch(`/checklists/${checklistId}`, { projectId: target }),
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      queryClient.invalidateQueries({ queryKey: ["checklist", checklistId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      // "Its own project" wraps this checklist in a new project — undoing
      // that unwraps it again (moving that project to the Checklists page).
      const newProjectId = vars.target === "__own_project" ? (result.data as { id: string } | null)?.id : undefined;
      notifyMoved(
        `Moved to ${vars.label}`,
        newProjectId
          ? () => apiPatch(`/projects/${newProjectId}`, { page: "checklists" })
          : () => apiPatch(`/checklists/${checklistId}`, { projectId: vars.from }),
      );
    },
  });

  const resetItems = useMutation({
    // A bulk un-complete, not a completion itself — "restore" fits the
    // "brought back to active" feel better than a generic save.
    mutationFn: () => apiPost(`/checklists/${checklistId}/reset`, {}, { sound: "restore" }),
    onSuccess: invalidate,
  });

  const deleteChecklist = useMutation({
    mutationFn: () => deleteWithUndo(`/checklists/${checklistId}`, "checklist", checklistId, "Checklist"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const editText = useMutation({
    mutationFn: (fields: { description?: string; body?: string }) => apiPatch(`/checklists/${checklistId}`, fields),
    onSuccess: invalidate,
  });

  const setCompleted = useMutation({
    // sound: null — celebrate() below plays this mutation's actual sound.
    mutationFn: (completed: boolean) => apiPatch(`/checklists/${checklistId}`, { completed }, { sound: null }),
    onSuccess: invalidate,
  });

  const renameChecklist = useMutation({
    mutationFn: (name: string) => apiPatch(`/checklists/${checklistId}`, { name }),
    onSuccess: invalidate,
  });

  const renameItem = useMutation({
    mutationFn: ({ itemId, title }: { itemId: string; title: string }) =>
      apiPatch(`/checklists/${checklistId}/items/${itemId}`, { title }),
    onSuccess: invalidate,
  });

  const toggleQuickWin = useMutation({
    mutationFn: ({ itemId, isQuickWin }: { itemId: string; isQuickWin: boolean }) =>
      apiPatch(`/checklists/${checklistId}/items/${itemId}`, { isQuickWin }),
    onSuccess: invalidate,
  });

  if (!checklist) return null;

  const allComplete = checklist.items.length > 0 && checklist.items.every((i) => i.isComplete);

  // Items are displayed incomplete-first (see the API's orderBy) — reorder
  // is scoped to within the same completion group, matching what the old
  // up/down arrows swapped against, and what actually makes visible sense
  // (checking a box, not dragging, is how an item moves between groups).
  const incomplete = checklist.items.filter((i) => !i.isComplete);

  // Where an item can be moved: other checklists on the Checklists page, and
  // sections inside projects (labeled with their project so it's clear those
  // live on the Projects page). Text sections can't hold items.
  const projectNameById = new Map((projectsQuery.data?.data ?? []).map((p) => [p.id, p.name]));
  const itemMoveTargets = otherChecklists
    .filter((c) => c.kind !== "note")
    .map((c) => ({ id: c.id, name: c.name, projectName: c.projectId ? (projectNameById.get(c.projectId) ?? "Project") : undefined }));
  const complete = checklist.items.filter((i) => i.isComplete);

  const renderGroup = (group: ChecklistItemData[]) => (
    <SortableList items={group} as="li" onReorder={(itemIds) => reorderItems.mutate(itemIds)}>
      {(item, dragProps) => (
        <ChecklistItemRow
          item={item}
          dragProps={dragProps}
          popped={item.id === poppedItemId}
          otherChecklists={itemMoveTargets}
          onToggle={(origin) => toggleItem.mutate({ itemId: item.id, origin })}
          onRename={(title) => renameItem.mutate({ itemId: item.id, title })}
          onMove={(targetChecklistId, label) => moveItemToChecklist.mutate({ itemId: item.id, targetChecklistId, label })}
          onToggleQuickWin={
            checklist.kind === "generic" ? () => toggleQuickWin.mutate({ itemId: item.id, isQuickWin: !item.isQuickWin }) : undefined
          }
          onDelete={async () => {
            if (await confirm(`Move "${item.title}" to Trash? You can restore it within 30 days.`)) deleteItem.mutate(item.id);
          }}
        />
      )}
    </SortableList>
  );

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-1.5">
        {dragHandleProps && <DragHandle {...dragHandleProps} />}
        <ExpandableTitle value={checklist.name} onSave={(name) => renameChecklist.mutate(name)} expanded={open} onToggle={() => setOpen((o) => !o)} />
        {checklist.kind === "grocery" && <span className="ml-1 text-xs text-slate-500 dark:text-slate-500">🛒 grocery</span>}
        {checklist.completedAt && (
          <span className="ml-1 text-xs text-green-700 dark:text-green-400">
            ✓ Completed {new Date(checklist.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        )}
        {allComplete && !checklist.completedAt && (
          <span className="ml-1 flex items-center gap-1 text-xs text-yellow-700 dark:text-yellow-400">
            <img src={TREASURE_CHEST_OPEN_ICON} alt="" className={`w-5 h-5 ${PIXEL_ICON_CLASS}`} />
            cleared!
          </span>
        )}
        {checklist.kind !== "note" && (
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto shrink-0"
            onClick={(e) => {
              const completing = !checklist.completedAt;
              if (completing) celebrate("checklist", { x: e.clientX, y: e.clientY });
              setCompleted.mutate(completing);
            }}
          >
            {checklist.completedAt ? "Reopen" : "Complete"}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className={`shrink-0 ${checklist.kind === "note" ? "ml-auto" : ""}`} aria-label="More actions">
              <EllipsisVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="overflow-y-auto font-normal">
            <DropdownMenuLabel>Move</DropdownMenuLabel>
            {checklist.projectId ? (
              <DropdownMenuItem onSelect={() => moveChecklist.mutate({ target: null, label: "its own checklist", from: checklist.projectId })}>
                Make its own checklist (Checklists page)
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => moveChecklist.mutate({ target: "__own_project", label: "its own project", from: null })}>
                Make its own project (Projects page)
              </DropdownMenuItem>
            )}
            {moveTargets.length > 0 && (
              <DropdownMenuItem onSelect={() => setTimeout(() => setPickingProject(true), 0)}>
                <ArrowRightLeft className="h-4 w-4" /> Move into a project…
              </DropdownMenuItem>
            )}
            {checklist.items.some((i) => i.isComplete) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    setTimeout(async () => {
                      if (await confirm(`Uncheck every item on "${checklist.name}"? Nothing is deleted — it's ready to use again.`, "Reset")) {
                        resetItems.mutate();
                      }
                    }, 0)
                  }
                >
                  <RotateCcw className="h-4 w-4" /> Reset (uncheck all items)
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() =>
                setTimeout(async () => {
                  if (await confirm(`Move "${checklist.name}" to Trash? You can restore it within 30 days.`)) deleteChecklist.mutate();
                }, 0)
              }
            >
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </h3>

      {!open ? (
        <div className="text-sm text-slate-600 dark:text-slate-400">
          {checklist.kind === "note" ? (
            <p className="line-clamp-2 whitespace-pre-wrap">{checklist.body}</p>
          ) : (
            <>
              {checklist.description && <p className="mb-1">{checklist.description}</p>}
              <ul className="space-y-0.5">
                {incomplete.slice(0, 3).map((i) => (
                  <li key={i.id} className="truncate">
                    ☐ {i.title}
                  </li>
                ))}
              </ul>
              <button onClick={() => setOpen(true)} className="mt-1 inline-flex min-h-11 items-center text-xs text-blue-700 dark:text-blue-300 hover:underline">
                {incomplete.length > 3 ? `+${incomplete.length - 3} more` : incomplete.length === 0 && complete.length > 0 ? "All done — expand" : "expand"}
              </button>
            </>
          )}
        </div>
      ) : checklist.kind === "note" ? (
        <div className="text-sm text-slate-600 dark:text-slate-300">
          <InlineEditText
            value={checklist.body ?? ""}
            onSave={(body) => editText.mutate({ body })}
            placeholder="Write something..."
            as="textarea"
            allowEmpty
          />
        </div>
      ) : (
        <>
      <div className="text-sm text-slate-600 dark:text-slate-400 mb-2 -mt-1">
        <InlineEditText
          value={checklist.description ?? ""}
          onSave={(description) => editText.mutate({ description })}
          placeholder="Add a description..."
          as="textarea"
          minRows={2}
          allowEmpty
        />
      </div>

      <ul className="space-y-1 mb-3">
        {renderGroup(incomplete)}
        {renderGroup(complete)}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newItemTitle.trim()) addItem.mutate(newItemTitle.trim());
        }}
        className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <Field label="Add an item">
          <Input value={newItemTitle} onChange={(e) => setNewItemTitle(e.target.value)} />
        </Field>
        <Button type="submit" variant="secondary">
          Add
        </Button>
      </form>
      {checklist.items.length > 0 && (
        <p className="hidden [@media(hover:none)]:block mt-2 text-xs text-slate-500">Press and hold an item for move and delete options.</p>
      )}
        </>
      )}
      {pickingProject && (
        <MoveToPicker
          title="Move into a project…"
          groups={[
            { label: "Projects page", options: moveTargets.filter((p) => p.page === "projects").map((p) => ({ id: p.id, label: p.name })) },
            { label: "Checklists page", options: moveTargets.filter((p) => p.page === "checklists").map((p) => ({ id: p.id, label: p.name })) },
          ]}
          onPick={(id, label) => {
            setPickingProject(false);
            moveChecklist.mutate({ target: id, label, from: checklist.projectId });
          }}
          onClose={() => setPickingProject(false)}
        />
      )}
      {dialog}
    </div>
  );
}
