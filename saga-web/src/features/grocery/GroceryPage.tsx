import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, apiUpload } from "../../core/api/client";
import { deleteWithUndo } from "../../core/api/undoableDelete";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { SortableList, DragHandle } from "../../shared/components/SortableList";
import ChecklistCard from "../../shared/components/ChecklistCard";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Store {
  id: string;
  name: string;
  flippSlug: string | null;
  source: "flipp" | "manual" | "direct";
  externalConfig: Record<string, unknown> | null;
}

interface ShoppingListItem {
  id: string;
  name: string;
}

interface Deal {
  id: string;
  matchedProductName: string;
  price: string;
  unitPrice: string | null;
  unit: string | null;
  validTo: string | null;
  scannedAt: string;
  sourceUrl: string | null;
  store: Store;
}

interface ComparisonRow {
  shoppingListItem: ShoppingListItem;
  deals: Deal[];
}

interface ScanStatus {
  running: boolean;
  lastRunAt: string | null;
  lastSummary: { recorded: number; notFound: number; errors: number; itemsScanned: number } | null;
  lastError: string | null;
  log: string[];
}

function formatValidTo(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function ShoppingListSection() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [newItem, setNewItem] = useState("");

  const { data } = useQuery({ queryKey: ["grocery-shopping-list"], queryFn: () => apiGet<ShoppingListItem[]>("/grocery/shopping-list") });
  const items = data?.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["grocery-shopping-list"] });
    queryClient.invalidateQueries({ queryKey: ["grocery-comparison"] });
  };

  const createItem = useMutation({
    mutationFn: () => apiPost("/grocery/shopping-list", { name: newItem }),
    onSuccess: () => {
      setNewItem("");
      invalidate();
    },
  });
  const deleteItem = useMutation({ mutationFn: (id: string) => deleteWithUndo(`/grocery/shopping-list/${id}`, "shopping_list_item", id, "Item"), onSuccess: invalidate });
  const reorderItems = useMutation({
    mutationFn: (ids: string[]) => apiPatch("/grocery/shopping-list/reorder", { ids }),
    onSuccess: invalidate,
  });

  return (
    <section className="space-y-2">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Shopping list</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 -mt-1">
        The staples to price-check every scan. Names are searched literally on Flipp, so keep them simple ("chicken
        breast", not a specific brand).
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newItem.trim()) createItem.mutate();
        }}
        className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <Field label="Add a staple item">
          <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="e.g. chicken breast" />
        </Field>
        <Button type="submit">Add</Button>
      </form>
      <ul className="space-y-1">
        <SortableList as="li" items={items} onReorder={(ids) => reorderItems.mutate(ids)}>
          {(item, dragProps) => (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
            <DragHandle {...dragProps} />
            <span className="text-slate-700 dark:text-slate-200">{item.name}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-auto shrink-0" aria-label="More actions">
                  <EllipsisVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  destructive
                  onSelect={() =>
                    setTimeout(async () => {
                      if (await confirm(`Move "${item.name}" to Trash? You can restore it within 30 days.`)) deleteItem.mutate(item.id);
                    }, 0)
                  }
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          )}
        </SortableList>
        {items.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No staples yet — add one above.</p>}
      </ul>
      {dialog}
    </section>
  );
}

const cleanAddress = (raw: unknown) => (typeof raw === "string" ? raw.replace(/\s*\(confirmed by [^)]*\)/i, "").trim() : "");

// Plain-English "how does this store get scanned", from its saved config.
function describeScan(store: Store): string {
  const zip = typeof store.externalConfig?.zip === "string" ? store.externalConfig.zip : "27615";
  const hint = typeof store.externalConfig?.locationHint === "string" ? store.externalConfig.locationHint : "";
  if (store.source === "direct") {
    return `Scanned on the store's own website, pinned to the location near ZIP ${zip}${hint ? ` matching "${hint}"` : ""}.`;
  }
  if (store.source === "flipp") return `Weekly ad from Flipp for ZIP ${zip} (regional flyer — not tied to one street address).`;
  return "Not scanned automatically yet.";
}

