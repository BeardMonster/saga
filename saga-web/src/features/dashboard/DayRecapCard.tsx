import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../core/api/client";

interface TodayRecap {
  items: { title: string; checklistName: string }[];
  checklists: { name: string }[];
  projects: { name: string }[];
}

const MAX_SHOWN = 8;

// A warm, specific recap — not just the "finished today" number already on
// the dashboard, since a bare count doesn't feel like an accomplishment the
// way seeing the actual titles does. Updates live through the day rather
// than waiting for some fixed "end of day" hour — no reason to withhold the
// good feeling until evening if it's already there at 2pm.
export default function DayRecapCard() {
  const { data } = useQuery({ queryKey: ["stats", "today-recap"], queryFn: () => apiGet<TodayRecap>("/stats/today-recap") });
  const recap = data?.data;

  const lines = recap
    ? [
        ...recap.projects.map((p) => ({ text: p.name, detail: "project finished" })),
        ...recap.checklists.map((c) => ({ text: c.name, detail: "checklist finished" })),
        ...recap.items.map((i) => ({ text: i.title, detail: i.checklistName })),
      ]
    : [];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
      <h3 className="font-semibold text-slate-800 dark:text-slate-100">Today's wins</h3>

      {lines.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">Nothing finished yet today — that's alright, the day isn't over.</p>
      ) : (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">Here's what you knocked out today:</p>
          <ul className="space-y-1">
            {lines.slice(0, MAX_SHOWN).map((line, i) => (
              <li key={i} className="flex items-baseline gap-1.5 text-sm text-slate-800 dark:text-slate-100">
                <span aria-hidden>✓</span>
                <span className="min-w-0 flex-1 break-words">{line.text}</span>
                <span className="shrink-0 text-xs text-slate-500 dark:text-slate-500">{line.detail}</span>
              </li>
            ))}
          </ul>
          {lines.length > MAX_SHOWN && <p className="text-xs text-slate-600 dark:text-slate-400">+{lines.length - MAX_SHOWN} more</p>}
        </>
      )}
    </div>
  );
}
