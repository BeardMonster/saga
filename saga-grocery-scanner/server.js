// Persistent service — this replaces needing to run a docker command by
// hand. Exposes a trigger endpoint saga-api proxies to (so the Grocery
// Deals page has a real "Scan now" button), plus its own weekly timer so
// it keeps itself fresh even if nobody ever clicks the button.
import { createServer } from "node:http";
import { runScan } from "./lib.js";

const PORT = process.env.PORT ?? 8200;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

let state = { running: false, lastRunAt: null, lastSummary: null, lastError: null, log: [] };

async function triggerScan() {
  if (state.running) return false;
  state.running = true;
  state.log = [];
  const onLog = (line) => {
    console.log(line);
    state.log.push(line);
    if (state.log.length > 200) state.log.shift();
  };
  try {
    const summary = await runScan(onLog);
    state = { ...state, running: false, lastRunAt: new Date().toISOString(), lastSummary: summary, lastError: null };
  } catch (error) {
    console.error("Scan failed:", error);
    state = { ...state, running: false, lastRunAt: new Date().toISOString(), lastError: error.message };
  }
  return true;
}

const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "POST" && req.url === "/scan") {
    const started = !state.running;
    if (started) triggerScan(); // fire-and-forget — caller polls /status
    res.writeHead(started ? 202 : 409);
    res.end(JSON.stringify({ started, running: true }));
    return;
  }

  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200);
    res.end(JSON.stringify(state));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`saga-grocery-scanner listening on ${PORT}`);
});

// Same cadence as the old run-weekly.sh loop, just inside a long-running
// process instead of a shell wrapper now that this is a real service.
setInterval(triggerScan, WEEK_MS);
