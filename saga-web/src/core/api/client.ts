import axios, { type AxiosRequestConfig } from "axios";
import { playUiSound, type UiSound } from "../../shared/lib/celebrate";

export interface Envelope<T> {
  status: "ok" | "error";
  message: string;
  code: number;
  data: T | null;
}

export const apiClient = axios.create({
  baseURL: "/api",
});

// `sound` lets a call site EXPLICITLY declare what should play instead of
// leaving it to the default guess below — `null` means "I'm already
// celebrating this myself (see shared/lib/celebrate.ts), stay silent."
//
// This exists because guessing from the request's method/URL/body shape
// got it wrong twice for the same reason: a mutation that also calls
// celebrate() (a checklist item's completion toggle, a whole checklist's
// complete/reopen switch) sent a body shape the guesser didn't recognize as
// "this already has its own sound," so it played its own generic "save" on
// top of the real one. Chasing each new body shape by hand doesn't scale —
// every future completion-style mutation could reintroduce the same bug.
// Anywhere that already calls celebrate() for a mutation must pass
// `{ sound: null }` explicitly; nothing else needs to change.
export interface SoundOptions {
  sound?: UiSound | null;
}
type RequestConfig = AxiosRequestConfig & SoundOptions;

// The default guess for everything that does NOT explicitly opt out above.
// This part isn't the fragile half — nothing here fights against a
// component's own celebrate() call, since none of these bodies/URLs
// represent a "completion" a component separately celebrates.
const SILENT_POSTS = /(\/chat\/|\/inbox|\/scan|process-due|\/confirm|\/reevaluate|scan-allergens|\/transcribe|\/import)/;

function defaultSoundFor(method: string, url: string, data: unknown): UiSound | null {
  if (method === "post") {
    if (/\/restore$/.test(url)) return "restore";
    if (/\/make-project$/.test(url)) return "transfer";
    if (/\/inbox\/[^/]+\/confirm$/.test(url)) return "add"; // "Looks Good, Add It"
    return SILENT_POSTS.test(url) ? null : "add";
  }
  if (method === "delete") return "delete";
  if (method === "patch") {
    if (/\/reorder$/.test(url)) return "move";
    let body: Record<string, unknown> = {};
    try {
      body = typeof data === "string" ? JSON.parse(data) : {};
    } catch {
      /* not JSON */
    }
    if ("isPinned" in body) return body.isPinned ? "pin" : "unpin";
    // Moving something between lists/sections/pages.
    if ("checklistId" in body || "sectionId" in body || "noteId" in body || "projectId" in body || "page" in body) return "transfer";
    return "save";
  }
  return null;
}

// TanStack Query retries a failed GET a few times with backoff by default —
// without this, one real outage would fire the error sound 3-4 times over
// several seconds. One sound per short window is plenty to notice.
let lastErrorSoundAt = 0;
function playErrorSoundThrottled() {
  const now = Date.now();
  if (now - lastErrorSoundAt < 4000) return;
  lastErrorSoundAt = now;
  playUiSound("error");
}

apiClient.interceptors.response.use(
  (response) => {
    const config = response.config as RequestConfig;
    const sound = "sound" in config ? config.sound : defaultSoundFor((config.method ?? "get").toLowerCase(), config.url ?? "", config.data);
    if (sound) playUiSound(sound);
    return response;
  },
  (error) => {
    // A request the page itself cancelled (e.g. a superseded search-as-you-type
    // query) isn't a failure worth a sound — only a real failed save/load is.
    if (!axios.isCancel(error)) playErrorSoundThrottled();
    return Promise.reject(error);
  },
);
export async function apiGet<T>(path: string): Promise<Envelope<T>> {
  const response = await apiClient.get<Envelope<T>>(path);
  return response.data;
}

export async function apiPost<T>(path: string, body?: unknown, opts?: SoundOptions): Promise<Envelope<T>> {
  const response = await apiClient.post<Envelope<T>>(path, body, opts as RequestConfig);
  return response.data;
}

export async function apiPatch<T>(path: string, body?: unknown, opts?: SoundOptions): Promise<Envelope<T>> {
  const response = await apiClient.patch<Envelope<T>>(path, body, opts as RequestConfig);
  return response.data;
}

export async function apiDelete<T>(path: string, opts?: SoundOptions): Promise<Envelope<T>> {
  const response = await apiClient.delete<Envelope<T>>(path, opts as RequestConfig);
  return response.data;
}

// For multipart uploads (inbox photos/voice/video) — the others assume a
// JSON body, which doesn't fit FormData.
export async function apiUpload<T>(path: string, files: File[]): Promise<Envelope<T>> {
  const form = new FormData();
  for (const file of files) form.append("file", file);
  const response = await apiClient.post<Envelope<T>>(path, form, { headers: { "Content-Type": "multipart/form-data" } });
  return response.data;
}
