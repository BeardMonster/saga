import { useState } from "react";
import { X } from "lucide-react";
import { CADENCE_OPTIONS } from "../../shared/lib/dates";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, Input, Select } from "@/components/ui/field";

const UNIT_DAYS = { days: 1, weeks: 7, months: 30 } as const;
type Unit = keyof typeof UNIT_DAYS;

export function describeOffset(offset: number): string {
  if (offset === 0) return "On the day";
  const n = -offset;
  if (n % 30 === 0) return `${n / 30} month${n / 30 === 1 ? "" : "s"} before`;
  if (n % 7 === 0) return `${n / 7} week${n / 7 === 1 ? "" : "s"} before`;
  return `${n} day${n === 1 ? "" : "s"} before`;
}

// "Remind me" chooser: the usual intervals as checkboxes plus your own
// ("10 days before", "6 weeks before"). Offsets are days relative to the date
// (negative = before, 0 = the day itself).
export default function CadencePicker({ offsets, onChange }: { offsets: number[]; onChange: (offsets: number[]) => void }) {
  const [customAmount, setCustomAmount] = useState("");
  const [customUnit, setCustomUnit] = useState<Unit>("days");

  const presetDays = CADENCE_OPTIONS.map((o) => o.days);
  const customOffsets = offsets.filter((d) => !presetDays.includes(d)).sort((a, b) => a - b);
  const toggle = (days: number) => onChange(offsets.includes(days) ? offsets.filter((d) => d !== days) : [...offsets, days]);

  const addCustom = () => {
    const n = Math.floor(Number(customAmount));
    if (!(n > 0)) return;
    const offset = -(n * UNIT_DAYS[customUnit]);
    if (!offsets.includes(offset)) onChange([...offsets, offset]);
    setCustomAmount("");
  };

  return (
    <div className="grid gap-3">
      <fieldset className="grid gap-0">
        <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">Remind me</legend>
        {CADENCE_OPTIONS.map((opt) => (
          <CheckboxField key={opt.days} checked={offsets.includes(opt.days)} onChange={() => toggle(opt.days)}>
            {opt.label}
          </CheckboxField>
        ))}
        {customOffsets.map((d) => (
          <div key={d} className="flex min-h-11 items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked readOnly className="h-5 w-5 shrink-0 rounded accent-indigo-700" />
            {describeOffset(d)}
            <Button type="button" variant="ghost" size="icon" className="ml-auto md:h-9 md:w-9" aria-label={`Remove ${describeOffset(d)}`} onClick={() => toggle(d)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </fieldset>

      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <Field label="Add your own">
          <Input type="number" min={1} inputMode="numeric" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder="e.g. 10" />
        </Field>
        <Field label="Unit">
          <Select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as Unit)}>
            <option value="days">Days before</option>
            <option value="weeks">Weeks before</option>
            <option value="months">Months before</option>
          </Select>
        </Field>
        <Button type="button" variant="secondary" onClick={addCustom} disabled={!(Number(customAmount) > 0)}>
          Add
        </Button>
      </div>
    </div>
  );
}
