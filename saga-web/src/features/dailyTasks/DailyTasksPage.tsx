import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, EllipsisVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../../core/api/client";
import { deleteWithUndo } from "../../core/api/undoableDelete";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { useDraftState, clearDraft } from "../../shared/hooks/useDraftState";
import { celebrate } from "../../shared/lib/celebrate";
import { formatTimeOfDay } from "../../shared/lib/dates";
import { GOLD_STAR_ICON, PIXEL_ICON_CLASS } from "../../shared/lib/icons";
import { SortableList, DragHandle, type SortableHandleProps } from "../../shared/components/SortableList";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface DailyTask {
  id: string;
  title: string;
  daysOfWeek: number[];
  reminderTime: string | null;
  dueToday: boolean;
  doneToday: boolean;
}
interface DailyTasksData {
  today: string;
  weekday: number;
  tasks: DailyTask[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DRAFT_TITLE_KEY = "saga-draft-daily-task-title";

// "Every day", "Every day except Sun", "Mon, Wed, Fri" — the way it'd be said
// out loud, so the schedule reads at a glance on each row.
function describeDays(days: number[]): string {
  if (days.length === 7) return "Every day";
  const missing = ALL_DAYS.filter((d) => !days.includes(d));
  if (missing.length === 1) return `Every day except ${DAY_LABELS[missing[0]]}`;
  if (days.join() === "1,2,3,4,5") return "Weekdays";
  if (days.join() === "0,6") return "Weekends";
  return days.map((d) => DAY_LABELS[d]).join(", ");
}

function TaskFields({
  title,
  onTitle,
  days,
  onDays,
  time,
  onTime,
}: {
  title: string;
  onTitle: (v: string) => void;
  days: number[];
  onDays: (v: number[]) => void;
  time: string;
  onTime: (v: string) => void;
}) {
  const toggleDay = (d: number) => onDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b));
  return (
    <div className="grid gap-3">
      <Field label="What's the task? *">
        <Input value={title} onChange={(e) => onTitle(e.target.value)} placeholder="e.g. Feed Pixel (morning)" />
      </Field>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">Days it's due</legend>
        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS.map((label, d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days.includes(d)}
              aria-label={DAY_FULL[d]}
              onClick={() => toggleDay(d)}
              className={cn(
                "h-12 rounded-xl border text-xs font-medium transition-colors md:h-10",
                days.includes(d)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-slate-600 hover:bg-accent dark:text-slate-300",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {days.length === 0 && <p className="text-xs text-red-600 dark:text-red-400">Pick at least one day.</p>}
      </fieldset>
      <div className="flex items-end gap-2">
        <Field label="Reminder time (optional)" className="flex-1" hint="On the days it's due, you'll get a phone notification at this time until it's checked off.">
          <Input type="time" value={time} onChange={(e) => onTime(e.target.value)} />
        </Field>
        {time && (
          <Button type="button" variant="outline" className="shrink-0" onClick={() => onTime("")}>
            No reminder
          </Button>
        )}
      </div>
    </div>
  );
}

function DailyTaskRow({
  task,
  dragProps,
  popped,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: DailyTask;
  dragProps: SortableHandleProps;
  popped: boolean;
  onToggle: (origin: { x: number; y: number }) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const muted = !task.dueToday;
  return (
    <div className={`relative flex items-center gap-2 bg-white dark:bg-slate-900 ${popped ? "animate-complete-pop" : ""}`}>
      <DragHandle {...dragProps} />
      {task.dueToday ? (
        <label className="-mx-1.5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={task.doneToday}
            onChange={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onToggle({ x: r.left + r.width / 2, y: r.top });
            }}
            aria-label={`Mark "${task.title}" done for today`}
            className="h-5 w-5 cursor-pointer rounded accent-green-600"
          />
        </label>
      ) : (
        <span className="-mx-1.5 h-10 w-10 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1 py-1">
        <p
          className={cn(
            "break-words",
            task.doneToday ? "text-slate-500 line-through dark:text-slate-500" : muted ? "text-slate-500 dark:text-slate-400" : "text-slate-700 dark:text-slate-200",
          )}
        >
          {task.title}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{describeDays(task.daysOfWeek)}</span>
          {task.reminderTime && (
            <span className="inline-flex items-center gap-0.5" title="Reminder time">
              <BellRing className="h-3 w-3" /> {formatTimeOfDay(task.reminderTime)}
            </span>
          )}
        </p>
      </div>
      {popped && <img src={GOLD_STAR_ICON} alt="" className={`absolute left-6 -top-2 h-5 w-5 animate-sparkle-burst ${PIXEL_ICON_CLASS}`} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0" aria-label={`Actions for ${task.title}`}>
            <EllipsisVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setTimeout(onEdit, 0)}>
            <Pencil className="h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={() => setTimeout(onDelete, 0)}>
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function EditTaskDialog({ task, onClose, onSave, saving }: { task: DailyTask; onClose: () => void; onSave: (v: { title: string; daysOfWeek: number[]; reminderTime: string | null }) => void; saving: boolean }) {
  const [title, setTitle] = useState(task.title);
  const [days, setDays] = useState(task.daysOfWeek);
  const [time, setTime] = useState(task.reminderTime ?? "");
  const valid = title.trim().length > 0 && days.length > 0;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit daily task</DialogTitle>
          <DialogDescription className="sr-only">Change the name, the days it's due, or its reminder time.</DialogDescription>
        </DialogHeader>
        <TaskFields title={title} onTitle={setTitle} days={days} onDays={setDays} time={time} onTime={setTime} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || saving} onClick={() => onSave({ title: title.trim(), daysOfWeek: days, reminderTime: time || null })}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DailyTasksPage() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const [newTitle, setNewTitle] = useDraftState(DRAFT_TITLE_KEY);
  const [newDays, setNewDays] = useState<number[]>(ALL_DAYS);
  const [newTime, setNewTime] = useState("");
  // Open on reload if a half-typed title was restored, so the draft is visible.
  const [adding, setAdding] = useState(() => newTitle.length > 0);
  const [editing, setEditing] = useState<DailyTask | null>(null);
  const [poppedId, setPoppedId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["daily-tasks"],
    queryFn: () => apiGet<DailyTasksData>("/daily-tasks"),
    // The server decides what "today" is, so poll to roll over at midnight and
    // pick up a task checked off from a phone notification.
    refetchInterval: 60_000,
  });
  const tasks = data?.data?.tasks ?? [];
  const dueToday = tasks.filter((t) => t.dueToday);
  const notToday = tasks.filter((t) => !t.dueToday);
  const doneCount = dueToday.filter((t) => t.doneToday).length;

  const setTasksCache = (fn: (t: DailyTask[]) => DailyTask[]) =>
    queryClient.setQueryData<{ data: DailyTasksData | null }>(["daily-tasks"], (old) =>
      old?.data ? { ...old, data: { ...old.data, tasks: fn(old.data.tasks) } } : old,
    );

  const create = useMutation({
    mutationFn: () => apiPost("/daily-tasks", { title: newTitle.trim(), daysOfWeek: newDays, reminderTime: newTime || null }),
    onSuccess: () => {
      clearDraft(DRAFT_TITLE_KEY);
      setNewTitle("");
      setNewDays(ALL_DAYS);
      setNewTime("");
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: ["daily-tasks"] });
    },
  });

  const toggle = useMutation({
    // sound: null — celebrate() below plays this mutation's actual sound
    // (unchecking has no celebration, so it keeps the quiet "move" cue).
    mutationFn: ({ id, done }: { id: string; done: boolean; origin: { x: number; y: number } }) =>
      apiPost(`/daily-tasks/${id}/${done ? "complete" : "uncomplete"}`, undefined, { sound: done ? null : "move" }),
    onMutate: ({ id, done, origin }) => {
      if (done) {
        // Checking off the last open task for today is a bigger moment.
        const lastOpen = dueToday.filter((t) => !t.doneToday).length === 1;
        celebrate(lastOpen ? "checklist" : "item", origin);
        setPoppedId(id);
        setTimeout(() => setPoppedId(null), 500);
      }
      setTasksCache((all) => all.map((t) => (t.id === id ? { ...t, doneToday: done } : t)));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["daily-tasks"] }),
  });

  const save = useMutation({
    mutationFn: ({ id, ...body }: { id: string; title: string; daysOfWeek: number[]; reminderTime: string | null }) => apiPatch(`/daily-tasks/${id}`, body),
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["daily-tasks"] });
    },
  });

  const remove = useMutation({
    mutationFn: (task: DailyTask) => deleteWithUndo(`/daily-tasks/${task.id}`, "daily_task", task.id, "Daily task"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["daily-tasks"] }),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => apiPatch("/daily-tasks/reorder", { ids }),
    onMutate: (ids) => setTasksCache((all) => ids.map((id) => all.find((t) => t.id === id)!).filter(Boolean)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["daily-tasks"] }),
  });

  // The two groups are shown separately but share ONE ordering. Dragging within
  // a group re-slots just that group's tasks into the same positions in the full
  // list, so the other group's order is untouched.
  const reorderWithin = (group: DailyTask[], newGroupOrder: string[]) => {
    const inGroup = new Set(group.map((t) => t.id));
    let i = 0;
    reorder.mutate(tasks.map((t) => (inGroup.has(t.id) ? newGroupOrder[i++] : t.id)));
  };

  const renderRow = (task: DailyTask, dragProps: SortableHandleProps) => (
    <DailyTaskRow
      task={task}
      dragProps={dragProps}
      popped={poppedId === task.id}
      onToggle={(origin) => toggle.mutate({ id: task.id, done: !task.doneToday, origin })}
      onEdit={() => setEditing(task)}
      onDelete={async () => {
        if (await confirm(`Move "${task.title}" to Trash? You can restore it within 30 days.`)) remove.mutate(task);
      }}
    />
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Daily Tasks</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Things you do every day, or most days. Check them off as you go — they start fresh each morning.
        </p>
      </div>

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newTitle.trim() && newDays.length > 0) create.mutate();
          }}
          className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <TaskFields title={newTitle} onTitle={setNewTitle} days={newDays} onDays={setNewDays} time={newTime} onTime={setNewTime} />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                clearDraft(DRAFT_TITLE_KEY);
                setNewTitle("");
                setNewDays(ALL_DAYS);
                setNewTime("");
                setAdding(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!newTitle.trim() || newDays.length === 0 || create.isPending}>
              Add task
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add a daily task
        </Button>
      )}

      {dueToday.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>
                {doneCount} of {dueToday.length} done today
              </span>
              <span>{Math.round((doneCount / dueToday.length) * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-green-500 transition-all duration-300" style={{ width: `${(doneCount / dueToday.length) * 100}%` }} />
            </div>
            {doneCount === dueToday.length && <p className="mt-2 text-sm text-green-700 dark:text-green-400">All done for today. 🎉</p>}
          </div>
          <SortableList items={dueToday} onReorder={(ids) => reorderWithin(dueToday, ids)}>
            {renderRow}
          </SortableList>
        </div>
      )}

      {notToday.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Not due today</h3>
          <SortableList items={notToday} onReorder={(ids) => reorderWithin(notToday, ids)}>
            {renderRow}
          </SortableList>
        </div>
      )}

      {tasks.length === 0 && !adding && (
        <p className="text-sm text-slate-600 dark:text-slate-400">No daily tasks yet — add the first one above.</p>
      )}

      {editing && (
        <EditTaskDialog
          key={editing.id}
          task={editing}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(v) => save.mutate({ id: editing.id, ...v })}
        />
      )}
      {dialog}
    </div>
  );
}
