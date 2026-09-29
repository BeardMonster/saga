import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "../../core/api/client";

interface TypeInstruction {
  targetType: string;
  label: string;
  defaultHint: string;
  notes: string;
}

function InstructionCard({ item }: { item: TypeInstruction }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(item.notes);

  useEffect(() => setNotes(item.notes), [item.notes]);

  const save = useMutation({
    mutationFn: () => apiPatch(`/settings/target-type-instructions/${item.targetType}`, { notes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["target-type-instructions"] }),
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
      <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{item.label}</p>
      <p className="text-xs text-slate-500 dark:text-slate-500 font-mono break-words">{item.defaultHint}</p>
      <Field label="Extra guidance for the AI (optional)" hint="Added alongside the fixed field spec above — never replaces it.">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={`e.g. "always match 'call the bank' here, not a generic checklist"`}
          minRows={2}
        />
      </Field>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || notes === item.notes}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// Reachable from both Settings and Brain Dump — same page, same data either
// way. One card per data type Brain Dump's single-line sorter can choose
// between; each type's actual field shape is fixed (the create logic
// depends on exact field names), but the guidance layered on top of it is
// fully editable, so a routing mistake can be corrected here directly
// instead of needing a code change.
export default function TargetTypeInstructionsPage() {
  const { data } = useQuery({
    queryKey: ["target-type-instructions"],
    queryFn: () => apiGet<TypeInstruction[]>("/settings/target-type-instructions"),
  });
  const items = data?.data ?? [];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Brain Dump: sorting instructions</h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          How the local model decides where a pasted note goes. Each type below has a fixed set of fields it must produce (shown in
          monospace) — that part can't change, since the rest of the app depends on those exact names. Anything you add underneath is
          extra guidance layered on top, used the next time something gets sorted.
        </p>
        <Link to="/brain-dump" className="text-sm text-primary hover:underline">
          ← Back to Brain Dump
        </Link>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <InstructionCard key={item.targetType} item={item} />
        ))}
        {items.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">Loading…</p>}
      </div>
    </div>
  );
}
