import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EllipsisVertical, Search, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiPatch } from "../../core/api/client";
import { deleteWithUndo } from "../../core/api/undoableDelete";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { formatDateOnly } from "../../shared/lib/dates";
import { SortableList, DragHandle, type SortableHandleProps } from "../../shared/components/SortableList";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BirthdayFields, birthdayToPayload, emptyBirthday, type BirthdayValue } from "./BirthdayFields";
import type { Person, ReminderCascade } from "./types";

interface SearchHit {
  personId: string;
  personName: string;
  sectionTitle: string;
  noteTitle: string;
  anchor: string | null;
  label: string | null;
  text: string;
  isPrivate: boolean;
}

// A short summary card — everything else about the person lives on their
// own page, so this list stays uncluttered however many notes they have.
function PersonCard({
  person,
  cascade,
  dragHandleProps,
}: {
  person: Person;
  cascade: ReminderCascade | undefined;
  dragHandleProps: SortableHandleProps;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const deletePerson = useMutation({
    mutationFn: () => deleteWithUndo(`/people/${person.id}`, "person", person.id, "Person"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
  });

  const nextReminder = cascade?.instances
    .filter((i) => !i.sentAt)
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt))[0];
  const openHref = `/people/${person.id}`;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <DragHandle {...dragHandleProps} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">
            <Link to={openHref} className="inline-flex min-h-10 items-center hover:underline">
              {person.name}
            </Link>
            {person.relationship && <span className="ml-1.5 text-xs font-normal text-slate-600 dark:text-slate-400">· {person.relationship}</span>}
          </h3>

          {person.birthday && (
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              🎂 {formatDateOnly(person.birthday)}
              {nextReminder && <span className="text-xs"> · next reminder {formatDateOnly(nextReminder.fireAt, { month: "short", day: "numeric" })}</span>}
            </p>
          )}

          {person.pinnedFacts.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {person.pinnedFacts.map((f) => (
                <li key={f.id}>
                  <Link
                    to={`${openHref}#item-${f.id}`}
                    className="block rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    {f.label ? `${f.label}: ${f.text}` : f.text}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            {person.giftIdeaCount} gift idea{person.giftIdeaCount === 1 ? "" : "s"}
          </p>
        </div>

        <Button asChild variant="secondary" size="sm" className="shrink-0">
          <Link to={openHref}>Open</Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="More actions">
              <EllipsisVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              destructive
              onSelect={() =>
                setTimeout(async () => {
                  if (await confirm(`Move "${person.name}" to Trash? Their notes and gift ideas go with them — you can restore everything within 30 days.`)) {
                    deletePerson.mutate();
                  }
                }, 0)
              }
            >
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {dialog}
    </div>
  );
}

export default function PeoplePage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [birthday, setBirthday] = useState<BirthdayValue>(emptyBirthday);
  const birthdayPayload = birthdayToPayload(birthday);
  const birthdayPartial = birthday.month !== "" || birthday.day !== "" || birthday.year !== "";
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [includePrivate, setIncludePrivate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data } = useQuery({
    queryKey: ["people"],
    queryFn: () => apiGet<Person[]>("/people"),
  });

  const remindersQuery = useQuery({
    queryKey: ["reminders"],
    queryFn: () => apiGet<ReminderCascade[]>("/reminders"),
  });

  const createPerson = useMutation({
    mutationFn: () => apiPost("/people", { name, relationship: relationship || undefined, ...(birthdayPayload ?? {}) }),
    onSuccess: () => {
      setName("");
      setRelationship("");
      setBirthday(emptyBirthday);
      queryClient.invalidateQueries({ queryKey: ["people"] });
    },
  });

  const reorderPeople = useMutation({
    mutationFn: (ids: string[]) => apiPatch("/people/reorder", { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["people"] }),
  });

  const people = data?.data ?? [];
  const cascades = remindersQuery.data?.data ?? [];

  const searching = debounced.length >= 2;
  const searchQuery = useQuery({
    queryKey: ["people-search", debounced, includePrivate],
    queryFn: () => apiGet<SearchHit[]>(`/people/notes/search?q=${encodeURIComponent(debounced)}&includePrivate=${includePrivate}`),
    enabled: searching,
  });
  const nameMatches = searching ? people.filter((p) => p.name.toLowerCase().includes(debounced.toLowerCase())) : [];
  const hits = searchQuery.data?.data ?? [];
  const hitsByPerson = hits.reduce<Record<string, SearchHit[]>>((acc, h) => {
    (acc[h.personName] ??= []).push(h);
    return acc;
  }, {});

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">People</h2>
      <p className="text-slate-600 dark:text-slate-400 text-sm -mt-3">
        Profiles, notes, gift ideas, and birthday reminders. Open a person for everything about them. Your own wishlist lives on MyRegistry.com, not here.
      </p>

      <div className="space-y-2">
        <Field label="Search everyone">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Names, notes, favorites, gift ideas..." className="pl-9" />
          </div>
        </Field>
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
          <input type="checkbox" checked={includePrivate} onChange={(e) => setIncludePrivate(e.target.checked)} className="h-5 w-5 shrink-0 rounded accent-indigo-700" />
          Include private notes
        </label>

        {searching && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-3">
            {searchQuery.isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Searching…</p>}
            {nameMatches.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400 mb-1">People</p>
                <ul className="space-y-1">
                  {nameMatches.map((p) => (
                    <li key={p.id}>
                      <Link to={`/people/${p.id}`} className="block min-h-11 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:underline">
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {Object.entries(hitsByPerson).map(([personName, personHits]) => (
              <div key={personName}>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400 mb-1">{personName}</p>
                <ul className="space-y-1">
                  {personHits.map((h, i) => (
                    <li key={i}>
                      <Link
                        to={`/people/${h.personId}${h.anchor ? `#${h.anchor}` : ""}`}
                        className="block min-h-11 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span className="block text-xs text-slate-600 dark:text-slate-400">
                          {h.sectionTitle} › {h.noteTitle}
                        </span>
                        <span className="block text-sm text-slate-800 dark:text-slate-100 break-words">{h.label ? `${h.label}: ${h.text}` : h.text}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!searchQuery.isLoading && nameMatches.length === 0 && hits.length === 0 && (
              <p className="text-sm text-slate-600 dark:text-slate-400">No matches{includePrivate ? "" : " (private notes aren't included)"}.</p>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !(birthdayPartial && !birthdayPayload)) createPerson.mutate();
        }}
        className="grid gap-3"
      >
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Who is this?" />
        </Field>
        <Field label="Relationship (optional)">
          <Input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="e.g. friend, cousin" />
        </Field>
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">Birthday (optional)</legend>
          <BirthdayFields value={birthday} onChange={setBirthday} />
        </fieldset>
        <div className="flex justify-end">
          <Button type="submit">Add Person</Button>
        </div>
      </form>

      <div className="space-y-4">
        <SortableList items={people} onReorder={(ids) => reorderPeople.mutate(ids)}>
          {(p, dragProps) => <PersonCard key={p.id} person={p} cascade={cascades.find((c) => c.personId === p.id)} dragHandleProps={dragProps} />}
        </SortableList>
        {people.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No one added yet.</p>}
      </div>
    </div>
  );
}
