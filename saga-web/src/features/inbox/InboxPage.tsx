import AutoGrowTextarea from "../../shared/components/AutoGrowTextarea";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiUpload, apiDelete } from "../../core/api/client";
import { useConfirm } from "../../shared/hooks/useConfirm";

type InboxEntryKind = "text" | "image" | "audio" | "video";
type InboxEntryStatus = "processing" | "pending" | "confirmed" | "failed";

interface Proposal {
  targetType: string;
  fields: Record<string, unknown>;
}

interface ProgressStep {
  message: string;
  at: string;
}

interface InboxEntry {
  id: string;
  kind: InboxEntryKind;
  rawText: string | null;
  mediaPaths: string[];
  transcript: string | null;
  status: InboxEntryStatus;
  progressSteps: ProgressStep[];
  proposal: Proposal | null;
}

interface Checklist {
  id: string;
  name: string;
}
interface Person {
  id: string;
  name: string;
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  checklist_item: "Checklist item",
  goal: "Goal",
  calendar_event: "Calendar event",
  reminder: "Reminder",
  gift_idea: "Gift idea",
  project: "Project",
  recipe: "Recipe",
  shopping_list_item: "Weekly grocery scan list",
  checklist_with_items: "New checklist",
  person_note: "Note on a person's page",
  grocery_receipt: "Grocery receipt",
  project_with_items: "New project",
};

function mediaUrl(path: string): string {
  const filename = path.split(/[/\\]/).pop() ?? path;
  return `/api/inbox/media/${filename}`;
}

// The AI's guessed name (e.g. "Shopping") often doesn't exactly match a real
// checklist/person name (e.g. "Weekly Groceries") — auto-select only when
// there's a genuine match, so we're never silently picking the wrong one.
function findMatch<T extends { id: string; name: string }>(guess: string | undefined, options: T[]): string {
  if (!guess) return "";
  const g = guess.trim().toLowerCase();
  if (!g) return "";
  const exact = options.find((o) => o.name.trim().toLowerCase() === g);
  if (exact) return exact.id;
  const partial = options.find((o) => {
    const name = o.name.trim().toLowerCase();
    return name.includes(g) || g.includes(name);
  });
  return partial?.id ?? "";
}

// Renders any field value editable — arrays as newline-joined textareas,
// everything else as a single-line input. Good enough for v1 across every
// target type without a bespoke form per destination.
function FieldEditor({ fieldKey, value, onChange }: { fieldKey: string; value: unknown; onChange: (v: unknown) => void }) {
  if (Array.isArray(value)) {
    return <Textarea value={value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} minRows={Math.max(2, value.length)} />;
  }
  if (typeof value === "string" && (value.length > 60 || fieldKey === "instructions")) {
    return <Textarea value={value} onChange={(e) => onChange(e.target.value)} minRows={4} />;
  }
  return <Input value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value)} />;
}

// A file input hidden behind a normal button (native file inputs are tiny).
function FilePickerButton({ label, accept, multiple, onFiles }: { label: string; accept: string; multiple?: boolean; onFiles: (files: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <Button type="button" variant="outline" onClick={() => ref.current?.click()}>
        {label}
      </Button>
    </>
  );
}

interface ReceiptItemField {
  rawText: string;
  price: number;
  matchedName: string | null;
}

// A receipt line item's "what is this" picker: a dropdown of everything
// already known (this week's list + the full historical catalog) — the
// same merged pool the server used to pre-fill a guess — with an escape
// hatch to type something it's never seen before. Whatever gets confirmed
// here, the API remembers for this store (see grocery/receipts.ts), so a
// generic item like "Strawberries" only ever needs picking once, and a
// cryptic per-store code needs picking once too.
function ReceiptItemRow({
  item,
  suggestions,
  onChange,
}: {
  item: ReceiptItemField;
  suggestions: string[];
  onChange: (next: ReceiptItemField) => void;
}) {
  const knownOrEmpty = !item.matchedName || suggestions.includes(item.matchedName);
  const [typingNew, setTypingNew] = useState(!knownOrEmpty);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 space-y-1.5">
      <p className="text-xs italic text-slate-500 dark:text-slate-500 truncate" title={item.rawText}>
        "{item.rawText}"
      </p>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          {typingNew ? (
            <Input
              autoFocus
              value={item.matchedName ?? ""}
              onChange={(e) => onChange({ ...item, matchedName: e.target.value })}
              placeholder="Type what this is"
            />
          ) : (
            <Select
              value={item.matchedName ?? ""}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setTypingNew(true);
                  onChange({ ...item, matchedName: "" });
                } else {
                  onChange({ ...item, matchedName: e.target.value });
                }
              }}
            >
              <option value="" disabled>
                What is this?
              </option>
              {suggestions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="__new__">+ Something else…</option>
            </Select>
          )}
        </div>
        <Input
          type="number"
          step="0.01"
          value={item.price}
          onChange={(e) => onChange({ ...item, price: Number(e.target.value) })}
          className="w-20 shrink-0"
          aria-label="Price"
        />
      </div>
    </div>
  );
}

