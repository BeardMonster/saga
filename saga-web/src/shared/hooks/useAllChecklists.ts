import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../core/api/client";

export interface ChecklistSummary {
  id: string;
  name: string;
  projectId: string | null;
  completedAt: string | null;
  kind: "generic" | "grocery" | "note";
  items: { id: string; title: string; isComplete: boolean }[];
}

// ONE request for every checklist, shared by every card on the page. Cards
// that only want one project's sections (or a list of move targets) filter it
// with `select` instead of each firing a request of its own — with 20 projects
// on screen the per-card version made 20+ simultaneous requests after every
// create/delete, which is what made the app feel slow.
export const ALL_CHECKLISTS_KEY = ["checklists", "all"] as const;

export function useAllChecklists<T = ChecklistSummary[]>(select?: (all: ChecklistSummary[]) => T) {
  return useQuery({
    queryKey: ALL_CHECKLISTS_KEY,
    queryFn: () => apiGet<ChecklistSummary[]>("/checklists"),
    select: (res) => (select ? select(res.data ?? []) : ((res.data ?? []) as unknown as T)),
  });
}
