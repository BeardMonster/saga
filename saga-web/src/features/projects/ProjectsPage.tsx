import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "../../core/api/client";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, Input, Textarea } from "@/components/ui/field";
import ProjectCard from "./ProjectCard";
import { SortableList } from "../../shared/components/SortableList";
import AutoGrowTextarea from "../../shared/components/AutoGrowTextarea";
import { useDraftState } from "../../shared/hooks/useDraftState";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "done" | "archived";
  completedAt: string | null;
  page: "projects" | "checklists";
}

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useDraftState("saga-draft-project-name");
  const [newDescription, setNewDescription] = useDraftState("saga-draft-project-description");
  const [includeChecklist, setIncludeChecklist] = useState(false);

  const { data } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<Project[]>("/projects"),
  });

  const createProject = useMutation({
    mutationFn: () => apiPost("/projects", { name: newName, description: newDescription || undefined, includeChecklist }),
    onSuccess: () => {
      setNewName("");
      setNewDescription("");
      setIncludeChecklist(false);
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const reorderProjects = useMutation({
    mutationFn: (ids: string[]) => apiPatch("/projects/reorder", { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });

  const onPage = (data?.data ?? []).filter((p) => p.page === "projects");
  const projects = onPage.filter((p) => p.status === "active");
  const completed = onPage
    .filter((p) => p.status === "done")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Projects</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) createProject.mutate();
        }}
        className="grid gap-3"
      >
        <Field label="New project">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name your project" />
        </Field>
        <Field label="Description (optional)">
          <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} minRows={1} />
        </Field>
        <CheckboxField checked={includeChecklist} onChange={setIncludeChecklist}>
          Include a checklist
        </CheckboxField>
        <div className="flex justify-end">
          <Button type="submit">Create Project</Button>
        </div>
      </form>

      <div className="space-y-4">
        <SortableList items={projects} onReorder={(ids) => reorderProjects.mutate(ids)}>
          {(p, dragProps) => <ProjectCard key={p.id} project={p} dragHandleProps={dragProps} />}
        </SortableList>
        {projects.length === 0 && <p className="text-slate-500 dark:text-slate-500 text-sm">No active projects — create one above.</p>}
      </div>

      {completed.length > 0 && (
        <section className="space-y-3 pt-2">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Completed ({completed.length})</h3>
          {completed.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </section>
      )}
    </div>
  );
}
