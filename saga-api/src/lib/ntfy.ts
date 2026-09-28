const NTFY_URL = process.env.NTFY_URL ?? "http://host.docker.internal:8090";
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "";

export async function sendReminder(title: string, message: string) {
  if (!NTFY_TOPIC) {
    console.warn("NTFY_TOPIC not set — skipping reminder send:", title);
    return;
  }

  // HTTP header values are Latin-1/ByteString only — fetch throws
  // (`Cannot convert argument to a ByteString`) on anything outside that
  // range, and emoji are a natural thing to want in a title. Stripped here
  // instead of trusting every call site to remember not to use one.
  const safeTitle = title.replace(/[^\x00-\xFF]/g, "").trim() || "Saga";

  await fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
    method: "POST",
    headers: { Title: safeTitle, Priority: "default" },
    body: message,
  });
}
