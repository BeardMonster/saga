const NTFY_URL = process.env.NTFY_URL ?? "http://host.docker.internal:8090";
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "";
// Where the PHONE can reach this API (e.g. the Tailscale name/IP) — only used
// to build the Done/Snooze buttons on a reminder notification, since ntfy's
// "http" actions are executed by the ntfy app on the phone, not by this
// server. Unset = reminders still send, just without the buttons (Done and
// Snooze are always available in the Saga app itself).
const PUBLIC_API_URL = (process.env.SAGA_PUBLIC_URL ?? "").replace(/\/$/, "");

export interface SendOptions {
  // When set (and SAGA_PUBLIC_URL is configured), the notification carries
  // Done / Snooze buttons that call back into the API for this instance.
  instanceId?: string;
  // A daily task's reminder: carries a single Done button that checks that
  // task off for today.
  dailyTaskId?: string;
}

// ntfy "Actions" header: `http, <label>, <url>, method=POST, clear=true`
// separated by `;`. clear=true dismisses the notification once tapped.
function reminderActions(options: SendOptions): string | undefined {
  if (!PUBLIC_API_URL) return undefined;
  if (options.dailyTaskId) {
    return `http, Done, ${PUBLIC_API_URL}/api/daily-tasks/${options.dailyTaskId}/complete, method=POST, clear=true`;
  }
  if (!options.instanceId) return undefined;
  const base = `${PUBLIC_API_URL}/api/reminders/instances/${options.instanceId}`;
  return [
    `http, Done, ${base}/done, method=POST, clear=true`,
    `http, Snooze 1h, ${base}/snooze?minutes=60, method=POST, clear=true`,
    `http, Tomorrow, ${base}/snooze?tomorrow=1, method=POST, clear=true`,
  ].join("; ");
}

export async function sendReminder(title: string, message: string, options: SendOptions = {}) {
  if (!NTFY_TOPIC) {
    console.warn("NTFY_TOPIC not set — skipping reminder send:", title);
    return;
  }

  // HTTP header values are Latin-1/ByteString only — fetch throws
  // (`Cannot convert argument to a ByteString`) on anything outside that
  // range, and emoji are a natural thing to want in a title. Stripped here
  // instead of trusting every call site to remember not to use one.
  const safeTitle = title.replace(/[^\x00-\xFF]/g, "").trim() || "Saga";

  const headers: Record<string, string> = { Title: safeTitle, Priority: "default" };
  const actions = reminderActions(options);
  if (actions) headers.Actions = actions;

  await fetch(`${NTFY_URL}/${NTFY_TOPIC}`, { method: "POST", headers, body: message });
}
