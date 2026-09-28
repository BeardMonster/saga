import { Zap } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "../../core/api/client";
import { celebrate } from "../../shared/lib/celebrate";

interface QuickWinItem {
  id: string;
  title: string;
  checklist: { id: string; name: string };
}

// Every item hand-flagged "short and easy" (via a checklist item's ⋮ menu),
// gathered in one place — for a low-energy day when opening five separate
// checklists to find something small feels like too much on its own.
export default function QuickWinsCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["quick-wins"], queryFn: () => apiGet<QuickWinItem[]>("/checklists/quick-wins") });
  const items = data?.data ?? [];

  const complete = useMutation({
    // sound: null — celebrate() below plays this mutation's actual sound.
    mutationFn: ({ checklistId, itemId }: { checklistId: string; itemId: string; origin: { x: number; y: number } }) =>
      apiPatch(`/checklists/${checklistId}/items/${itemId}/toggle`, undefined, { sound: null }),
    onSuccess: (_res, { origin }) => {
      celebrate("item", origin);
      queryClient.invalidateQueries({ queryKey: ["quick-wins"] });
      queryClient.invalidateQueries({ queryKey: ["checklist"] });
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
    },
  });

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
      <h3 className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
        <Zap className="h-4 w-4 text-amber-500" /> Quick wins
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">Low on energy? Short, easy stuff someone (you) flagged ahead of time.</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">
            <label className="flex h-8 w-8 shrink-0 -mx-1 cursor-pointer items-center justify-center">
              <input
                type="checkbox"
                onChange={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  complete.mutate({ checklistId: item.checklist.id, itemId: item.id, origin: { x: r.left + r.width / 2, y: r.top } });
                }}
                aria-label={`Mark "${item.title}" done`}
                className="h-5 w-5 rounded accent-green-600 cursor-pointer"
              />
            </label>
            <span className="min-w-0 flex-1 break-words text-slate-700 dark:text-slate-200">{item.title}</span>
            <span className="shrink-0 text-xs text-slate-500 dark:text-slate-500">{item.checklist.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
