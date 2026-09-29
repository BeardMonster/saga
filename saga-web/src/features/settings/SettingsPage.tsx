import { Link } from "react-router-dom";
import { Field, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "../../core/api/client";
import { previewPartyCheer } from "../../shared/lib/celebrate";

interface HealthData {
  status: string;
  uptime: number;
}
interface ReadyData {
  status: string;
  database: string;
}

// Human-friendly labels for the raw task keys, for the read-only summary
// below — separate from TASK_LABELS above, which is written for someone
// actively choosing a provider rather than skimming a status list.
const STATUS_TASK_LABELS: Record<string, string> = {
  inbox_text_triage: "Brain Dump: sorting a pasted note into the right list",
  recipe_photo_vision_extract: "Recipe photos: reading a card into structured ingredients/steps",
  recipe_photo_vision_extract_escalated: "Recipe photos: fallback when the local read comes back empty",
  recipe_photo_ocr: "Recipe photos (OCR strategy): raw text extraction",
  recipe_photo_structure: "Recipe photos (OCR strategy): cleaning OCR text into a recipe",
  recipe_voice_structure: "Recipe recordings: turning a transcript into a recipe",
  recipe_allergen_scan: "Recipes: scanning ingredients for allergens",
  insult_extraction: "Insults: picking put-downs out of a video transcript",
  grocery_receipt_vision_extract: "Grocery receipts: reading a photo into store/items/prices",
  grocery_receipt_vision_extract_escalated: "Grocery receipts: fallback when the local read comes back empty",
};

function describeProviderForStatus(setting: { provider: string; ollamaModel?: string }): string {
  if (setting.provider === "ollama") return `Local — ${setting.ollamaModel ?? "llama3.1:8b"}`;
  if (setting.provider === "claude_cli") return "Claude (via Claude Code subscription, not billed per-call)";
  if (setting.provider === "claude") return "Claude API (billed — opt-in only)";
  if (setting.provider === "tesseract") return "Local — Tesseract OCR (not an LLM)";
  return setting.provider;
}

function StatusPill({ label, ok, detail }: { label: string; ok: boolean | undefined; detail?: string }) {
  const color =
    ok === undefined
      ? "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
      : ok
        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
        : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";

  return (
    <div className={`rounded-lg px-4 py-3 ${color}`}>
      <div className="font-semibold">{label}</div>
      <div className="text-sm opacity-80">
        {ok === undefined ? "checking..." : ok ? "connected" : "unreachable"}
        {detail ? ` — ${detail}` : ""}
      </div>
    </div>
  );
}

// Status + "what this runs on" — moved here from the home page, which is now
// about today's progress rather than infrastructure.
function SystemStatusCard() {
  const health = useQuery({ queryKey: ["health"], queryFn: () => apiGet<HealthData>("/health"), retry: false });
  const ready = useQuery({ queryKey: ["ready"], queryFn: () => apiGet<ReadyData>("/ready"), retry: false });
  const aiTasks = useQuery({ queryKey: ["settings", "ai-tasks", "status"], queryFn: () => apiGet<AiTaskSetting[]>("/settings/ai-tasks") });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatusPill label="API" ok={health.isSuccess ? health.data.status === "ok" : health.isError ? false : undefined} />
        <StatusPill
          label="Database"
          ok={ready.isSuccess ? ready.data.status === "ok" : ready.isError ? false : undefined}
          detail={ready.data?.data?.database}
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">What this is built on</h3>

        <div>
          <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">Stack</h4>
          <dl className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="font-medium text-slate-800 dark:text-slate-100 w-20 shrink-0">Backend</dt>
              <dd>Fastify 5 + TypeScript + Prisma, on PostgreSQL 16</dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="font-medium text-slate-800 dark:text-slate-100 w-20 shrink-0">Frontend</dt>
              <dd>React 19 + Vite + TypeScript + TanStack Query + Axios + Tailwind CSS + shadcn/ui (Radix)</dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="font-medium text-slate-800 dark:text-slate-100 w-20 shrink-0">Design</dt>
              <dd>
                Follows Material Design 3 (rounded cards, bottom navigation and bottom sheets on phones, 48px touch targets) and Nielsen's 10
                usability heuristics as the review checklist. Built phone-first, since it becomes an Android app.
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="font-medium text-slate-800 dark:text-slate-100 w-20 shrink-0">Infra</dt>
              <dd>Docker containers on an Ubuntu LXC (Proxmox), with an NVIDIA GPU passed through for local AI</dd>
            </div>
          </dl>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">AI models in use</h4>
          <dl className="text-sm text-slate-600 dark:text-slate-300 space-y-1.5">
            {aiTasks.data?.data?.map((task) => (
              <div key={task.taskKey} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <dt className="text-slate-800 dark:text-slate-100 flex-1 min-w-0 break-words">{STATUS_TASK_LABELS[task.taskKey] ?? task.taskKey}</dt>
                <dd className="sm:shrink-0 text-slate-600 dark:text-slate-400 sm:text-right">{describeProviderForStatus(task)}</dd>
              </div>
            ))}
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <dt className="text-slate-800 dark:text-slate-100 flex-1 min-w-0 break-words">Grocery scan: judging which search result is a genuine match</dt>
              <dd className="sm:shrink-0 text-slate-600 dark:text-slate-400 sm:text-right">Local — llama3.1:8b</dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="text-slate-800 dark:text-slate-100 flex-1 min-w-0 break-words">Grocery scan: reading Flipp's image-rendered prices</dt>
              <dd className="sm:shrink-0 text-slate-600 dark:text-slate-400 sm:text-right">Local — qwen3-vl:4b</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
            Local models run for free on this box's own GPU. Claude is opt-in per task above and, where used via the
            API rather than the CLI subscription, has real per-call cost.
          </p>
        </div>
      </div>
    </div>
  );
}

