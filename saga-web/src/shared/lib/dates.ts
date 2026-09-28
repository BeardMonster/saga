// Birthdays, reminder anchors, and all-day event dates are all "pure" dates
// with no time-of-day — they're stored as UTC midnight (see schema.prisma's
// @db.Date fields). Reading them back with LOCAL getters/formatters
// (.getMonth(), .toLocaleDateString() without a timeZone) re-interprets that
// UTC midnight in the viewer's own timezone, which silently rolls the date
// back a day for anyone west of UTC. Every function here stays in UTC end to
// end so the displayed date always matches the date that was actually typed in.

// Given a birthday (or any recurring annual date), returns the next
// upcoming occurrence — this year if it hasn't happened yet, next year if
// it has. A reminder cascade should always be anchored to this, never to
// the literal original date, or it'll generate instances decades in the past.
export function nextAnnualOccurrence(originalDate: string | Date): Date {
  const original = new Date(originalDate);
  const now = new Date();
  const month = original.getUTCMonth();
  const date = original.getUTCDate();

  const thisYear = new Date(Date.UTC(now.getUTCFullYear(), month, date));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (thisYear.getTime() >= today.getTime()) {
    return thisYear;
  }
  return new Date(Date.UTC(now.getUTCFullYear() + 1, month, date));
}

// Formats a date-only value (birthday, reminder anchor/instance, all-day
// event) using UTC so the calendar date shown always matches the date
// stored, regardless of the viewer's local timezone.
export function formatDateOnly(value: string | Date, options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" }): string {
  return new Date(value).toLocaleDateString(undefined, { ...options, timeZone: "UTC" });
}

// The offsets Google Calendar's own "add a notification" picker offers for
// birthdays/annual events, in the order it lists them.
export const CADENCE_OPTIONS: { label: string; days: number }[] = [
  { label: "1 month before", days: -30 },
  { label: "3 weeks before", days: -21 },
  { label: "2 weeks before", days: -14 },
  { label: "1 week before", days: -7 },
  { label: "3 days before", days: -3 },
  { label: "1 day before", days: -1 },
  { label: "On the day", days: 0 },
];

// Matches Brandon's actual Google Calendar habit: month out, 3 weeks, 2
// weeks, a week, a few days, day-of.
export const DEFAULT_CADENCE_DAYS = [-30, -21, -14, -7, -3, 0];

// Renders a cadence like [-30,-21,-14,-7,-3,0] as "1 month, 3 weeks, 2
// weeks, 1 week, 3 days before + day-of" — the same plain-English style
// Google Calendar uses to describe an event's reminders.
export function formatCadenceDays(cadenceDays: number[]): string {
  const sorted = [...cadenceDays].sort((a, b) => a - b);
  const dayOf = sorted.includes(0);
  const before = sorted
    .filter((d) => d < 0)
    .map((d) => CADENCE_OPTIONS.find((o) => o.days === d)?.label.replace(" before", "") ?? `${-d} days`);

  if (before.length === 0) return dayOf ? "On the day" : "";
  const beforeText = `${before.join(", ")} before`;
  return dayOf ? `${beforeText} + day-of` : beforeText;
}