function StoreLocationDialog({ store, onClose, onSaved }: { store: Store; onClose: () => void; onSaved: () => void }) {
  const config = store.externalConfig ?? {};
  const [address, setAddress] = useState(cleanAddress(config.preferredLocation));
  const [zip, setZip] = useState(typeof config.zip === "string" ? config.zip : "");
  const [hint, setHint] = useState(typeof config.locationHint === "string" ? config.locationHint : "");

  const save = useMutation({
    mutationFn: () => {
      const next: Record<string, unknown> = { ...config, preferredLocation: address.trim() || undefined, zip: zip.trim() || undefined };
      if (store.source === "direct") next.locationHint = hint.trim() || undefined;
      return apiPatch(`/grocery/stores/${store.id}`, { externalConfig: next });
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{store.name} location</DialogTitle>
          <DialogDescription>{describeScan(store)}</DialogDescription>
        </DialogHeader>
        <Field label="Street address">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Where you actually shop" />
        </Field>
        <Field label="Scan near ZIP">
          <Input value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" maxLength={5} />
        </Field>
        {store.source === "direct" && (
          <Field label="Location keyword" hint="A word from the address (like a street name) that picks the right store on the store's own website.">
            <Input value={hint} onChange={(e) => setHint(e.target.value)} />
          </Field>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StoresSection() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  const { data } = useQuery({ queryKey: ["grocery-stores"], queryFn: () => apiGet<Store[]>("/grocery/stores") });
  const stores = data?.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["grocery-stores"] });
    queryClient.invalidateQueries({ queryKey: ["grocery-comparison"] });
  };

  const createStore = useMutation({
    mutationFn: () => apiPost("/grocery/stores", { name: newName, flippSlug: newSlug || undefined, source: newSlug ? "flipp" : "manual" }),
    onSuccess: () => {
      setNewName("");
      setNewSlug("");
      invalidate();
    },
  });
  const deleteStore = useMutation({ mutationFn: (id: string) => deleteWithUndo(`/grocery/stores/${id}`, "grocery_store", id, "Store"), onSuccess: invalidate });
  const reorderStores = useMutation({
    mutationFn: (ids: string[]) => apiPatch("/grocery/stores/reorder", { ids }),
    onSuccess: invalidate,
  });

  return (
    <section className="space-y-2">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Stores</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 -mt-1">
        Stores with a Flipp slug get auto-scanned weekly. Leave the slug blank for a store that has to be checked
        manually (e.g. an independent market not on Flipp) — it just won't show up in comparisons yet.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) createStore.mutate();
        }}
        className="grid gap-3"
      >
        <Field label="Store name">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Aldi" />
        </Field>
        <Field label="Flipp slug (optional)" hint="Leave blank for a store that has to be checked manually.">
          <Input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="e.g. aldi" />
        </Field>
        <div className="flex justify-end">
          <Button type="submit">Add Store</Button>
        </div>
      </form>
      <ul className="space-y-1">
        <SortableList as="li" items={stores} onReorder={(ids) => reorderStores.mutate(ids)}>
          {(store, dragProps) => (
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
            <span className="mt-1"><DragHandle {...dragProps} /></span>
            <div className="min-w-0 flex-1 py-1">
              <p className="font-medium text-slate-800 dark:text-slate-100">{store.name}</p>
              {cleanAddress(store.externalConfig?.preferredLocation) ? (
                <p className="text-slate-700 dark:text-slate-300 break-words">📍 {cleanAddress(store.externalConfig?.preferredLocation)}</p>
              ) : (
                <button type="button" onClick={() => setEditingStore(store)} className="text-xs text-indigo-700 dark:text-indigo-300 hover:underline min-h-8">
                  + Add address
                </button>
              )}
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{describeScan(store)}</p>
              {typeof store.externalConfig?.note === "string" && store.externalConfig.note && (
                <p className="mt-0.5 text-xs italic text-slate-600 dark:text-slate-400 break-words">{store.externalConfig.note}</p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-auto shrink-0" aria-label="More actions">
                  <EllipsisVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setTimeout(() => setEditingStore(store), 0)}>
                  <Pencil className="h-4 w-4" /> Edit location
                </DropdownMenuItem>
                <DropdownMenuItem
                  destructive
                  onSelect={() =>
                    setTimeout(async () => {
                      if (await confirm(`Move "${store.name}" to Trash? You can restore it within 30 days.`)) deleteStore.mutate(store.id);
                    }, 0)
                  }
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          )}
        </SortableList>
        {stores.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No stores yet — add one above.</p>}
      </ul>
      {editingStore && <StoreLocationDialog store={editingStore} onClose={() => setEditingStore(null)} onSaved={invalidate} />}
      {dialog}
    </section>
  );
}

function formatScanTime(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ScanControl() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["grocery-scan-status"],
    queryFn: () => apiGet<ScanStatus>("/grocery/scan-status"),
    refetchInterval: (query) => (query.state.data?.data?.running ? 3000 : false),
    retry: false,
  });
  const status = statusQuery.data?.data;

  const triggerScan = useMutation({
    mutationFn: () => apiPost("/grocery/scan"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grocery-scan-status"] });
      // The scan writes deals as it goes — worth refreshing the comparison
      // view periodically too, not just at the very end.
      const interval = setInterval(() => queryClient.invalidateQueries({ queryKey: ["grocery-comparison"] }), 5000);
      setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
    },
  });

  if (statusQuery.isError) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-700 dark:text-amber-300">
        Couldn't reach the grocery scanner service — it may not be running. Check that the `saga-grocery-scanner`
        container is up.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-600 dark:text-slate-400">
        {status?.running ? (
          <span className="text-blue-700 dark:text-blue-300">Scanning now…</span>
        ) : (
          <>
            Last scan: {formatScanTime(status?.lastRunAt ?? null)}
            {status?.lastSummary && (
              <span>
                {" "}
                — {status.lastSummary.recorded} deal{status.lastSummary.recorded === 1 ? "" : "s"} found,{" "}
                {status.lastSummary.notFound} not in this week's catalog
                {status.lastSummary.errors > 0 && `, ${status.lastSummary.errors} error(s)`}
              </span>
            )}
            {status?.lastError && <span className="text-red-600 dark:text-red-400"> — last run failed: {status.lastError}</span>}
          </>
        )}
      </div>
      <Button onClick={() => triggerScan.mutate()} disabled={status?.running || triggerScan.isPending} className="shrink-0">
        {status?.running ? "Scanning…" : "Scan Now"}
      </Button>
    </div>
  );
}

