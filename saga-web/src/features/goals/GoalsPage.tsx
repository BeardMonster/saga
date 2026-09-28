import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "../../core/api/client";
import { deleteWithUndo } from "../../core/api/undoableDelete";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { HORIZON_ICON, GOAL_TIER_ICON, PIXEL_ICON_CLASS, type Horizon } from "../../shared/lib/icons";
import InlineEditText from "../../shared/components/InlineEditText";
import { SortableList, DragHandle } from "../../shared/components/SortableList";
import { EllipsisVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { celebrate, originOf } from "../../shared/lib/celebrate";

interface Goal {
  id: string;
  title: string;
  description: string | null;
  horizon: Horizon;
  horizonLabel: string | null;
  status: "active" | "achieved" | "abandoned";
  targetDate: string | null;
}

const HORIZON_LABELS: Record<Horizon, string> = {
  ten_year: "10 Years",
  five_year: "5 Years",
  three_year: "3 Years",
  one_year: "1 Year",
  six_month: "6 Months",
  three_month: "3 Months",
  one_month: "1 Month",
  two_week: "2 Weeks",
  one_week: "1 Week",
};

const UNIT_DAYS = { days: 1, weeks: 7, months: 30, years: 365 } as const;
type CustomUnit = keyof typeof UNIT_DAYS;

// A custom time frame ("7 years", "3 days") keeps the user's own wording as
// its label, but is filed under the nearest built-in group so goals still
// sort by size and get a matching icon.
function nearestHorizon(days: number): Horizon {
  if (days <= 10) return "one_week";
  if (days <= 21) return "two_week";
  if (days <= 60) return "one_month";
  if (days <= 135) return "three_month";
  if (days <= 270) return "six_month";
  if (days <= 730) return "one_year";
  if (days <= 1460) return "three_year";
  if (days <= 2737) return "five_year";
  return "ten_year";
}

function customLabel(amount: number, unit: CustomUnit): string {
  return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;
}

export default function GoalsPage() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [horizon, setHorizon] = useState<Horizon | "custom">("one_year");
  const [customAmount, setCustomAmount] = useState("");
  const [customUnit, setCustomUnit] = useState<CustomUnit>("years");
  const [targetDate, setTargetDate] = useState("");

  const { data } = useQuery({
    queryKey: ["goals"],
    queryFn: () => apiGet<Goal[]>("/goals"),
  });

  const createGoal = useMutation({
    mutationFn: () => {
      const amount = Number(customAmount);
      const isCustom = horizon === "custom";
      return apiPost("/goals", {
        title,
        description: description || undefined,
        horizon: isCustom ? nearestHorizon(amount * UNIT_DAYS[customUnit]) : horizon,
        horizonLabel: isCustom ? customLabel(amount, customUnit) : undefined,
        targetDate: targetDate || undefined,
      });
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setTargetDate("");
      setCustomAmount("");
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });

  const deleteGoal = useMutation({
    mutationFn: (id: string) => deleteWithUndo(`/goals/${id}`, "goal", id, "Goal"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
  });

  const markAchieved = useMutation({
    // sound: null — celebrate() below plays this mutation's actual sound.
    mutationFn: (id: string) => apiPatch(`/goals/${id}`, { status: "achieved" }, { sound: null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
  });

  const updateGoal = useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; description?: string; targetDate?: string | null }) => apiPatch(`/goals/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
  });

  const reorderGoals = useMutation({
    mutationFn: (ids: string[]) => apiPatch("/goals/reorder", { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
  });

  const goals = data?.data ?? [];
  // Goals only reorder within their own horizon (the list is grouped by
  // horizon), so each horizon gets its own sortable group.
  const horizonGroups = goals.reduce<Goal[][]>((groups, g) => {
    const last = groups[groups.length - 1];
    if (last && last[0].horizon === g.horizon) last.push(g);
    else groups.push([g]);
    return groups;
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Goals</h2>
      <p className="text-slate-600 dark:text-slate-400 text-sm -mt-3">The "why" behind everything else.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && (horizon !== "custom" || Number(customAmount) > 0)) createGoal.mutate();
        }}
        className="grid gap-3"
      >
        <Field label="Goal">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you want to achieve?" />
        </Field>
        <Field label="Why does this matter? (optional)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} minRows={2} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Time frame">
            <Select value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon | "custom")}>
              {Object.entries(HORIZON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
                <option value="custom">Custom…</option>
            </Select>
          </Field>
          <Field label="Target date (optional)">
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </Field>
        </div>
        {horizon === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="How long?">
              <Input type="number" min={1} inputMode="numeric" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder="e.g. 7" required />
            </Field>
            <Field label="Unit">
              <Select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as CustomUnit)}>
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
                <option value="months">Months</option>
                <option value="years">Years</option>
              </Select>
            </Field>
          </div>
        )}
        <div className="flex justify-end">
          <Button type="submit">Add Goal</Button>
        </div>
      </form>

      <div className="space-y-3">
        {horizonGroups.map((group) => (
          <SortableList key={group[0].horizon} items={group} onReorder={(ids) => reorderGoals.mutate(ids)}>
            {(g, dragProps) => (
          <div
            className={`rounded-xl border p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start ${
              g.status === "achieved"
                ? "border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            }`}
          >
            <div className="flex gap-3 items-start min-w-0">
              <DragHandle {...dragProps} />
              <img
                src={g.status === "achieved" ? GOAL_TIER_ICON[g.horizon] : HORIZON_ICON[g.horizon]}
                alt=""
                className={`w-8 h-8 shrink-0 mt-0.5 ${PIXEL_ICON_CLASS}`}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wide mb-1">
                  <span>{g.horizonLabel ?? HORIZON_LABELS[g.horizon]}</span>
                  <span>·</span>
                  <label className="normal-case flex items-center gap-1" title="Target date">
                    {g.targetDate ? "by" : "set date"}
                    <input
                      type="date"
                      value={g.targetDate ? g.targetDate.slice(0, 10) : ""}
                      onChange={(e) => updateGoal.mutate({ id: g.id, targetDate: e.target.value || null })}
                      className="min-h-10 bg-transparent text-sm text-slate-600 dark:text-slate-400 border-b border-dashed border-slate-300 dark:border-slate-600 focus:outline-none"
                    />
                  </label>
                  {g.status === "achieved" && <span className="text-yellow-600 dark:text-yellow-400">· Achieved!</span>}
                </div>
                <h3 className={`font-semibold ${g.status === "achieved" ? "text-yellow-900 dark:text-yellow-100" : "text-slate-800 dark:text-slate-100"}`}>
                  <InlineEditText value={g.title} onSave={(title) => updateGoal.mutate({ id: g.id, title })} />
                </h3>
                <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  <InlineEditText
                    value={g.description ?? ""}
                    onSave={(description) => updateGoal.mutate({ id: g.id, description })}
                    placeholder="Why does this matter?"
                    as="textarea"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 self-end sm:self-start shrink-0">
              {g.status === "active" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    celebrate("goal", originOf(e));
                    markAchieved.mutate(g.id);
                  }}
                >
                  Mark Achieved
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <EllipsisVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    destructive
                    onSelect={() =>
                      setTimeout(async () => {
                        if (await confirm(`Move "${g.title}" to Trash? You can restore it within 30 days.`)) deleteGoal.mutate(g.id);
                      }, 0)
                    }
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
            )}
          </SortableList>
        ))}
        {goals.length === 0 && <p className="text-slate-500 dark:text-slate-500 text-sm">No goals yet — start with something 10 years out.</p>}
      </div>
      {dialog}
    </div>
  );
}
