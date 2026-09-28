// One-off CLI runner, kept for manual debugging — e.g.
// `docker run --rm saga-grocery-scanner node scan.js`. Normal operation
// goes through server.js's /scan endpoint instead, triggered from the
// Grocery Deals page or its own weekly timer.
import { runScan } from "./lib.js";

runScan().catch((error) => {
  console.error("Scan failed:", error);
  process.exit(1);
});
