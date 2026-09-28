import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../core/api/client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatJob {
  status: "pending" | "done" | "error";
  reply?: string;
  error?: string;
}

// Short, curated blurbs for models actually worth pulling on this box —
// Ollama itself has no description field, so this is maintained by hand.
// Unknown/newly-pulled models fall back to a generic note rather than
// nothing at all.
const MODEL_DESCRIPTIONS: Record<string, string> = {
  "llama3.1:8b":
    "General-purpose text model. Fast, solid everyday reasoning and writing — this is the workhorse behind most of Saga's own local AI features (allergen scanning, grocery-match judging, Brain Dump sorting). The best default for quick back-and-forth chat.",
  "qwen3-vl:4b":
    "Vision-capable — can read an uploaded image, which llama3.1:8b can't do at all. Confirmed directly: it reasons at length internally even when asked not to, so a simple question can take 30-60+ seconds to answer. Worth it specifically when you need it to look at a picture; slower and not as sharp at pure text chat.",
};

const SHORT_DESCRIPTIONS: Record<string, string> = {
  "llama3.1:8b": "fast everyday text chat",
  "qwen3-vl:4b": "reads images, slower",
};

const GENERIC_DESCRIPTION = "No description written yet for this model — a newly-pulled model that hasn't been characterized here. Try it and see.";

// Persisted per-device (localStorage), not per-account or cross-device on
// purpose — Brandon asked for per-device history, not a synced multi-
// conversation feature. `pendingJobId` is what lets tabbing away and
// coming back actually work: the real Ollama call runs server-side
// regardless of whether this tab is open, so on reload/refocus this page
// just resumes polling for whatever job was already in flight instead of
// losing track of it.
const STORAGE_KEY = "saga-chat-state";

interface StoredState {
  model: string;
  messages: Message[];
  pendingJobId: string | null;
}

function loadState(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state: StoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private browsing / storage disabled — chat still works, just won't persist */
  }
}

export default function ChatPage() {
  const modelsQuery = useQuery({ queryKey: ["settings", "ollama-models"], queryFn: () => apiGet<string[]>("/settings/ollama-models") });
  const models = modelsQuery.data?.data ?? [];

  const initial = useRef(loadState());
  const [model, setModel] = useState<string>(initial.current?.model ?? "");
  const [messages, setMessages] = useState<Message[]>(initial.current?.messages ?? []);
  const [pendingJobId, setPendingJobId] = useState<string | null>(initial.current?.pendingJobId ?? null);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Pick a sensible default model once the real list loads — prefer the
  // fast text model over whatever order Ollama happens to list them in —
  // but only if nothing was already restored from a previous visit.
  useEffect(() => {
    if (!model && models.length > 0) setModel(models.includes("llama3.1:8b") ? "llama3.1:8b" : models[0]);
  }, [models, model]);

  useEffect(() => {
    saveState({ model, messages, pendingJobId });
  }, [model, messages, pendingJobId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingJobId]);

  // Polls whenever a job is outstanding — including immediately on page
  // load if one was already pending from before a refresh or from
  // switching away and back. This is the piece that actually satisfies
  // "let me tab away and come back": the request already finished
  // server-side while this tab wasn't looking, so the very next poll
  // just picks up the completed answer.
  const statusQuery = useQuery({
    queryKey: ["chat-status", pendingJobId],
    queryFn: () => apiGet<ChatJob>(`/chat/status/${pendingJobId}`),
    enabled: !!pendingJobId,
    refetchInterval: (query) => (query.state.data?.data?.status === "pending" ? 2000 : false),
    retry: false,
  });

  useEffect(() => {
    const job = statusQuery.data?.data;
    if (!job || job.status === "pending") return;
    if (job.status === "done") {
      setMessages((prev) => [...prev, { role: "assistant", content: job.reply ?? "" }]);
    }
    // On "error" the message list is left as-is; the error renders below
    // and the user can just try sending again.
    setPendingJobId(null);
  }, [statusQuery.data]);

  const handleSend = async () => {
    if (!input.trim() || pendingJobId) return;
    const next: Message[] = [...messages, { role: "user", content: input.trim() }];
    setMessages(next);
    setInput("");
    try {
      const result = await apiPost<{ jobId: string }>("/chat/send", { model, messages: next });
      if (result.data) setPendingJobId(result.data.jobId);
    } catch {
      // apiPost throwing here means the API itself is unreachable — surfaced
      // simply rather than trying to distinguish it from a job-level error.
      setMessages((prev) => [...prev, { role: "assistant", content: "(Couldn't reach the API to send that.)" }]);
    }
  };

  const isPending = !!pendingJobId;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Chat</h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          Talk directly to a local model running on this box. History is kept on this device only — it'll still be
          here if you tab away and come back, even mid-answer, but it won't follow you to another device.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
        <Field label="Model">
          <Select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setMessages([]);
              setPendingJobId(null);
            }}
            disabled={isPending}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {SHORT_DESCRIPTIONS[m] ? `${m} — ${SHORT_DESCRIPTIONS[m]}` : m}
              </option>
            ))}
          </Select>
        </Field>
        {model && <p className="text-xs text-slate-600 dark:text-slate-400">{MODEL_DESCRIPTIONS[model] ?? GENERIC_DESCRIPTION}</p>}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm flex flex-col h-[26rem]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && !isPending && (
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center mt-8">Say something below to start.</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-slate-800 text-white dark:bg-slate-700"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {isPending && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 italic">
                thinking… (safe to switch apps or close the tab — it'll be here when you're back)
              </div>
            </div>
          )}
          {statusQuery.data?.data?.status === "error" && (
            <p className="text-sm text-red-500 dark:text-red-400">Something went wrong: {statusQuery.data.data.error}</p>
          )}
          {statusQuery.isError && <p className="text-sm text-red-500 dark:text-red-400">Lost track of that request — try sending again.</p>}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-slate-200 dark:border-slate-700 p-3 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Textarea
              aria-label="Message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message..."
              minRows={1}
              disabled={isPending}
            />
          </div>
          <Button onClick={handleSend} disabled={isPending || !input.trim()}>
            Send
          </Button>
        </div>
      </div>

      {(messages.length > 0 || isPending) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setMessages([]);
            setPendingJobId(null);
          }}
        >
          Clear conversation
        </Button>
      )}
    </div>
  );
}
