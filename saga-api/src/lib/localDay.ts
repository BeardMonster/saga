// "What day / time is it for Brandon" — the API container's TZ env is the
// single source of truth (see the grocery/stats day-boundary fix), so a
// "day" here always means the same calendar day he's actually living in.
export const APP_TZ = process.env.TZ || "America/New_York";

// YYYY-MM-DD of an instant as seen in the app timezone.
export function localDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// 0 = Sunday … 6 = Saturday for a YYYY-MM-DD key. Noon UTC so no timezone
// can push it onto a neighboring day.
export function weekdayOfKey(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

// A YYYY-MM-DD key as the pure-date value Prisma stores for @db.Date columns.
export function dayDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

// Minutes since local midnight, in the app timezone.
export function localMinutesOfDay(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, hourCycle: "h23", hour: "numeric", minute: "numeric" }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export function isValidHHMM(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
