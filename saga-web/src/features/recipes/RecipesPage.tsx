import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckboxField, Field, Input, Textarea } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, apiUpload } from "../../core/api/client";
import { deleteWithUndo } from "../../core/api/undoableDelete";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { SortableList, DragHandle, type SortableHandleProps } from "../../shared/components/SortableList";
import { COMMON_ALLERGENS } from "../../shared/lib/allergens";

interface ProgressStep {
  message: string;
  at: string;
}

interface RecipePhotoEntry {
  id: string;
  kind: string;
  purpose: string | null;
  mediaPaths: string[];
  status: "processing" | "pending" | "failed";
  progressSteps: ProgressStep[];
  proposal: { targetType: string; fields: { title?: string; ingredients?: string[] } } | null;
}

function recipePhotoMediaUrl(path: string): string {
  const filename = path.split(/[/\\]/).pop() ?? path;
  return `/api/inbox/media/${filename}`;
}

function RecipePhotoEntryCard({ entry, onDiscard }: { entry: RecipePhotoEntry; onDiscard: () => void }) {
  const lastStep = entry.progressSteps[entry.progressSteps.length - 1]?.message;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
      <div className="flex gap-2">
        {entry.mediaPaths.map((p) => (
          <img key={p} src={recipePhotoMediaUrl(p)} alt="" className="h-20 rounded border border-slate-200 dark:border-slate-700" />
        ))}
        <div className="flex-1 min-w-0">
          {entry.status === "processing" && (
            <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
              {entry.progressSteps.length === 0 && <li>Starting…</li>}
              {entry.progressSteps.map((step, i) => (
                <li key={i} className={i === entry.progressSteps.length - 1 ? "font-medium text-slate-700 dark:text-slate-200" : ""}>
                  {i === entry.progressSteps.length - 1 ? "→ " : "✓ "}
                  {step.message}
                </li>
              ))}
            </ul>
          )}
          {entry.status === "pending" && (
            <div className="space-y-1">
              <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                Ready: "{entry.proposal?.fields.title ?? "Untitled recipe"}" ({entry.proposal?.fields.ingredients?.length ?? 0}{" "}
                ingredients found)
              </p>
              <Link to="/brain-dump" className="text-xs text-blue-700 dark:text-blue-300 hover:underline">
                Review &amp; confirm in Brain Dump →
              </Link>
            </div>
          )}
          {entry.status === "failed" && (
            <div className="space-y-1">
              <p className="text-sm text-red-600 dark:text-red-400">{lastStep ?? "Something went wrong."}</p>
              <Button variant="secondary" size="sm" onClick={onDiscard}>
                Discard
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface Recipe {
  id: string;
  title: string;
  description: string | null;
  ingredients: string[];
  instructions: string;
  tags: string[];
  prepMinutes: number | null;
  cookMinutes: number | null;
  servings: number | null;
  sourceUrl: string | null;
  allergens: string[];
  sourceImagePaths: string[];
  sourceMediaPaths: string[];
  sourceTranscript: string | null;
}

function mediaUrl(path: string): string {
  const filename = path.split(/[/\\]/).pop() ?? path;
  return `/api/inbox/media/${filename}`;
}

interface RecipeFormValues {
  title: string;
  description: string;
  ingredientsText: string;
  instructions: string;
  tagsText: string;
  prepMinutes: string;
  cookMinutes: string;
  servings: string;
  sourceUrl: string;
  allergensChecked: string[];
  customAllergensText: string;
}

function emptyFormValues(): RecipeFormValues {
  return {
    title: "",
    description: "",
    ingredientsText: "",
    instructions: "",
    tagsText: "",
    prepMinutes: "",
    cookMinutes: "",
    servings: "",
    sourceUrl: "",
    allergensChecked: [],
    customAllergensText: "",
  };
}

function recipeToFormValues(r: Recipe): RecipeFormValues {
  const checked = r.allergens.filter((a) => COMMON_ALLERGENS.includes(a));
  const custom = r.allergens.filter((a) => !COMMON_ALLERGENS.includes(a));
  return {
    title: r.title,
    description: r.description ?? "",
    ingredientsText: r.ingredients.join("\n"),
    instructions: r.instructions,
    tagsText: r.tags.join(", "),
    prepMinutes: r.prepMinutes?.toString() ?? "",
    cookMinutes: r.cookMinutes?.toString() ?? "",
    servings: r.servings?.toString() ?? "",
    sourceUrl: r.sourceUrl ?? "",
    allergensChecked: checked,
    customAllergensText: custom.join(", "),
  };
}

function formValuesToPayload(v: RecipeFormValues) {
  const customAllergens = v.customAllergensText.split(",").map((t) => t.trim()).filter(Boolean);
  const allergens = Array.from(new Set([...v.allergensChecked, ...customAllergens]));
  return {
    title: v.title,
    description: v.description || undefined,
    ingredients: v.ingredientsText.split("\n").map((l) => l.trim()).filter(Boolean),
    instructions: v.instructions,
    tags: v.tagsText.split(",").map((t) => t.trim()).filter(Boolean),
    prepMinutes: v.prepMinutes ? Number(v.prepMinutes) : undefined,
    cookMinutes: v.cookMinutes ? Number(v.cookMinutes) : undefined,
    servings: v.servings ? Number(v.servings) : undefined,
    sourceUrl: v.sourceUrl || undefined,
    allergens,
  };
}

function RecipeForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: RecipeFormValues;
  onSubmit: (values: RecipeFormValues) => void;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [values, setValues] = useState(initial);
  const set = <K extends keyof RecipeFormValues>(key: K, value: RecipeFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const toggleAllergen = (a: string) => {
    setValues((v) => ({
      ...v,
      allergensChecked: v.allergensChecked.includes(a) ? v.allergensChecked.filter((x) => x !== a) : [...v.allergensChecked, a],
    }));
  };

  // A suggestion only — merges into the checkboxes/custom field for review,
  // never saves on its own. Re-running this later (e.g. after a new
  // allergen gets added to COMMON_ALLERGENS) is how an old recipe gets
  // backfilled, without any separate batch job.
  const scanAllergens = useMutation({
    mutationFn: () => {
      const ingredients = values.ingredientsText.split("\n").map((l) => l.trim()).filter(Boolean);
      return apiPost<string[]>("/recipes/scan-allergens", { ingredients });
    },
    onSuccess: (res) => {
      const suggested = res.data ?? [];
      setValues((v) => {
        const matched = COMMON_ALLERGENS.filter((a) => suggested.some((s) => s.toLowerCase() === a.toLowerCase()));
        const unmatched = suggested.filter((s) => !COMMON_ALLERGENS.some((a) => a.toLowerCase() === s.toLowerCase()));
        const existingCustom = v.customAllergensText.split(",").map((t) => t.trim()).filter(Boolean);
        return {
          ...v,
          allergensChecked: Array.from(new Set([...v.allergensChecked, ...matched])),
          customAllergensText: Array.from(new Set([...existingCustom, ...unmatched])).join(", "),
        };
      });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (values.title.trim() && values.ingredientsText.trim() && values.instructions.trim()) onSubmit(values);
      }}
      className="grid gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
    >
      <Field label="Recipe title">
        <Input value={values.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Short description (optional)">
        <Input value={values.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <Field label="Ingredients (one per line)">
        <Textarea value={values.ingredientsText} onChange={(e) => set("ingredientsText", e.target.value)} minRows={4} />
      </Field>
      <Field label="Instructions">
        <Textarea value={values.instructions} onChange={(e) => set("instructions", e.target.value)} minRows={4} />
      </Field>
      <Field label="Tags (comma separated)">
        <Input value={values.tagsText} onChange={(e) => set("tagsText", e.target.value)} placeholder="e.g. dinner, quick" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Prep (min)">
          <Input type="number" inputMode="numeric" value={values.prepMinutes} onChange={(e) => set("prepMinutes", e.target.value)} />
        </Field>
        <Field label="Cook (min)">
          <Input type="number" inputMode="numeric" value={values.cookMinutes} onChange={(e) => set("cookMinutes", e.target.value)} />
        </Field>
        <Field label="Servings">
          <Input type="number" inputMode="numeric" value={values.servings} onChange={(e) => set("servings", e.target.value)} />
        </Field>
      </div>
      <Field label="Source URL (optional)">
        <Input value={values.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} />
      </Field>
      <fieldset className="grid gap-1">
        <div className="flex items-center justify-between gap-2">
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">Allergens</legend>
          <Button type="button" variant="ghost" size="sm" onClick={() => scanAllergens.mutate()} disabled={scanAllergens.isPending || !values.ingredientsText.trim()}>
            {scanAllergens.isPending ? "Scanning…" : "🔍 Suggest from ingredients"}
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3">
          {COMMON_ALLERGENS.map((a) => (
            <CheckboxField key={a} checked={values.allergensChecked.includes(a)} onChange={() => toggleAllergen(a)}>
              {a}
            </CheckboxField>
          ))}
        </div>
        <Field label="Other allergens (comma separated)">
          <Input value={values.customAllergensText} onChange={(e) => set("customAllergensText", e.target.value)} placeholder="e.g. sulfites, corn" />
        </Field>
      </fieldset>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

function RecipeCard({
  recipe,
  onDelete,
  dragHandleProps,
}: {
  recipe: Recipe;
  onDelete: () => void;
  dragHandleProps?: SortableHandleProps;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  const updateRecipe = useMutation({
    mutationFn: (values: RecipeFormValues) => apiPatch(`/recipes/${recipe.id}`, formValuesToPayload(values)),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  if (editing) {
    return (
      <RecipeForm
        initial={recipeToFormValues(recipe)}
        onSubmit={(values) => updateRecipe.mutate(values)}
        onCancel={() => setEditing(false)}
        submitLabel="Save changes"
      />
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex justify-between items-start">
        {dragHandleProps && <DragHandle {...dragHandleProps} />}
        <div className="flex-1 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{recipe.title}</h3>
          {recipe.description && <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{recipe.description}</p>}
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {recipe.prepMinutes ? `${recipe.prepMinutes}m prep` : ""}
            {recipe.prepMinutes && recipe.cookMinutes ? " · " : ""}
            {recipe.cookMinutes ? `${recipe.cookMinutes}m cook` : ""}
            {recipe.servings ? ` · serves ${recipe.servings}` : ""}
          </p>
          {(recipe.tags.length > 0 || recipe.allergens.length > 0) && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {recipe.tags.map((tag) => (
                <span key={tag} className="text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5">
                  {tag}
                </span>
              ))}
              {recipe.allergens.map((a) => (
                <span key={a} className="text-xs rounded-full bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 px-2 py-0.5">
                  ⚠️ {a}
                </span>
              ))}
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="More actions">
              <EllipsisVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => setTimeout(onDelete, 0)}>
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Ingredients</p>
            <ul className="text-sm text-slate-700 dark:text-slate-200 list-disc list-inside space-y-0.5">
              {recipe.ingredients.map((ing, i) => (
                <li key={i}>{ing}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Instructions</p>
            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{recipe.instructions}</p>
          </div>
          {recipe.sourceUrl && (
            <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-700 dark:text-blue-300 hover:underline">
              Source ↗
            </a>
          )}
          {recipe.sourceImagePaths.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">📷 Original card</p>
              <div className="flex gap-2 flex-wrap">
                {recipe.sourceImagePaths.map((p) => (
                  <a key={p} href={mediaUrl(p)} target="_blank" rel="noreferrer">
                    <img src={mediaUrl(p)} alt="" className="h-32 rounded border border-slate-200 dark:border-slate-700" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {recipe.sourceMediaPaths.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">🎙️ Original recording</p>
              {recipe.sourceMediaPaths.map((p) =>
                /\.(mp4|mov|webm|mkv|avi)$/i.test(p) ? (
                  <video key={p} src={mediaUrl(p)} controls className="max-h-48 rounded" />
                ) : (
                  <audio key={p} src={mediaUrl(p)} controls />
                ),
              )}
              {recipe.sourceTranscript && (
                <p className="text-xs text-slate-600 dark:text-slate-400 italic mt-1">"{recipe.sourceTranscript}"</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RecipesPage() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [search, setSearch] = useState("");
  const [hideAllergens, setHideAllergens] = useState<string[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [addMode, setAddMode] = useState<"menu" | "write" | "paste" | null>(null);
  const [pasteText, setPasteText] = useState("");
  const closeAdd = () => {
    setAddMode(null);
    setPasteText("");
  };

  const toggleHideAllergen = (a: string) => {
    setHideAllergens((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  };

  const { data } = useQuery({ queryKey: ["recipes"], queryFn: () => apiGet<Recipe[]>("/recipes") });

  const photoEntriesQuery = useQuery({
    queryKey: ["inbox"],
    queryFn: () => apiGet<RecipePhotoEntry[]>("/inbox"),
    refetchInterval: (query) => (query.state.data?.data?.some((e) => e.status === "processing") ? 1500 : false),
  });

  const createRecipe = useMutation({
    mutationFn: (values: RecipeFormValues) => apiPost("/recipes", formValuesToPayload(values)),
    onSuccess: () => {
      closeAdd();
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const pasteRecipe = useMutation({
    mutationFn: () => apiPost("/inbox/text", { text: pasteText, as: "recipe" }),
    onSuccess: () => {
      closeAdd();
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
  });

  const deleteRecipe = useMutation({
    mutationFn: (id: string) => deleteWithUndo(`/recipes/${id}`, "recipe", id, "Recipe"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });

  const reorderRecipes = useMutation({
    mutationFn: (ids: string[]) => apiPatch("/recipes/reorder", { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });

  const uploadPhotos = useMutation({
    mutationFn: (files: File[]) => apiUpload("/inbox/photo", files),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const discardPhotoEntry = useMutation({
    mutationFn: (id: string) => apiDelete(`/inbox/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const photoEntries = (photoEntriesQuery.data?.data ?? []).filter(
    (e) => e.purpose === "recipe" || (e.kind === "text" && e.proposal?.targetType === "recipe"),
  );

  const recipes = data?.data ?? [];

  // Allergens actually in use across saved recipes, beyond the common list —
  // so a custom tag someone typed in still shows up as a filter option.
  const allAllergensInUse = useMemo(() => {
    const set = new Set<string>(COMMON_ALLERGENS);
    for (const r of recipes) for (const a of r.allergens) set.add(a);
    return Array.from(set);
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter((r) => {
      if (hideAllergens.length > 0 && r.allergens.some((a) => hideAllergens.includes(a))) return false;
      if (!q) return true;
      const haystack = [r.title, r.description ?? "", ...r.ingredients, ...r.tags].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [recipes, search, hideAllergens]);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Recipes</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
              Search by title, ingredient, or tag. Flag allergens to filter recipes containing them out at a glance.
            </p>
          </div>
          <Button className="shrink-0" onClick={() => setAddMode("menu")}>
            + Add recipe
          </Button>
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose recipe card photos"
          onChange={(e) => {
            if (e.target.files?.length) uploadPhotos.mutate(Array.from(e.target.files));
            e.target.value = "";
            closeAdd();
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-label="Take a photo of a recipe"
          onChange={(e) => {
            if (e.target.files?.length) uploadPhotos.mutate(Array.from(e.target.files));
            e.target.value = "";
            closeAdd();
          }}
        />
      </div>

      <Dialog open={addMode !== null} onOpenChange={(open) => !open && closeAdd()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{addMode === "write" ? "Write a recipe" : addMode === "paste" ? "Paste a recipe" : "Add a recipe"}</DialogTitle>
            <DialogDescription className={addMode === "menu" ? undefined : "sr-only"}>How do you want to add it?</DialogDescription>
          </DialogHeader>

          {addMode === "menu" && (
            <div className="grid gap-2">
              {[
                { icon: "✍️", label: "Write it in", hint: "Type the title, ingredients and steps", onClick: () => setAddMode("write") },
                { icon: "📸", label: "Take a photo", hint: "Snap a recipe card, cookbook page or screen", onClick: () => cameraInputRef.current?.click() },
                { icon: "🖼️", label: "Choose photos", hint: "Pick front and back of a card together", onClick: () => photoInputRef.current?.click() },
                { icon: "📋", label: "Paste a recipe", hint: "Drop in text copied from a site or message", onClick: () => setAddMode("paste") },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={o.onClick}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-border px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span className="text-2xl" aria-hidden>
                    {o.icon}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-foreground">{o.label}</span>
                    <span className="block text-xs text-slate-600 dark:text-slate-400">{o.hint}</span>
                  </span>
                </button>
              ))}
              <Button variant="ghost" onClick={closeAdd}>
                Cancel
              </Button>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Photos and pasted text are read for you and shown for review before anything is saved. Voice recordings go through <Link to="/brain-dump" className="underline">Brain Dump</Link>.
              </p>
            </div>
          )}

          {addMode === "write" && (
            <RecipeForm initial={emptyFormValues()} onSubmit={(values) => createRecipe.mutate(values)} onCancel={closeAdd} submitLabel="Save recipe" />
          )}

          {addMode === "paste" && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (pasteText.trim()) pasteRecipe.mutate();
              }}
            >
              <Field label="Recipe text">
                <Textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste the whole recipe here" minRows={6} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeAdd}>
                  Cancel
                </Button>
                <Button type="button" variant="secondary" onClick={() => setAddMode("menu")}>
                  Back
                </Button>
                <Button type="submit" disabled={pasteRecipe.isPending || !pasteText.trim()}>
                  {pasteRecipe.isPending ? "Sending…" : "Read it"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {uploadPhotos.isPending && (
        <p className="text-sm text-slate-600 dark:text-slate-400">Uploading photo(s)…</p>
      )}
      {photoEntries.length > 0 && (
        <div className="space-y-2">
          {photoEntries.map((entry) => (
            <RecipePhotoEntryCard key={entry.id} entry={entry} onDiscard={() => discardPhotoEntry.mutate(entry.id)} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Field label="Search recipes">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, ingredient, or tag" />
        </Field>
        {allAllergensInUse.length > 0 && (
          <fieldset>
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">Hide recipes containing</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3">
              {allAllergensInUse.map((a) => (
                <CheckboxField key={a} checked={hideAllergens.includes(a)} onChange={() => toggleHideAllergen(a)}>
                  {a}
                </CheckboxField>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <div className="space-y-3">
        <SortableList items={filtered} onReorder={(ids) => reorderRecipes.mutate(ids)}>
          {(r, dragProps) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              onDelete={async () => {
                if (await confirm(`Move "${r.title}" to Trash? You can restore it (including its photo/recording) within 30 days.`)) {
                  deleteRecipe.mutate(r.id);
                }
              }}
              // Reordering only makes sense against the true, unfiltered list —
              // the handle is hidden while search/allergen filters narrow what's shown.
              dragHandleProps={filtered.length === recipes.length ? dragProps : undefined}
            />
          )}
        </SortableList>
        {filtered.length === 0 && recipes.length > 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No recipes match.</p>}
        {recipes.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No recipes yet — add your first one.</p>}
      </div>
      {dialog}
    </div>
  );
}