function EntryCard({ entry, onChanged }: { entry: InboxEntry; onChanged: () => void }) {
  const [fields, setFields] = useState<Record<string, unknown>>(entry.proposal?.fields ?? {});
  const [checklistId, setChecklistId] = useState("");
  const [personId, setPersonId] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  const targetType = entry.proposal?.targetType;

  useEffect(() => {
    setFields(entry.proposal?.fields ?? {});
  }, [entry.proposal]);

  const checklistsQuery = useQuery({
    queryKey: ["checklists"],
    queryFn: () => apiGet<Checklist[]>("/checklists"),
    enabled: targetType === "checklist_item",
  });
  const peopleQuery = useQuery({
    queryKey: ["people"],
    queryFn: () => apiGet<Person[]>("/people"),
    enabled: targetType === "gift_idea" || targetType === "person_note",
  });
  const storesQuery = useQuery({
    queryKey: ["grocery-stores"],
    queryFn: () => apiGet<{ id: string; name: string }[]>("/grocery/stores"),
    enabled: targetType === "grocery_receipt",
  });
  const suggestionsQuery = useQuery({
    queryKey: ["grocery-item-suggestions"],
    queryFn: () => apiGet<string[]>("/grocery/item-suggestions"),
    enabled: targetType === "grocery_receipt",
  });

  useEffect(() => {
    const options = checklistsQuery.data?.data;
    if (targetType === "checklist_item" && options && !checklistId) {
      const match = findMatch(fields.checklistName as string | undefined, options);
      if (match) setChecklistId(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistsQuery.data, targetType, fields.checklistName]);

  useEffect(() => {
    const options = peopleQuery.data?.data;
    if ((targetType === "gift_idea" || targetType === "person_note") && options && !personId) {
      const match = findMatch(fields.personName as string | undefined, options);
      if (match) setPersonId(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleQuery.data, targetType, fields.personName]);

  const confirm = useMutation({
    mutationFn: () => {
      // Array fields keep blank lines while editing (so pressing Enter to
      // start a new one doesn't get wiped mid-typing) — strip them here,
      // right before they're actually saved.
      const finalFields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        finalFields[k] = Array.isArray(v) ? v.filter((item) => typeof item !== "string" || item.trim() !== "") : v;
      }
      if (targetType === "checklist_item") finalFields.checklistId = checklistId;
      if (targetType === "gift_idea" || targetType === "person_note") finalFields.personId = personId;
      return apiPost(`/inbox/${entry.id}/confirm`, { fields: finalFields });
    },
    onSuccess: onChanged,
  });

  const reevaluate = useMutation({
    mutationFn: () => apiPost(`/inbox/${entry.id}/reevaluate`, { feedback }),
    onSuccess: () => {
      setFeedback("");
      setShowFeedback(false);
      onChanged();
    },
  });

  const discard = useMutation({
    mutationFn: () => apiDelete(`/inbox/${entry.id}`),
    onSuccess: onChanged,
  });

  const checklists = checklistsQuery.data?.data ?? [];
  const people = peopleQuery.data?.data ?? [];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
      {entry.kind === "text" && <p className="text-sm text-slate-600 dark:text-slate-400 italic">"{entry.rawText}"</p>}
      {entry.kind === "image" && (
        <div className="flex gap-2 flex-wrap">
          {entry.mediaPaths.map((p) => (
            <img key={p} src={mediaUrl(p)} alt="" className="h-24 rounded border border-slate-200 dark:border-slate-700" />
          ))}
        </div>
      )}
      {(entry.kind === "audio" || entry.kind === "video") && (
        <div className="space-y-1">
          {entry.kind === "video" ? (
            <video src={mediaUrl(entry.mediaPaths[0])} controls className="max-h-40 rounded" />
          ) : (
            <audio src={mediaUrl(entry.mediaPaths[0])} controls />
          )}
          {entry.transcript && <p className="text-xs text-slate-600 dark:text-slate-400 italic">"{entry.transcript}"</p>}
        </div>
      )}

      {entry.status === "processing" && entry.progressSteps.length > 0 && (
        <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
          {entry.progressSteps.map((step, i) => (
            <li key={i} className={i === entry.progressSteps.length - 1 ? "text-slate-600 dark:text-slate-300 font-medium" : ""}>
              {i === entry.progressSteps.length - 1 ? "→ " : "✓ "}
              {step.message}
            </li>
          ))}
        </ul>
      )}
      {entry.status === "processing" && entry.progressSteps.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">thinking…</p>
      )}
      {entry.status === "failed" && (
        <div className="space-y-2">
          <p className="text-sm text-red-600 dark:text-red-400">
            {entry.progressSteps[entry.progressSteps.length - 1]?.message ?? "Something went wrong."}
          </p>
          <Button variant="secondary" onClick={() => discard.mutate()}>
            Discard
          </Button>
        </div>
      )}

      {entry.proposal && (
        <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-300 uppercase tracking-wide">
            →{" "}
            {targetType === "checklist_with_items" &&
            (fields.kind === "note" || (typeof fields.body === "string" && fields.body.trim() && !(fields.items as string[] | undefined)?.length))
              ? "New note"
              : (TARGET_TYPE_LABELS[targetType!] ?? targetType)}
          </p>

          {targetType === "checklist_item" && (
            <Field label="Which checklist?">
              <Select value={checklistId} onChange={(e) => setChecklistId(e.target.value)}>
                <option value="" disabled>
                  {`Choose a checklist — AI guessed "${String(fields.checklistName ?? "?")}", no exact match`}
                </option>
                {checklists.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {(targetType === "gift_idea" || targetType === "person_note") && (
            <Field label={targetType === "person_note" ? "Whose page?" : "Who is it for?"}>
              <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="" disabled>
                  {`Choose who — AI guessed "${String(fields.personName ?? "?")}", no exact match`}
                </option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {targetType === "grocery_receipt" && (
            <div className="space-y-3">
              <Field label="Which store?">
                <Select value={(fields.storeId as string) ?? ""} onChange={(e) => setFields((f) => ({ ...f, storeId: e.target.value }))}>
                  <option value="">
                    {fields.storeNameRaw ? `Receipt said "${fields.storeNameRaw}" — pick one, or leave blank` : "Pick a store (optional)"}
                  </option>
                  {(storesQuery.data?.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Date">
                  <Input
                    type="date"
                    value={typeof fields.purchasedAt === "string" ? fields.purchasedAt.slice(0, 10) : ""}
                    onChange={(e) => setFields((f) => ({ ...f, purchasedAt: e.target.value }))}
                  />
                </Field>
                <Field label="Total">
                  <Input
                    type="number"
                    step="0.01"
                    value={fields.totalAmount == null ? "" : String(fields.totalAmount)}
                    onChange={(e) => setFields((f) => ({ ...f, totalAmount: e.target.value === "" ? null : Number(e.target.value) }))}
                  />
                </Field>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Items ({((fields.items as ReceiptItemField[] | undefined) ?? []).length})
                </p>
                {((fields.items as ReceiptItemField[] | undefined) ?? []).map((item, i) => (
                  <ReceiptItemRow
                    key={i}
                    item={item}
                    suggestions={suggestionsQuery.data?.data ?? []}
                    onChange={(next) =>
                      setFields((f) => {
                        const items = [...((f.items as ReceiptItemField[] | undefined) ?? [])];
                        items[i] = next;
                        return { ...f, items };
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {Object.entries(fields)
            .filter(
              ([k]) =>
                k !== "checklistName" &&
                k !== "personName" &&
                !(targetType === "grocery_receipt" && ["storeId", "storeNameRaw", "purchasedAt", "totalAmount", "items"].includes(k)),
            )
            .map(([key, value]) => (
              <label key={key} className="mb-2 block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{key}</span>
                <FieldEditor fieldKey={key} value={value} onChange={(v) => setFields((f) => ({ ...f, [key]: v }))} />
              </label>
            ))}

          {showFeedback ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="What's wrong with this?">
                <Input value={feedback} onChange={(e) => setFeedback(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setShowFeedback(false)}>
                  Cancel
                </Button>
                <Button onClick={() => feedback.trim() && reevaluate.mutate()} disabled={reevaluate.isPending}>
                  {reevaluate.isPending ? "Retrying…" : "Try Again"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => confirm.mutate()}
                disabled={confirm.isPending || (targetType === "checklist_item" && !checklistId) || ((targetType === "gift_idea" || targetType === "person_note") && !personId)}
              >
                Looks Good, Add It
              </Button>
              <Button variant="secondary" onClick={() => setShowFeedback(true)}>
                Not Quite
              </Button>
              <Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => discard.mutate()}>
                Discard
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const { confirm, dialog } = useConfirm();

  const { data } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => apiGet<InboxEntry[]>("/inbox"),
    refetchInterval: (query) => (query.state.data?.data?.some((e) => e.status === "processing") ? 1500 : false),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["inbox"] });

  const submitText = useMutation({
    mutationFn: () => apiPost("/inbox/text", { text }),
    onSuccess: () => {
      setText("");
      invalidate();
    },
  });

  const submitPhotos = useMutation({
    mutationFn: (files: File[]) => apiUpload("/inbox/photo", files),
    onSuccess: invalidate,
  });

  const submitMedia = useMutation({
    mutationFn: (files: File[]) => apiUpload("/inbox/media", files),
    onSuccess: invalidate,
  });

  const discardAll = useMutation({
    mutationFn: () => apiPost("/inbox/discard-all", {}),
    onSuccess: invalidate,
  });

  const entries = data?.data ?? [];
  const waiting = entries.filter((e) => e.status !== "processing").length;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Brain Dump</h2>
          <Link to="/brain-dump/instructions" className="shrink-0 text-sm text-primary hover:underline mt-1">
            Edit sorting instructions →
          </Link>
        </div>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          Paste a quick note, or upload a recipe card photo or a recording — review what it proposes before anything's added.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) submitText.mutate();
        }}
        className="grid gap-3"
      >
        <Field label="Dump anything here">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="A todo, an idea, a date..." minRows={3} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={submitText.isPending || !text.trim()}>
            {submitText.isPending ? "Sorting…" : "Sort It"}
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <FilePickerButton label="📷 Recipe card photos" accept="image/*" multiple onFiles={(files) => submitPhotos.mutate(files)} />
        <FilePickerButton label="🎙️ Recipe recording" accept="audio/*,video/*" onFiles={(files) => submitMedia.mutate(files)} />
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">For a recipe card, pick the front and back photos together.</p>
      {(submitPhotos.isPending || submitMedia.isPending) && (
        <p className="text-sm text-slate-600 dark:text-slate-400">Reading it… this can take a little while.</p>
      )}

      {waiting > 1 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={async () => {
              if (await confirm(`Discard all ${waiting} waiting items? Nothing has been added yet, so nothing else changes.`)) discardAll.mutate();
            }}
          >
            Discard all {waiting}
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} onChanged={invalidate} />
        ))}
        {entries.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">Nothing waiting for review.</p>}
      </div>
      {dialog}
    </div>
  );
}
