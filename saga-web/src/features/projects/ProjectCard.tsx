import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "../../core/api/client";
import { deleteWithUndo } from "../../core/api/undoableDelete";
import { useConfirm } from "../../shared/hooks/useConfirm";
import ChecklistCard from "../../shared/components/ChecklistCard";
import { celebrate, originOf } from "../../shared/lib/celebrate";
import { notifyMoved } from "../../core/api/undoableMove";
import InlineEditText from "../../shared/components/InlineEditText";
import ExpandableTitle from "../../shared/components/ExpandableTitle";
import { ChevronDown, ChevronUp, EllipsisVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SortableList, DragHandle, type SortableHandleProps } from "../../shared/components/SortableList";

interface ChecklistSummary {
  id: string;
  name: string;
  projectId: string | null;
  completedAt: string | null;
  kind: "generic" | "grocery" | "note";
  items: { id: string; title: string; isComplete: boolean }[];
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "done" | "archived";
  completedAt: string | null;
  page: "projects" | "checklists";
}

export default function ProjectCard({
  project,
  dragHandleProps,
}: {
  project: Project;
  dragHandleProps?: SortableHandleProps;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const [newChecklistName, setNewChecklistName] = useState("");
  const sectionInputRef = useRef<HTMLInputElement>(null);
  const [focusSectionInput, setFocusSectionInput] = useState(false);
  useEffect(() => {
    if (focusSectionInput && expanded) {
      sectionInputRef.current?.focus();
      sectionInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      setFocusSectionInput(false);
    }
  }, [focusSectionInput, expanded]);
  const [newSectionKind, setNewSectionKind] = useState<"generic" | "note">("generic");

  const { data } = useQuery({
    queryKey: ["checklists", "project", project.id],
    queryFn: () => apiGet<ChecklistSummary[]>(`/checklists?projectId=${project.id}`),
  });

  const createChecklist = useMutation({
    mutationFn: () => apiPost("/checklists", { name: newChecklistName, kind: newSectionKind, projectId: project.id }),
    onSuccess: () => {
      setNewChecklistName("");
      queryClient.invalidateQueries({ queryKey: ["checklists", "project", project.id] });
    },
  });

  const toggleItem = useMutation({
    // sound: null — the checkbox's own onChange below calls celebrate().
    mutationFn: ({ checklistId, itemId }: { checklistId: string; itemId: string }) =>
      apiPatch(`/checklists/${checklistId}/items/${itemId}/toggle`, undefined, { sound: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      queryClient.invalidateQueries({ queryKey: ["checklist"] });
    },
  });

  const deleteProject = useMutation({
    mutationFn: () => deleteWithUndo(`/projects/${project.id}`, "project", project.id, "Project"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
    },
  });

  const updateProject = useMutation({
    // A status change (Complete/Reopen) has its own celebrate() call at its
    // one call site below; any other field (name, description) just gets
    // the normal "save" cue.
    mutationFn: (body: Partial<{ name: string; description: string; status: Project["status"]; page: Project["page"] }>) =>
      apiPatch(`/projects/${project.id}`, body, "status" in body ? { sound: null } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
    },
  });

  // Moving a whole project to the other page. A project that was just a
  // wrapper around one checklist unwraps into that checklist (see the API),
  // so undoing that means wrapping it again.
  const movePage = useMutation({
    mutationFn: (page: Project["page"]) => apiPatch<{ unwrappedChecklistId?: string }>(`/projects/${project.id}`, { page }),
    onSuccess: (result, page) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      const unwrapped = result.data?.unwrappedChecklistId;
      notifyMoved(
        `Moved to the ${page === "projects" ? "Projects" : "Checklists"} page`,
        unwrapped ? () => apiPost(`/checklists/${unwrapped}/make-project`, {}) : () => apiPatch(`/projects/${project.id}`, { page: project.page }),
      );
    },
  });

  const reorderChecklists = useMutation({
    mutationFn: (checklistIds: string[]) => apiPatch("/checklists/reorder", { projectId: project.id, checklistIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklists", "project", project.id] }),
  });

  const allChecklists = data?.data ?? [];
  const checklists = allChecklists.filter((c) => !c.completedAt);
  const completedChecklists = allChecklists.filter((c) => c.completedAt);
  // A few open items pulled from the project's checklist sections, shown
  // while the card is collapsed.
  const openItems = checklists
    .filter((c) => c.kind !== "note")
    .flatMap((c) => c.items.filter((i) => !i.isComplete).map((i) => ({ ...i, checklistId: c.id })));

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            {dragHandleProps && <DragHandle {...dragHandleProps} />}
            <ExpandableTitle value={project.name} onSave={(name) => updateProject.mutate({ name })} expanded={expanded} onToggle={() => setExpanded((e) => !e)} />
          </h3>
          {project.status === "done" && project.completedAt && (
            <p className="text-xs text-green-700 dark:text-green-400 mt-1">
              ✓ Completed {new Date(project.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
          <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            <InlineEditText
              value={project.description ?? ""}
              onSave={(description) => updateProject.mutate({ description })}
              placeholder="Add a description..."
              as="textarea"
              allowEmpty
            />
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={(e) => {
            if (project.status !== "done") celebrate("project", originOf(e));
            updateProject.mutate({ status: project.status === "done" ? "active" : "done" });
          }}
        >
          {project.status === "done" ? "Reopen" : "Complete"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="More actions">
              <EllipsisVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => movePage.mutate(project.page === "projects" ? "checklists" : "projects")}>
              Move to {project.page === "projects" ? "Checklists" : "Projects"} page
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() =>
                setTimeout(async () => {
                  if (await confirm(`Move "${project.name}" to Trash? Its checklists and items go with it — you can restore them all together within 30 days.`)) {
                    deleteProject.mutate();
                  }
                }, 0)
              }
            >
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!expanded && allChecklists.length > 0 && (
        <div className="mt-3 space-y-1">
          {openItems.slice(0, 3).map((i) => (
            <label key={i.id} className="flex min-h-11 items-center gap-3 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={false}
                onChange={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  celebrate("item", { x: r.left + r.width / 2, y: r.top });
                  toggleItem.mutate({ checklistId: i.checklistId, itemId: i.id });
                }}
                className="h-5 w-5 shrink-0 rounded accent-green-600 cursor-pointer"
              />
              <span className="truncate">{i.title}</span>
            </label>
          ))}
          <button onClick={() => setExpanded(true)} className="inline-flex min-h-11 items-center text-xs text-blue-700 dark:text-blue-300 hover:underline">
            {openItems.length > 3 ? `+${openItems.length - 3} more` : "expand"}
          </button>
        </div>
      )}

      {expanded && (
        <div className="mt-4 pl-4 border-l-2 border-slate-100 dark:border-slate-800 space-y-3">
          <button onClick={() => setExpanded(false)} className="text-sm font-medium text-blue-600 dark:text-blue-300 hover:underline py-1">
            ▴ Collapse
          </button>
          <SortableList items={checklists} onReorder={(checklistIds) => reorderChecklists.mutate(checklistIds)}>
            {(c, dragProps) => <ChecklistCard key={c.id} checklistId={c.id} dragHandleProps={dragProps} />}
          </SortableList>

          {completedChecklists.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-500">Completed</p>
              {completedChecklists.map((c) => (
                <ChecklistCard key={c.id} checklistId={c.id} />
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newChecklistName.trim()) createChecklist.mutate();
            }}
            className="grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end"
          >
            <Field label="New section title">
              <Input ref={sectionInputRef} value={newChecklistName} onChange={(e) => setNewChecklistName(e.target.value)} />
            </Field>
            <Field label="Type">
              <Select value={newSectionKind} onChange={(e) => setNewSectionKind(e.target.value as "generic" | "note")}>
                <option value="generic">Checklist</option>
                <option value="note">Text</option>
              </Select>
            </Field>
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setExpanded(true);
            setFocusSectionInput(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add section
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4" /> Collapse
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" /> Expand
            </>
          )}
        </Button>
      </div>
      {dialog}
    </div>
  );
}
