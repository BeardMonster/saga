import { BellRing, Clock } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../core/api/client";
import { celebrate, originOf } from "../../shared/lib/celebrate";
import { formatInstant } from "../../shared/lib/dates";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface OpenReminder {
  id: string;
  title: string;
  fireAt: string;
  nagAt: string | null;
}

const SNOOZES: { label: string; body: { minutes: number } | { tomorrow: true } }[] = [
  { label: "15 minutes", body: { minutes: 15 } },
  { label: "1 hour", body: { minutes: 60 } },
  { label: "3 hours", body: { minutes: 180 } },
  { label: "Tomorrow at 9:00 AM", body: { tomorrow: true } },
];

// Reminders that have gone off and still need a decision: anything snoozed
// (kept here until it's marked Done — a snoozed reminder keeps coming back,
// by design, so it can't be quietly forgotten) plus anything that fired in
// the last couple of days and was never touched. Renders nothing when
// there's nothing to decide, so it doesn't clutter the page on a clear day.
export default function OpenRemindersCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["reminders", "open"],
    queryFn: () => apiGet<OpenReminder[]>("/reminders/open"),
    // A snooze expires / a nag fires on the server's clock, not ours.
    refetchInterval: 60_000,
  });
  const open = data?.data ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["reminders"] });

  const done = useMutation({
    // sound: null — celebrate() below plays this mutation's actual sound.
    mutationFn: ({ id }: { id: string; origin: { x: number; y: number } }) =>
      apiPost(`/reminders/instances/${id}/done`, undefined, { sound: null }),
    onSuccess: (_res, { origin }) => {
      celebrate("item", origin);
      refresh();
    },
  });

  const snooze = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { minutes: number } | { tomorrow: true } }) =>
      apiPost(`/reminders/instances/${id}/snooze`, body, { sound: "move" }),
    onSuccess: refresh,
  });

  if (open.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-4 shadow-sm space-y-3">
      <h3 className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
        <BellRing className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Needs your attention
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">Snoozed reminders keep coming back until you mark them done.</p>
      <ul className="space-y-2">
        {open.map((r) => (
          <li key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
            <div>
              <p className="break-words font-medium text-slate-800 dark:text-slate-100">{r.title}</p>
              <p className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                {r.nagAt ? (
                  <>
                    <Clock className="h-3 w-3" /> Snoozed — back at {formatInstant(r.nagAt, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                  </>
                ) : (
                  <>Went off {formatInstant(r.fireAt)}</>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={(e) => done.mutate({ id: r.id, origin: originOf(e) })} disabled={done.isPending}>
                Done
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={snooze.isPending}>
                    Snooze
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {SNOOZES.map((s) => (
                    <DropdownMenuItem key={s.label} onSelect={() => setTimeout(() => snooze.mutate({ id: r.id, body: s.body }), 0)}>
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
