import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiPatch } from "../../core/api/client";
import { deleteWithUndo } from "../../core/api/undoableDelete";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { formatDateOnly, formatCadenceDays } from "../../shared/lib/dates";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, Input } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface ReminderCascade {
  id: string;
  cadenceDays: number[];
}

interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  location: string | null;
  isShared: boolean;
  isAllDay: boolean;
  recurrenceRule: string | null;
  reminderCascades: ReminderCascade[];
}

function describeRecurrence(rule: string | null): string | null {
  if (!rule) return null;
  if (rule.includes("FREQ=YEARLY")) return "repeats yearly";
  if (rule.includes("FREQ=MONTHLY")) return "repeats monthly";
  if (rule.includes("FREQ=WEEKLY")) return "repeats weekly";
  return "repeats";
}

// datetime-local inputs want local wall-clock time with no timezone suffix.
function toLocalDatetimeInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventCard({ event, onDelete }: { event: CalendarEvent; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [startAt, setStartAt] = useState(toLocalDatetimeInputValue(event.startAt));
  const [location, setLocation] = useState(event.location ?? "");
  const [isShared, setIsShared] = useState(event.isShared);

  const updateEvent = useMutation({
    mutationFn: () =>
      apiPatch(`/calendar/events/${event.id}`, {
        title,
        startAt: new Date(startAt).toISOString(),
        location: location || undefined,
        isShared,
      }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && startAt) updateEvent.mutate();
        }}
        className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-4 shadow-sm grid gap-3"
      >
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="When">
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </Field>
          <Field label="Location (optional)">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
        </div>
        <CheckboxField checked={isShared} onChange={setIsShared}>
          Shared event (game night, etc.)
        </CheckboxField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-start gap-2">
      <button onClick={() => setEditing(true)} className="min-h-11 min-w-0 flex-1 text-left" aria-label={`Edit ${event.title}`}>
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 break-words">
          {event.title} {event.isShared && <span className="text-xs font-normal text-slate-600 dark:text-slate-400">👥 shared</span>}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {event.isAllDay ? formatDateOnly(event.startAt, { month: "long", day: "numeric" }) : new Date(event.startAt).toLocaleString()}
          {event.location ? ` · ${event.location}` : ""}
          {describeRecurrence(event.recurrenceRule) && (
            <span className="ml-1 text-xs text-blue-700 dark:text-blue-300">🔁 {describeRecurrence(event.recurrenceRule)}</span>
          )}
        </p>
        {event.reminderCascades.length > 0 && (
          <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">🔔 Reminds: {formatCadenceDays(event.reminderCascades[0].cadenceDays)}</p>
        )}
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
          <DropdownMenuItem destructive onSelect={() => setTimeout(onDelete, 0)}>
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [location, setLocation] = useState("");
  const [isShared, setIsShared] = useState(false);

  const { data } = useQuery({
    queryKey: ["calendar-events"],
    queryFn: () => apiGet<CalendarEvent[]>("/calendar/events"),
  });

  const createEvent = useMutation({
    mutationFn: () =>
      apiPost("/calendar/events", { title, startAt: new Date(startAt).toISOString(), location: location || undefined, isShared }),
    onSuccess: () => {
      setTitle("");
      setStartAt("");
      setLocation("");
      setIsShared(false);
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });

  const deleteEvent = useMutation({
    mutationFn: (id: string) => deleteWithUndo(`/calendar/events/${id}`, "calendar_event", id, "Event"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
  });

  const events = data?.data ?? [];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Calendar</h2>
      <p className="text-slate-600 dark:text-slate-400 text-sm -mt-3">
        Google/Apple 2-way sync isn't wired up yet — needs OAuth credentials set up separately. Events here are local for now.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && startAt) createEvent.mutate();
        }}
        className="grid gap-3"
      >
        <Field label="Event title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's happening?" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="When">
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </Field>
          <Field label="Location (optional)">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
        </div>
        <CheckboxField checked={isShared} onChange={setIsShared}>
          Shared event (game night, etc.)
        </CheckboxField>
        <div className="flex justify-end">
          <Button type="submit">Add Event</Button>
        </div>
      </form>

      <div className="space-y-3">
        {events.map((ev) => (
          <EventCard
            key={ev.id}
            event={ev}
            onDelete={async () => {
              if (await confirm(`Move "${ev.title}" to Trash? Its reminders go with it — you can restore them together within 30 days.`)) {
                deleteEvent.mutate(ev.id);
              }
            }}
          />
        ))}
        {events.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No events yet.</p>}
      </div>
      {dialog}
    </div>
  );
}
