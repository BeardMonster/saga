const STATUS_STYLE: Record<string, string> = {
  done: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  next: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  idea: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
};
const STATUS_LABEL: Record<string, string> = { done: "Live", next: "Up next", idea: "Idea" };

// A running list of the ADHD-friendly reward ideas discussed, so trying them
// stays visible instead of living only in old chat history. Update the
// `status` by hand as each one ships — this is a small, hand-kept list, not
// something worth a database table for.
const IDEAS: { label: string; status: "done" | "next" | "idea" }[] = [
  { label: "Streak counter (forgiving — one missed day doesn't reset it)", status: "done" },
  { label: "Body doubling timer, incl. Race the Clock", status: "done" },
  { label: "A distinct sound for errors / failed saves", status: "done" },
  { label: "Daily \"pick one thing\" suggestion", status: "done" },
  { label: "Per-checklist progress bar that fills as you go", status: "idea" },
  { label: "Occasional surprise/bigger celebration, not always the same one", status: "idea" },
  { label: "\"Quick wins\" filter for 5-minute tasks on low-energy days", status: "done" },
  { label: "Warm end-of-day recap of what got finished", status: "idea" },
];

export default function RewardIdeasCard() {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
      <h3 className="font-semibold text-slate-800 dark:text-slate-100">ADHD-friendly reward ideas</h3>
      <ul className="space-y-1.5">
        {IDEAS.map((idea) => (
          <li key={idea.label} className="flex items-start justify-between gap-2 text-sm text-slate-700 dark:text-slate-200">
            <span>{idea.label}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[idea.status]}`}>{STATUS_LABEL[idea.status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