type AiProvider = "ollama" | "claude" | "tesseract" | "claude_cli";

interface AiTaskSetting {
  taskKey: string;
  provider: AiProvider;
  ollamaModel?: string;
}

const TASK_LABELS: Record<string, string> = {
  inbox_text_triage: "Brain Dump: sorting pasted text",
  recipe_photo_vision_extract: "Recipe photos: reading it directly (only used when local OCR confidence is too low)",
  recipe_photo_vision_extract_escalated: "Recipe photos: last-resort read (only used when the local vision model also comes up empty)",
  recipe_photo_structure: "Recipe photos: structuring OCR'd text (used when local OCR reads it fine)",
  recipe_voice_structure: "Recipe recordings: turning a transcript into a recipe",
  recipe_allergen_scan: "Recipes: suggesting allergens from ingredients",
  insult_extraction: "Insults: picking put-downs out of a video transcript",
  grocery_receipt_vision_extract: "Grocery receipts: reading a photo into store/items/prices",
  grocery_receipt_vision_extract_escalated: "Grocery receipts: fallback when the local read comes back empty",
};

// A radio choice as a comfortable tap row.
function RadioRow({ checked, onSelect, children }: { checked: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-slate-700 dark:text-slate-200">
      <input type="radio" checked={checked} onChange={onSelect} className="mt-0.5 h-5 w-5 shrink-0 accent-indigo-700" />
      {children}
    </label>
  );
}