interface StandaloneChecklist {
  id: string;
  name: string;
  kind: "generic" | "grocery" | "note";
  completedAt: string | null;
}

// The actual "what to buy this trip" list — a real checklist (same one from
// the Checklists page, same ChecklistCard, same add/check/reorder/rename),
// just shown here instead since it belongs with the rest of the grocery
// stuff. Distinct from the staples list below, which is config for the
// price scanner, not a shopping list.
function GroceryChecklistSection() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");

  const { data } = useQuery({
    queryKey: ["checklists", "standalone"],
    queryFn: () => apiGet<StandaloneChecklist[]>("/checklists?standalone=true"),
  });
  const lists = (data?.data ?? []).filter((c) => c.kind === "grocery" && !c.completedAt);

  const createChecklist = useMutation({
    mutationFn: () => apiPost("/checklists", { name: newName, kind: "grocery" }),
    onSuccess: () => {
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
    },
  });

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Grocery List</h3>
      {lists.map((c) => (
        <ChecklistCard key={c.id} checklistId={c.id} />
      ))}
      {lists.length === 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) createChecklist.mutate();
          }}
          className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
        >
          <Field label="Start a grocery list">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Grocery List" />
          </Field>
          <Button type="submit">Create</Button>
        </form>
      )}
    </section>
  );
}

interface CatalogItem {
  id: string;
  name: string;
  timesAppeared: number;
  timesBought: number;
  lastBoughtAt: string | null;
}

