import { Field, Input, Select } from "@/components/ui/field";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Placeholder year stored when the real one isn't known. 2000 is a leap
// year, so Feb 29 birthdays work; it's never shown anywhere.
const UNKNOWN_YEAR = 2000;

export interface BirthdayValue {
  month: string; // "1".."12", or ""
  day: string; // "1".."31", or ""
  year: string; // optional; "" when unknown
}

export const emptyBirthday: BirthdayValue = { month: "", day: "", year: "" };

export function birthdayFromPerson(birthday: string | null, yearKnown: boolean): BirthdayValue {
  if (!birthday) return emptyBirthday;
  const d = new Date(birthday);
  return {
    month: String(d.getUTCMonth() + 1),
    day: String(d.getUTCDate()),
    year: yearKnown ? String(d.getUTCFullYear()) : "",
  };
}

// Days offered for a month. February always allows the 29th — these are
// birthdays as people report them, so no leap-year checking.
export function daysInMonth(month: number): number {
  if (month === 2) return 29;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// null until both a month and a day are picked.
export function birthdayToPayload(v: BirthdayValue): { birthday: string; birthdayYearKnown: boolean } | null {
  const month = Number(v.month);
  const day = Number(v.day);
  if (!month || !day) return null;
  let year = v.year.trim() !== "" ? Number(v.year) : UNKNOWN_YEAR;
  let yearKnown = v.year.trim() !== "";
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    year = UNKNOWN_YEAR;
    yearKnown = false;
  }
  // Feb 29 in a non-leap year can't be stored as a real date; keep the day
  // and drop the year rather than block or shift it.
  if (month === 2 && day === 29 && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) {
    year = UNKNOWN_YEAR;
    yearKnown = false;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return { birthday: `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`, birthdayYearKnown: yearKnown };
}

// Month + day are required together; the year is optional, since you don't
// always know how old someone is.
export function BirthdayFields({ value, onChange }: { value: BirthdayValue; onChange: (v: BirthdayValue) => void }) {
  const maxDay = value.month ? daysInMonth(Number(value.month)) : 31;
  return (
    <div className="grid gap-1.5">
      <div className="grid grid-cols-[3fr_2fr_2fr] gap-2">
        <Field label="Month">
          <Select value={value.month} onChange={(e) => {
              // Changing the month can leave a day that doesn't exist in it (Apr 31) — trim it back.
              const month = e.target.value;
              const day = month && Number(value.day) > daysInMonth(Number(month)) ? String(daysInMonth(Number(month))) : value.day;
              onChange({ ...value, month, day });
            }}>
            <option value="">—</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Day">
          <Select value={value.day} onChange={(e) => onChange({ ...value, day: e.target.value })}>
            <option value="">—</option>
            {Array.from({ length: maxDay }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {i + 1}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Year">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={9999}
            placeholder="Optional"
            value={value.year}
            onChange={(e) => onChange({ ...value, year: e.target.value })}
          />
        </Field>
      </div>
      {(value.month !== "") !== (value.day !== "") ? (
        <p className="text-xs text-red-600 dark:text-red-400">Pick both a month and a day.</p>
      ) : (
        <p className="text-xs text-slate-600 dark:text-slate-400">The year is optional.</p>
      )}
    </div>
  );
}
