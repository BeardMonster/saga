import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../core/api/client";
import FocusTimer from "./FocusTimer";
import RewardIdeasCard from "./RewardIdeasCard";
import RandomInsultCard from "./RandomInsultCard";
import DailyPickCard from "./DailyPickCard";
import QuickWinsCard from "./QuickWinsCard";
import DayRecapCard from "./DayRecapCard";

interface HomeStats {
  completedToday: number;
  completedThisWeek: number;
  completedAllTime: number;
  streakDays: number;
  openChecklists: number;
  openProjects: number;
  activeGoals: number;
}

// A count of things FINISHED, never a ratio against how much is still open —
// adding ten more checklists this afternoon shouldn't make today look like a
// step backward. See saga-api/src/modules/stats/service.ts.
function StatCard({ value, label, big }: { value: number; label: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-center shadow-sm">
      <p className={big ? "text-4xl font-bold text-primary" : "text-2xl font-bold text-slate-800 dark:text-slate-100"}>{value}</p>
      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{label}</p>
    </div>
  );
}

export default function Dashboard() {
  const stats = useQuery({ queryKey: ["stats", "home"], queryFn: () => apiGet<HomeStats>("/stats/home") });
  const s = stats.data?.data;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Saga</h1>
        <p className="text-slate-600 dark:text-slate-400">Your projects, checklists, and goals — pick a section above to get started.</p>
      </div>

      {s && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard value={s.streakDays} label="day streak" big />
            <StatCard value={s.completedToday} label="finished today" big />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard value={s.completedThisWeek} label="this week" />
            <StatCard value={s.completedAllTime} label="all time" />
            <StatCard value={s.openChecklists + s.openProjects} label="active lists" />
          </div>
        </>
      )}

      <DayRecapCard />
      <DailyPickCard />
      <QuickWinsCard />
      <RandomInsultCard />
      <FocusTimer />
      <RewardIdeasCard />
    </div>
  );
}
