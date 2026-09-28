import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "../../core/api/client";
import ChecklistCard from "../../shared/components/ChecklistCard";
import { SortableList } from "../../shared/components/SortableList";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import ProjectCard from "../projects/ProjectCard";
import AutoGrowTextarea from "../../shared/components/AutoGrowTextarea";

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "done" | "archived";
  completedAt: string | null;
  page: "projects" | "checklists";
}

interface ChecklistSummary {
  id: string;
  name: string;
  kind: "generic" | "grocery" | "note";
  completedAt: string | null;
}

export default function ChecklistsPage() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const { data } = useQuery({
    queryKey: ["checklists", "standalone"],
    queryFn: () => apiGet<ChecklistSummary[]>("/checklists?standalone=true"),
  });

  const createChecklist = useMutation({
    mutationFn: () => apiPost("/checklists", { name: newName, description: newDescription || undefined }),
    onSuccess: () => {
      setNewName("");
      setNewDescription("");
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
    },
  });

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<ProjectSummary[]>("/projects"),
  });
  const reorderProjects = useMutation({
    mutationFn: (ids: string[]) => apiPatch("/projects/reorder", { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
  // Projects moved over from the Projects page keep their sections as-is.
  const movedProjects = (projectsQuery.data?.data ?? []).filter((p) => p.page === "checklists");
  const activeContainers = movedProjects.filter((p) => p.status === "active");
  const completedContainers = movedProjects.filter((p) => p.status === "done");

  const reorderChecklists = useMutation({
    mutationFn: (checklistIds: string[]) => apiPatch("/checklists/reorder", { projectId: null, checklistIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklists"] }),
  });

  // Grocery-kind checklists live on the Grocery Deals page now, alongside
  // the rest of the grocery stuff, instead of mixed in here.
  const all = (data?.data ?? []).filter((c) => c.kind !== "grocery");
  const checklists = all.filter((c) => !c.completedAt);
  const completed = all
    .filter((c) => c.completedAt)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Checklists</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) createChecklist.mutate();
        }}
        className="grid gap-3"
      >
        <Field label="New checklist">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name your checklist" />
        </Field>
        <Field label="Description (optional)">
          <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} minRows={1} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit">Create Checklist</Button>
        </div>
      </form>

      <div className="space-y-4">
        <SortableList items={checklists} onReorder={(checklistIds) => reorderChecklists.mutate(checklistIds)}>
          {(c, dragProps) => <ChecklistCard key={c.id} checklistId={c.id} dragHandleProps={dragProps} />}
        </SortableList>
        <SortableList items={activeContainers} onReorder={(ids) => reorderProjects.mutate(ids)}>
          {(p, dragProps) => <ProjectCard key={p.id} project={p} dragHandleProps={dragProps} />}
        </SortableList>
        {checklists.length === 0 && activeContainers.length === 0 && (
          <p className="text-slate-500 dark:text-slate-500 text-sm">
            {completed.length > 0 ? "Nothing active — create a checklist above." : "No standalone checklists yet — create one above, or add one inside a project."}
          </p>
        )}
      </div>

      {(completed.length > 0 || completedContainers.length > 0) && (
        <section className="space-y-4 pt-2">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Completed ({completed.length + completedContainers.length})</h3>
          {completed.map((c) => (
            <ChecklistCard key={c.id} checklistId={c.id} />
          ))}
          {completedContainers.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </section>
      )}
    </div>
  );
}
