import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../../core/api/client";
import InlineEditText from "../../shared/components/InlineEditText";
import { SortableList } from "../../shared/components/SortableList";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import BirthdayReminders from "./BirthdayReminders";
import ImportNotesDialog from "./ImportNotesDialog";
import NoteSectionCard from "./NoteSectionCard";
import ScrollChips from "../../shared/components/ScrollChips";
import type { Person, PersonNote, PersonSection, ReminderCascade } from "./types";

function noteMatches(note: PersonNote, q: string): boolean {
  const has = (s: string | null | undefined) => !!s && s.toLowerCase().includes(q);
  if (has(note.title) || has(note.body)) return true;
  return note.items.some((i) => has(i.label) || has(i.text) || i.children.some((c) => has(c.label) || has(c.text)));
}

// Narrows every section to the notes (and, inside a note whose title didn't
// match, the items) that contain the search text.
function filterSections(sections: PersonSection[], q: string, includePrivate: boolean): PersonSection[] {
  const has = (s: string | null | undefined) => !!s && s.toLowerCase().includes(q);
  return sections
    .filter((s) => includePrivate || !s.isPrivate)
    .map((s) => ({
      ...s,
      notes: s.notes
        .filter((n) => noteMatches(n, q))
        .map((n) =>
          has(n.title) || has(n.body)
            ? n
            : { ...n, items: n.items.filter((i) => has(i.label) || has(i.text) || i.children.some((c) => has(c.label) || has(c.text))) },
        ),
    }))
    .filter((s) => s.notes.length > 0 || has(s.title));
}

export default function PersonPage() {
  const { id = "" } = useParams();
  const { hash } = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [includePrivate, setIncludePrivate] = useState(false);
  const [newSection, setNewSection] = useState("");
  const [newSectionPrivate, setNewSectionPrivate] = useState(false);
  const [importing, setImporting] = useState(false);

  const peopleQuery = useQuery({ queryKey: ["people"], queryFn: () => apiGet<Person[]>("/people") });
  const remindersQuery = useQuery({ queryKey: ["reminders"], queryFn: () => apiGet<ReminderCascade[]>("/reminders") });
  const notesQuery = useQuery({ queryKey: ["person-notes", id], queryFn: () => apiGet<PersonSection[]>(`/people/${id}/notes`), enabled: !!id });

  const person = peopleQuery.data?.data?.find((p) => p.id === id);
  const cascade = remindersQuery.data?.data?.find((c) => c.personId === id);
  const sections = notesQuery.data?.data ?? [];

  const invalidateNotes = () => queryClient.invalidateQueries({ queryKey: ["person-notes", id] });

  const updatePerson = useMutation({
    mutationFn: (body: Partial<{ name: string; relationship: string; notes: string }>) => apiPatch(`/people/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["people"] }),
  });
  const addSection = useMutation({
    mutationFn: () => apiPost(`/people/${id}/sections`, { title: newSection, isPrivate: newSectionPrivate }),
    onSuccess: () => {
      setNewSection("");
      setNewSectionPrivate(false);
      invalidateNotes();
    },
  });
  const reorderSections = useMutation({
    mutationFn: (ids: string[]) => apiPatch("/person-sections/reorder", { ids }),
    onSuccess: invalidateNotes,
  });

  // Jump to a note/section when arriving from a link (#note-<id>).
  useEffect(() => {
    if (!hash || sections.length === 0) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, sections.length]);

  const q = search.trim().toLowerCase();
  const filtering = q.length > 0;
  const visibleSections = useMemo(() => (filtering ? filterSections(sections, q, includePrivate) : sections), [sections, q, filtering, includePrivate]);
  const hasPrivate = sections.some((s) => s.isPrivate);
  const allSections = sections.map((s) => ({ id: s.id, title: s.title, notes: s.notes.map((n) => ({ id: n.id, title: n.title })) }));

  if (peopleQuery.isLoading) return <div className="max-w-2xl mx-auto p-6 text-sm text-slate-600 dark:text-slate-400">Loading…</div>;
  if (!person) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-3">
        <p className="text-slate-700 dark:text-slate-200">That person wasn't found.</p>
        <Button asChild variant="secondary">
          <Link to="/people">Back to People</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <Link to="/people" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:underline">
        <ArrowLeft className="h-4 w-4" /> People
      </Link>

      <header className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex flex-wrap items-baseline gap-x-2">
          <InlineEditText value={person.name} onSave={(name) => updatePerson.mutate({ name })} />
          <span className="text-sm font-normal text-slate-600 dark:text-slate-400">
            ·{" "}
            <InlineEditText value={person.relationship ?? ""} onSave={(relationship) => updatePerson.mutate({ relationship })} placeholder="relationship" />
          </span>
        </h2>
        <BirthdayReminders person={person} cascade={cascade} />
        <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
          Import notes from Keep
        </Button>
        <div className="text-sm text-slate-600 dark:text-slate-400">
          <InlineEditText value={person.notes ?? ""} onSave={(notes) => updatePerson.mutate({ notes })} placeholder="Add a short summary..." as="textarea" allowEmpty />
        </div>
      </header>

      <div className="space-y-2">
        <Field label="Search this person's notes">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. flowers, Subway, ring" className="pl-9" />
          </div>
        </Field>
        {hasPrivate && (
          <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
            <input type="checkbox" checked={includePrivate} onChange={(e) => setIncludePrivate(e.target.checked)} className="h-5 w-5 shrink-0 rounded accent-indigo-700" />
            Include private notes in search
          </label>
        )}
        <p className="text-xs text-slate-600 dark:text-slate-400">
          <span className="[@media(hover:none)]:hidden">Use an item's ⋮ menu to pin it to {person.name}'s card.</span>
          <span className="hidden [@media(hover:none)]:inline">Press and hold an item to pin it to {person.name}'s card, or to delete it.</span>
        </p>
        {!filtering && sections.length > 0 && (
          <ScrollChips label="Jump to section">
            {sections.map((s) => (
              <a key={s.id} href={`#section-${s.id}`} className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                {s.title}
              </a>
            ))}
          </ScrollChips>
        )}
      </div>

      <div className="space-y-3">
        {notesQuery.isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading notes…</p>}
        {filtering ? (
          visibleSections.map((s) => <NoteSectionCard key={s.id} section={s} personId={id} allSections={allSections} filtering />)
        ) : (
          <SortableList items={visibleSections} onReorder={(ids) => reorderSections.mutate(ids)}>
            {(s, dragProps) => (
              <div className="mb-3">
                <NoteSectionCard section={s} personId={id} allSections={allSections} filtering={false} dragHandleProps={dragProps} />
              </div>
            )}
          </SortableList>
        )}
        {filtering && visibleSections.length === 0 && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No matches{hasPrivate && !includePrivate ? " (private notes aren't included)" : ""}.
          </p>
        )}
      </div>

      {!filtering && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newSection.trim()) addSection.mutate();
          }}
          className="grid gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
        >
          <Field label="New section">
            <Input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="e.g. Hobbies, Family, Food & Drink, Orders, Dates & Memories, etc." />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
            <input type="checkbox" checked={newSectionPrivate} onChange={(e) => setNewSectionPrivate(e.target.checked)} className="h-5 w-5 shrink-0 rounded accent-indigo-700" />
            Private (hidden until you tap Show)
          </label>
          <div className="flex justify-end">
            <Button type="submit" variant="secondary">
              Add Section
            </Button>
          </div>
        </form>
      )}
      {importing && <ImportNotesDialog personId={id} sections={allSections} onClose={() => setImporting(false)} />}
    </div>
  );
}
