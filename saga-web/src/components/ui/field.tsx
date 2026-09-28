import * as React from "react";
import AutoGrowTextarea from "@/shared/components/AutoGrowTextarea";
import { cn } from "@/lib/utils";

// A form control with a label that stays visible above it (a placeholder
// disappears as soon as you type, so it can't be the only label). The
// label wraps the control, so tapping the label focuses it and screen
// readers announce them together.
export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("grid gap-1.5 min-w-0", className)}>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-600 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

// Material-style field heights: 48px on phones, 40px on desktop.
const controlClass =
  "w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm text-foreground placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(controlClass, "h-12 md:h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(controlClass, "h-12 md:h-10", className)} {...props} />
));
Select.displayName = "Select";

export function Textarea({ className, ...props }: React.ComponentProps<typeof AutoGrowTextarea>) {
  return <AutoGrowTextarea className={cn(controlClass, "py-3 md:py-2", className)} {...props} />;
}

// A checkbox with its label, sized as a comfortable tap row (44px+).
export function CheckboxField({
  checked,
  onChange,
  children,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-700 dark:text-slate-200", className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 shrink-0 rounded accent-indigo-700" />
      {children}
    </label>
  );
}
