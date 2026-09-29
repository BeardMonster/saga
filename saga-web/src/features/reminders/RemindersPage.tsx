import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiPatch } from "../../core/api/client";
import { deleteWithUndo } from "../../core/api/undoableDelete";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { DEFAULT_CADENCE_DAYS, formatCadenceDays, formatDateOnly } from "../../shared/lib/dates";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, Input } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import CadencePicker from "./CadencePicker";

interface ReminderInstance {
  id: string;
  fireAt: string;
  sentAt: string | null;
}

interface ReminderCascade {
  id: string;
  title: string;
  anchorDate: string;
  cadenceDays: number[];
  isRecurringAnnually: boolean;
  instances: ReminderInstance[];
}

// anchorDate is date-only (UTC midnight) — extract with UTC getters so the
// date shown in the edit form matches what's actually stored, same
// reasoning as formatDateOnly in shared/lib/dates.ts.
function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function CascadeCard({ cascade, onArchive, onDelete }: { cascade: ReminderCascade; onArchive: () => void; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(cascade.title);
  const [anchorDate, setAnchorDate] = useState(toDateInputValue(cascade.anchorDate));
  const [cadenceDays, setCadenceDays] = useState(cascade.cadenceDays);
  const [repeatAnnually, setRepeatAnnually] = useState(cascade.isRecurringAnnually);

  const updateCascade = useMutation({
    mutationFn: () =>
      apiPatch(`/reminders/${cascade.id}`, {
        title,
        anchorDate: new Date(anchorDate).toISOString(),
        cadenceDays,
        isRecurringAnnually: repeatAnnually,
      }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
  });

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && anchorDate && cadenceDays.length > 0) updateCascade.mutate();
        }}
        className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-4 shadow-sm grid gap-3"
      >
        <Field label="What's it for?">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Date">
          <Input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
        </Field>
        <CadencePicker offsets={cadenceDays} onChange={setCadenceDays} />
        <CheckboxField checked={repeatAnnually} onChange={setRepeatAnnually}>
          Repeat every year
        </CheckboxField>
        {cadenceDays.length === 0 && <p className="text-xs text-red-600 dark:text-red-400">Pick at least one reminder time.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={cadenceDays.length === 0}>
            Save
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <button onClick={() => setEditing(true)} className="min-h-11 min-w-0 flex-1 text-left" aria-label={`Edit ${cascade.title}`}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 break-words">
            {cascade.title} {cascade.isRecurringAnnually && <span className="text-xs font-normal text-slate-600 dark:text-slate-400">🔁 yearly</span>}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Date: {formatDateOnly(cascade.anchorDate)}</p>
          <p className="text-xs text-green-700 dark:text-green-400">Reminds: {formatCadenceDays(cascade.cadenceDays)}</p>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="More actions">
              <EllipsisVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTimeout(onArchive, 0)}>
              <Archive className="h-4 w-4" /> Archive
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => setTimeout(onDelete, 0)}>
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {cascade.instances.map((instance) => (
          <li
            key={instance.id}
            className={`text-xs rounded-full px-2 py-1 ${instance.sentAt ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" : "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"}`}
          >
            {formatDateOnly(instance.fireAt, { month: "short", day: "numeric" })} {instance.sentAt ? "· sent" : "· pending"}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Archived cascades are a one-time tuck-away, not something edited in place
// — restore it first if it needs changes. Kept intentionally simpler than
// CascadeCard (no edit form, no instance chips) since there's nothing
// actionable here beyond bringing it back.
function ArchivedCascadeRow({ cascade, onRestore }: { cascade: ReminderCascade; onRestore: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h4 className="font-medium text-slate-700 dark:text-slate-300 break-words">{cascade.title}</h4>
        <p className="text-sm text-slate-500 dark:text-slate-500">Date: {formatDateOnly(cascade.anchorDate)}</p>
      </div>
      <Button variant="outline" size="sm" className="shrink-0" onClick={onRestore}>
        <ArchiveRestore className="h-4 w-4" /> Restore
      </Button>
    </div>
  );
}

export default function RemindersPage() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [title, setTitle] = useState("");
  const [anchorDate, setAnchorDate] = useState("");
  const [cadenceDays, setCadenceDays] = useState<number[]>(DEFAULT_CADENCE_DAYS);
  const [repeatAnnually, setRepeatAnnually] = useState(false);

  const { data } = useQuery({
    queryKey: ["reminders"],
    queryFn: () => apiGet<ReminderCascade[]>("/reminders"),
  });
  const archivedQuery = useQuery({
    queryKey: ["reminders", "archived"],
    queryFn: () => apiGet<ReminderCascade[]>("/reminders/archived"),
  });

  const createCascade = useMutation({
    mutationFn: () =>
      apiPost("/reminders", {
        title,
        anchorDate: new Date(anchorDate).toISOString(),
        cadenceDays,
        isRecurringAnnually: repeatAnnually,
      }),
    onSuccess: () => {
      setTitle("");
      setAnchorDate("");
      setCadenceDays(DEFAULT_CADENCE_DAYS);
      setRepeatAnnually(false);
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
  });

  const deleteCascade = useMutation({
    mutationFn: (id: string) => deleteWithUndo(`/reminders/${id}`, "reminder_cascade", id, "Reminder"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders"] }),
  });

  const archiveCascade = useMutation({
    mutationFn: (id: string) => apiPost(`/reminders/${id}/archive`, undefined, { sound: "move" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders"] }),
  });

  const unarchiveCascade = useMutation({
    mutationFn: (id: string) => apiPost(`/reminders/${id}/unarchive`, undefined, { sound: "restore" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders"] }),
  });

  const cascades = data?.data ?? [];
  const archivedCascades = archivedQuery.data?.data ?? [];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Reminders</h2>
      <p className="text-slate-600 dark:text-slate-400 text-sm -mt-3">
        Set the date once — Saga generates the whole reminder chain and pushes each one to your phone via ntfy when it's due.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && anchorDate && cadenceDays.length > 0) createCascade.mutate();
        }}
        className="grid gap-3"
      >
        <Field label="What's it for?">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mom's birthday" />
        </Field>
        <Field label="Date">
          <Input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
        </Field>
        <CadencePicker offsets={cadenceDays} onChange={setCadenceDays} />
        <CheckboxField checked={repeatAnnually} onChange={setRepeatAnnually}>
          Repeat every year (anniversaries, renewals, etc.)
        </CheckboxField>
        {cadenceDays.length === 0 && <p className="text-xs text-red-600 dark:text-red-400">Pick at least one reminder time.</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={cadenceDays.length === 0}>
            Create Reminder
          </Button>
        </div>
      </form>

      <div className="space-y-3">
        {cascades.map((c) => (
          <CascadeCard
            key={c.id}
            cascade={c}
            onArchive={() => archiveCascade.mutate(c.id)}
            onDelete={async () => {
              if (await confirm(`Move "${c.title}" to Trash? You can restore it within 30 days.`)) deleteCascade.mutate(c.id);
            }}
          />
        ))}
        {cascades.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No reminders set yet.</p>}
      </div>

      {archivedCascades.length > 0 && (
        <div className="pt-2 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Archived ({archivedCascades.length})
          </h3>
          {archivedCascades.map((c) => (
            <ArchivedCascadeRow key={c.id} cascade={c} onRestore={() => unarchiveCascade.mutate(c.id)} />
          ))}
        </div>
      )}
      {dialog}
    </div>
  );
}
