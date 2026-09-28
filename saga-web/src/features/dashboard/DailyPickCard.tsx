import { Link } from "react-router-dom";
import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "../../core/api/client";
import { celebrate, originOf } from "../../shared/lib/celebrate";

interface DailyPick {
  id: string | null;
  item: { id: string; title: string; isComplete: boolean; checklistId: string; checklistName: string } | null;
}

// One suggested task, so "what should I do" has an answer without having to
// open every list. Sticks with the same pick all day (see the API) rather
// than re-rolling on every visit — a moving target isn't motivating.
export default function DailyPickCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["daily-pick"], queryFn: () => apiGet<DailyPick>("/daily-pick") });
  const pick = data?.data;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["daily-pick"] });

  const shuffle = useMutation({
    mutationFn: () => apiPost("/daily-pick/shuffle"),
    onSuccess: invalidate,
  });

  const complete = useMutation({
    // sound: null — celebrate() below plays this mutation's actual sound.
    mutationFn: ({ checklistId }: { checklistId: string; origin: { x: number; y: number } }) =>
      apiPatch(`/checklists/${checklistId}/items/${pick!.item!.id}/toggle`, undefined, { sound: null }),
    onSuccess: (_res, { origin }) => {
      celebrate("item", origin);
      invalidate();
    },
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
      <h3 className="font-semibold text-slate-800 dark:text-slate-100">Today's one thing</h3>

      {!pick?.item ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Nothing open on your lists right now.{" "}
          <Link to="/checklists" className="underline text-primary">
            Add something
          </Link>{" "}
          and I'll suggest it here.
        </p>
      ) : pick.item.isComplete ? (
        <div className="space-y-2">
          <p className="text-slate-700 dark:text-slate-200">
            ✅ <span className="line-through opacity-70">{pick.item.title}</span>
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400">Nice. That's today's done.</p>
          <Button variant="ghost" size="sm" onClick={() => shuffle.mutate()} disabled={shuffle.isPending}>
            <Shuffle className="h-4 w-4" /> Got energy for one more?
          </Button>
        </div>
      ) : (
        <>
          <p className="text-slate-800 dark:text-slate-100">{pick.item.title}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">from {pick.item.checklistName}</p>
          <div className="flex items-center gap-2">
            <Button
              onClick={(e) => complete.mutate({ checklistId: pick.item!.checklistId, origin: originOf(e) })}
              disabled={complete.isPending}
            >
              Done! 🎉
            </Button>
            <Button variant="ghost" size="sm" onClick={() => shuffle.mutate()} disabled={shuffle.isPending}>
              <Shuffle className="h-4 w-4" /> Different one
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