function TaskRow({ setting, ollamaModels }: { setting: AiTaskSetting; ollamaModels: string[] }) {
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (body: { provider: AiProvider; ollamaModel?: string }) =>
      apiPatch(`/settings/ai-tasks/${setting.taskKey}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-task-settings"] }),
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
      <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{TASK_LABELS[setting.taskKey] ?? setting.taskKey}</p>
      <fieldset className="grid gap-0">
        <legend className="sr-only">Provider for this task</legend>
        <RadioRow checked={setting.provider === "ollama"} onSelect={() => update.mutate({ provider: "ollama", ollamaModel: ollamaModels[0] })}>
          Local (Ollama)
        </RadioRow>
        <RadioRow checked={setting.provider === "claude_cli"} onSelect={() => update.mutate({ provider: "claude_cli" })}>
          <span>
            Claude (your Pro/Max plan){" "}
            <span className="block text-xs text-green-700 dark:text-green-400">
              Uses your subscription's own usage limits, not a separate cost — last resort for what local can't do.
            </span>
          </span>
        </RadioRow>
        <RadioRow checked={setting.provider === "claude"} onSelect={() => update.mutate({ provider: "claude" })}>
          <span>
            Claude API{" "}
            <span className="block text-xs text-amber-700 dark:text-amber-400">Real cost — a separate Anthropic API key, not your Pro/Claude Code plan.</span>
          </span>
        </RadioRow>
      </fieldset>
      {setting.provider === "ollama" && (
        <Field label="Local model">
          <Select value={setting.ollamaModel ?? ""} onChange={(e) => update.mutate({ provider: "ollama", ollamaModel: e.target.value })}>
            {ollamaModels.length === 0 && <option value="">No models pulled yet</option>}
            {ollamaModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}

interface ClaudeCliTokenStatus {
  configured: boolean;
  issuedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
}

function ClaudeCliTokenCard() {
  const tokenQuery = useQuery({
    queryKey: ["claude-cli-token"],
    queryFn: () => apiGet<ClaudeCliTokenStatus>("/settings/claude-cli-token"),
  });
  const status = tokenQuery.data?.data;

  if (!status || !status.configured) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-1">
        <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">Claude Pro/Max token</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Not configured yet — run <code>claude setup-token</code> on a device logged into your Pro/Max account and set
          the result in <code>saga-api/.env</code> as <code>CLAUDE_CODE_OAUTH_TOKEN</code> (plus{" "}
          <code>CLAUDE_CODE_OAUTH_TOKEN_ISSUED_AT</code> for this countdown).
        </p>
      </div>
    );
  }

  if (status.daysRemaining === null) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-1">
        <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">Claude Pro/Max token</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Configured, but no issue date set — add <code>CLAUDE_CODE_OAUTH_TOKEN_ISSUED_AT</code> to{" "}
          <code>saga-api/.env</code> to see days remaining.
        </p>
      </div>
    );
  }

  const isExpired = status.daysRemaining <= 0;
  const isLow = status.daysRemaining <= 30;
  const colorClass = isExpired
    ? "text-red-600 dark:text-red-400"
    : isLow
      ? "text-amber-700 dark:text-amber-400"
      : "text-green-700 dark:text-green-400";

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-1">
      <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">Claude Pro/Max token</p>
      <p className={`text-sm font-semibold ${colorClass}`}>
        {isExpired ? "Expired" : `${status.daysRemaining} days left`}
      </p>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Issued {status.issuedAt} · expires {status.expiresAt} (Claude Code's <code>setup-token</code> is a flat
        one-year token — no known inactivity-based early expiry, so nothing needs to "use" it to keep it alive)
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["ai-task-settings"], queryFn: () => apiGet<AiTaskSetting[]>("/settings/ai-tasks") });
  const modelsQuery = useQuery({ queryKey: ["ollama-models"], queryFn: () => apiGet<string[]>("/settings/ollama-models"), retry: false });

  const settings = settingsQuery.data?.data ?? [];
  const ollamaModels = modelsQuery.data?.data ?? [];
  const visibleTasks = settings.filter((s) => s.taskKey !== "recipe_photo_ocr");

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Settings</h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          Which model handles which AI-assisted task. Everything defaults to local (Ollama) or your Claude Pro/Max plan —
          nothing costs money out of the box. The separate "Claude API" option is a real, distinct cost (a paid Anthropic
          API key, unrelated to any claude.ai Pro or Claude Code subscription) and is never a default anywhere.
        </p>
        <Link to="/brain-dump/instructions" className="text-sm text-primary hover:underline">
          Brain Dump: sorting instructions →
        </Link>
      </div>

      {modelsQuery.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Couldn't reach Ollama to list pulled models — is it running?
        </p>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
        <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">Sound & celebrations</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Completing a checklist or project has a 1-in-5 chance of playing this rare alternate cheer instead of the usual chime.
        </p>
        <Button type="button" variant="outline" onClick={() => previewPartyCheer()}>
          Preview celebration sound
        </Button>
      </div>

      <ClaudeCliTokenCard />

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-1">
        <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">Recipe photo reading — automatic</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Every recipe photo always tries local OCR (Tesseract) first, fully free. If Tesseract's own confidence score
          comes back too low to trust — the actual signature of cursive or messy handwriting — it automatically escalates
          to whichever provider is set below for "reading it directly," instead of structuring garbage text. You'll see
          each step live in the Brain Dump / Recipes review queue as it happens.
        </p>
      </div>

      {visibleTasks.map((setting) => (
        <TaskRow key={setting.taskKey} setting={setting} ollamaModels={ollamaModels} />
      ))}

      <div className="pt-2">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">System status</h3>
        <SystemStatusCard />
      </div>
    </div>
  );
}
