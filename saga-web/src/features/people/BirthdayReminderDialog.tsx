import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPatch, apiPost } from "../../core/api/client";
import { DEFAULT_CADENCE_DAYS, nextAnnualOccurrence } from "../../shared/lib/dates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CadencePicker from "../reminders/CadencePicker";
import { BirthdayFields, birthdayFromPerson, birthdayToPayload } from "./BirthdayFields";

interface CascadeInfo {
  id: string;
  cadenceDays: number[];
  calendarEventId?: string | null;
}

// Edit a person's birthday and exactly when they get reminded — any mix of
// the usual intervals plus custom ones ("10 days before"). Mounted only
// while open, so it always starts from the current saved values.
export default function BirthdayReminderDialog({
  person,
  cascade,
  onClose,
}: {
  person: { id: string; name: string; birthday: string | null; birthdayYearKnown: boolean };
  cascade: CascadeInfo | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [birthday, setBirthday] = useState(birthdayFromPerson(person.birthday, person.birthdayYearKnown));
  const birthdayPayload = birthdayToPayload(birthday);
  const [offsets, setOffsets] = useState<number[]>(cascade?.cadenceDays ?? DEFAULT_CADENCE_DAYS);

  const save = useMutation({
    mutationFn: async () => {
      if (!birthdayPayload) throw new Error("Pick a month and day");
      await apiPatch(`/people/${person.id}`, birthdayPayload);
      const anchor = nextAnnualOccurrence(birthdayPayload.birthday);
      const cadenceDays = [...offsets].sort((a, b) => a - b);

      if (cascade) {
        await apiPatch(`/reminders/${cascade.id}`, { anchorDate: anchor.toISOString(), cadenceDays });
        // Keep the Calendar entry on the same day as the birthday.
        if (cascade.calendarEventId) await apiPatch(`/calendar/events/${cascade.calendarEventId}`, { startAt: anchor.toISOString() });
        return;
      }

      // First-time setup: puts the birthday on the Calendar (yearly repeat,
      // all-day) and creates the reminder schedule linked to it.
      const event = await apiPost<{ id: string }>("/calendar/events", {
        title: `${person.name}'s birthday`,
        startAt: anchor.toISOString(),
        recurrenceRule: "FREQ=YEARLY",
        isAllDay: true,
      });
      await apiPost("/reminders", {
        title: `${person.name}'s birthday`,
        anchorDate: anchor.toISOString(),
        cadenceDays,
        personId: person.id,
        calendarEventId: event.data!.id,
        isRecurringAnnually: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      onClose();
    },
  });

  const canSave = birthdayPayload !== null && offsets.length > 0 && !save.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{person.name}'s birthday</DialogTitle>
          <DialogDescription>Pick the date and when you want to be reminded before it.</DialogDescription>
        </DialogHeader>

        <BirthdayFields value={birthday} onChange={setBirthday} />
        <CadencePicker offsets={offsets} onChange={setOffsets} />

        {offsets.length === 0 && <p className="text-xs text-red-600 dark:text-red-400">Pick at least one reminder time.</p>}
        {save.isError && <p className="text-xs text-red-600 dark:text-red-400">Couldn't save — try again.</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave}>
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
