import { useState } from "react";
import { formatCadenceDays, formatDateOnly } from "../../shared/lib/dates";
import { Button } from "@/components/ui/button";
import BirthdayReminderDialog from "./BirthdayReminderDialog";
import type { Person, ReminderCascade } from "./types";

// The birthday line, its reminder schedule, and the button that opens the
// editor (birthday + custom reminder times).
export default function BirthdayReminders({ person, cascade }: { person: Person; cascade: ReminderCascade | undefined }) {
  const [editing, setEditing] = useState(false);

  return (
    <div>
      {person.birthday ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
          <span>
            🎂 Birthday: <span className="font-medium text-slate-700 dark:text-slate-200">{formatDateOnly(person.birthday)}</span>
          </span>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {cascade ? "Edit Birthday & Reminders" : "Set Reminders"}
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Add Birthday & Reminders
        </Button>
      )}

      {person.birthday && cascade && (
        <>
          <p className="text-xs text-green-700 dark:text-green-400 mt-1">
            🔁 Reminds: {formatCadenceDays(cascade.cadenceDays)} — every year on {formatDateOnly(cascade.anchorDate, { month: "short", day: "numeric" })}
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {cascade.instances.map((instance) => (
              <li
                key={instance.id}
                className={`text-xs rounded-full px-2 py-0.5 ${
                  instance.sentAt ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-500" : "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                }`}
              >
                {formatDateOnly(instance.fireAt, { month: "short", day: "numeric" })}
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && <BirthdayReminderDialog person={person} cascade={cascade} onClose={() => setEditing(false)} />}
    </div>
  );
}