function formatCatalogDate(iso: string | null): string {
  if (!iso) return "never bought yet";
  return `last bought ${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

// The durable "how often do we actually buy this" view — builds up as
// weekly lists get archived (see the API's startNewWeek), and survives
// even after the detailed weekly checklists themselves age out at 90 days.
function GroceryCatalogSection() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["grocery-catalog"],
    queryFn: () => apiGet<CatalogItem[]>("/grocery/catalog"),
    enabled: open,
  });
  const items = data?.data ?? [];

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center gap-1 text-lg font-semibold text-slate-800 dark:text-slate-100"
      >
        {open ? "▾" : "▸"} Purchase history
      </button>
      {open && (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400 -mt-1">
            How often each item actually gets bought, across every week's list — staples and one-off items alike.
          </p>
          <ul className="space-y-1">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              >
                <span className="text-slate-700 dark:text-slate-200">{item.name}</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  bought {item.timesBought} of {item.timesAppeared} {item.timesAppeared === 1 ? "week" : "weeks"} · {formatCatalogDate(item.lastBoughtAt)}
                </span>
              </li>
            ))}
            {items.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">Nothing yet — this fills in as weekly lists get archived.</p>}
          </ul>
        </>
      )}
    </section>
  );
}

interface ReceiptProgressStep {
  message: string;
  at: string;
}
interface ReceiptEntry {
  id: string;
  purpose: string | null;
  mediaPaths: string[];
  status: "processing" | "pending" | "failed";
  progressSteps: ReceiptProgressStep[];
  proposal: { targetType: string; fields: { items?: unknown[] } } | null;
}

function receiptMediaUrl(path: string): string {
  const filename = path.split(/[/\\]/).pop() ?? path;
  return `/api/inbox/media/${filename}`;
}

function ReceiptEntryCard({ entry, onDiscard }: { entry: ReceiptEntry; onDiscard: () => void }) {
  const lastStep = entry.progressSteps[entry.progressSteps.length - 1]?.message;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
      <div className="flex gap-2">
        {entry.mediaPaths.map((p) => (
          <img key={p} src={receiptMediaUrl(p)} alt="" className="h-20 rounded border border-slate-200 dark:border-slate-700" />
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
                Ready: {entry.proposal?.fields.items?.length ?? 0} item(s) found
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

function ReceiptCaptureSection() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => apiGet<ReceiptEntry[]>("/inbox"),
    refetchInterval: (query) => (query.state.data?.data?.some((e) => e.status === "processing") ? 1500 : false),
  });
  const entries = (data?.data ?? []).filter((e) => e.purpose === "grocery_receipt");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["inbox"] });

  const upload = useMutation({
    mutationFn: (files: File[]) => apiUpload("/inbox/receipt-photo", files),
    onSuccess: invalidate,
  });
  const discardOne = useMutation({
    mutationFn: (id: string) => apiDelete(`/inbox/${id}`),
    onSuccess: invalidate,
  });

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Receipts</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 -mt-1">
          Take a photo of a receipt and it'll read the store, items, and prices — checking off matching items on your
          list automatically once you confirm.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a receipt photo"
        onChange={(e) => {
          if (e.target.files?.length) upload.mutate(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label="Take a photo of a receipt"
        onChange={(e) => {
          if (e.target.files?.length) upload.mutate(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => cameraRef.current?.click()}>
          📸 Take a photo
        </Button>
        <Button variant="outline" onClick={() => inputRef.current?.click()}>
          🖼️ Choose a photo
        </Button>
      </div>
      {upload.isPending && <p className="text-sm text-slate-600 dark:text-slate-400">Uploading…</p>}
      {entries.map((entry) => (
        <ReceiptEntryCard key={entry.id} entry={entry} onDiscard={() => discardOne.mutate(entry.id)} />
      ))}
    </section>
  );
}

export default function GroceryPage() {
  const { data } = useQuery({ queryKey: ["grocery-comparison"], queryFn: () => apiGet<ComparisonRow[]>("/grocery/comparison") });
  const rows = data?.data ?? [];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Grocery Deals</h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          This week's cheapest store per staple — ranked by price per lb/oz when a store shows one, since package
          sizes vary between stores; falls back to the listed price when no per-unit rate is available for that
          deal, which can still be an imperfect comparison in mixed cases. Runs automatically once a week, or on
          demand below.
        </p>
      </div>

      <GroceryChecklistSection />

      <ReceiptCaptureSection />

      <ScanControl />

      <section className="space-y-3">
        {rows.map((row) => (
          <div key={row.shoppingListItem.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">{row.shoppingListItem.name}</h3>
            {row.deals.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">No current match found in any scanned store's weekly ad.</p>
            ) : (
              <ul className="space-y-1">
                {row.deals.map((deal, i) => (
                  <li
                    key={deal.id}
                    className={`flex flex-col gap-0.5 rounded-lg px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
                      i === 0 ? "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300" : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <span className="min-w-0 break-words">
                      {i === 0 && "🏆 "}
                      <span className="font-medium">{deal.store.name}</span> — {deal.matchedProductName}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 font-mono sm:shrink-0 sm:justify-end">
                      <span>
                        ${deal.price}
                        {deal.unitPrice ? (
                          <span className="text-slate-600 dark:text-slate-400"> (${deal.unitPrice}/{deal.unit})</span>
                        ) : (
                          deal.unit && ` ${deal.unit}`
                        )}
                        {deal.validTo && <span className="ml-1 text-xs text-slate-600 dark:text-slate-400">thru {formatValidTo(deal.validTo)}</span>}
                      </span>
                      {deal.sourceUrl && (
                        <a
                          href={deal.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center font-sans text-xs text-indigo-700 dark:text-indigo-300 hover:underline whitespace-nowrap"
                          title="Open this product on the store's site to verify"
                        >
                          verify ↗
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No shopping list items yet — add some below.</p>}
      </section>

      <ShoppingListSection />
      <StoresSection />
      <GroceryCatalogSection />
    </div>
  );
}
