// Weekly grocery-deal scanner core logic. Confirmed live (manually, in a
// real browser session) before writing any of this:
//   - Flipp (flipp.com) aggregates Lowe's Foods, Harris Teeter, Aldi, Lidl,
//     Food Lion, Walmart, and Publix for zip 27615 under one consistent UI.
//   - A search from Flipp's global weekly-ads page returns matching items
//     across EVERY participating store at once (confirmed: searching
//     "chicken breast" surfaced Harris Teeter, Food Lion, Lowe's Foods,
//     Publix, BJ's, and Sprouts results on one results page) — so this
//     only needs one search per shopping-list item, not one per
//     store-per-item.
//   - Every price is rendered as an image/canvas — confirmed zero dollar
//     amounts exist anywhere in the page's accessibility tree — so a
//     vision model has to actually read each item card, same approach
//     already proven the same night for recipe card photos.
//   - The search box's dropdown suggestion must be CLICKED (by its text,
//     it's a plain non-link element) — pressing Enter alone does nothing.
//
// "Three Hermanos International" (source: manual in the DB) is skipped —
// it's a small independent market, essentially certain not to be on Flipp,
// and needs its own checking approach that hasn't been built yet.

import { chromium } from "playwright";
import * as harrisTeeter from "./sites/harris-teeter.js";
import * as foodLion from "./sites/food-lion.js";
import * as aldi from "./sites/aldi.js";
import * as lidl from "./sites/lidl.js";
import * as lowesFoods from "./sites/lowes-foods.js";
import * as walmart from "./sites/walmart.js";

const SAGA_API_URL = process.env.SAGA_API_URL ?? "http://host.docker.internal:3000";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://host.docker.internal:11434";
const VISION_MODEL = process.env.VISION_MODEL ?? "qwen3-vl:4b";
const TEXT_MODEL = process.env.TEXT_MODEL ?? "llama3.1:8b";
const POSTAL_CODE = process.env.POSTAL_CODE ?? "27615";
const DEBUG_SCREENSHOTS = Boolean(process.env.DEBUG_SCREENSHOTS);

// Direct-site modules, keyed by externalConfig.site. Built one store at a
// time per Brandon's explicit call — more get added here as each one gets
// its own scraper written and verified.
//
// Harris Teeter, Food Lion, AND Walmart are built but sit unused (source
// stays "flipp") — all three show real bot-detection interference, though
// via different mechanisms: Harris Teeter resets the HTTP2 stream even on
// a bare curl (Akamai, network/TLS-level); Food Lion serves a real "Access
// is temporarily restricted" page naming this box's actual home IP
// (confirmed NOT a datacenter-reputation issue — Brandon corrected this
// directly); Walmart's page loads and LOOKS normal but its buttons never
// actually respond to clicks — confirmed via console output that
// PerimeterX's bot-check script (`px/.../init.js`) triggers React
// hydration errors (#418/#425) and blocked API calls (412s), leaving
// handlers unattached. All three are candidates for a real stealth-browser
// test (not yet done) rather than the plain Chromium/Chrome used so far.
// Aldi, Lidl, Lowe's Foods, and Publix all load and work cleanly, so the
// direct-site strategy stays viable for the rest of the list.
const DIRECT_SITE_MODULES = { "harris-teeter": harrisTeeter, "food-lion": foodLion, aldi, lidl, "lowes-foods": lowesFoods, walmart };

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.data;
}

// Same defensive JSON extraction as saga-api's ollama.ts — a fenced
// ```json block or a bare object, and reasoning models sometimes put the
// real answer in `thinking` instead of `response`.
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1] : text);
}

async function runOllamaText(prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: TEXT_MODEL, prompt, format: "json", stream: false, think: false, options: { num_ctx: 8192 } }),
  });
  if (!res.ok) throw new Error(`Ollama request failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  return extractJson(body.response || body.thinking || "");
}

// Parses a real price string straight off the page ("$2.59/lb", "$6.99
// each") into a number + unit — deterministic regex, not the model's job.
// Direct-site prices are real text, unlike Flipp's rendered-image prices,
// so there's no reason to trust a model's arithmetic over just reading it.
function parsePriceText(text) {
  if (!text) return null;
  const match = text.match(/\$(\d+\.\d{2})\s*\/?\s*([a-zA-Z][a-zA-Z.]*)?/);
  if (!match) return null;
  return { price: Number(match[1]), unit: match[2]?.replace(/\.$/, "") || null };
}

// The model's only job is judging which (if any) candidate is a genuine
// match — same category-mismatch lesson learned from the Flipp/deli-meat
// incident, just applied to real text instead of an image. It never
// invents a price; that's parsed deterministically from whichever
// candidate it picks.
// Plant-based keywords that make a product genuinely "non-dairy" — used as
// a deterministic, code-level filter (not left to the model) any time a
// shopping-list item explicitly asks for a non-dairy product. Confirmed
// directly, twice, with an increasingly explicit prompt, that llama3.1:8b
// reliably picks an ordinary dairy yogurt ("light nonfat yogurt") for
// "Non-Dairy Yogurt" anyway — this isn't a wording problem to keep
// iterating on, it's a real reliability gap in a small local model for a
// judgment call with real health-safety stakes (Brandon's dairy allergy).
// A hard exclusion like this belongs in code, not in a prompt hoping the
// model applies it correctly.
const NON_DAIRY_KEYWORDS = ["soy", "almond", "oat", "coconut", "cashew", "plant-based", "plant based", "dairy-free", "dairy free", "non-dairy", "nondairy", "vegan"];

function requiresNonDairy(itemName) {
  return /non-?dairy/i.test(itemName);
}

// Same reasoning as the dairy filter above, applied to fresh-vs-frozen —
// Brandon confirmed directly that "Broccoli" and "Asparagus" both mean the
// fresh produce-section version, not frozen, and a plain staple name with
// no "frozen" in it should default to meaning fresh. This is a blanket
// rule across every item (not just these two) since nothing on the list
// currently wants frozen, and it directly prevents the same class of
// mismatch already seen in real scans (frozen blueberries matched for a
// plain "Blueberries" search). Deterministic, not left to the model, for
// the same reason as the dairy case: this is a real preference to get
// right every time, not a close judgment call.
function wantsFrozen(itemName) {
  return /\bfrozen\b/i.test(itemName);
}

async function pickBestMatch(candidates, itemName) {
  let usable = candidates.filter((c) => c.unitPrice || c.priceInfo).slice(0, 25);
  if (requiresNonDairy(itemName)) {
    usable = usable.filter((c) => NON_DAIRY_KEYWORDS.some((kw) => c.name.toLowerCase().includes(kw)));
  }
  if (!wantsFrozen(itemName)) {
    usable = usable.filter((c) => !/\bfrozen\b/i.test(c.name));
  }
  if (usable.length === 0) return null;

  const list = usable.map((c, i) => `${i}: ${c.name} — ${c.unitPrice || c.priceInfo}`).join("\n");
  const prompt =
    `Pick the single best genuine match for the grocery shopping-list item "${itemName}" from this list of real ` +
    `search results at a grocery store's website. Judge by the actual product name — a raw/fresh ingredient search ` +
    `should NOT match a deli-sliced/lunch-meat, canned, fully-cooked, or otherwise processed product even if the ` +
    `words overlap. Prefer a plain, generic version over a specialty/prepared one when several genuine matches ` +
    `exist, and prefer the better price among equally-generic options.\n\n${list}\n\n` +
    `Respond with ONLY valid JSON of the shape { "index": number|null } — null if none of these are a real match.`;

  const result = await runOllamaText(prompt);
  return typeof result.index === "number" && usable[result.index] ? usable[result.index] : null;
}

async function readItemCardWithVision(screenshotBase64, shoppingListItemName) {
  // Confirmed a real mismatch class directly: searching "Chicken Breast"
  // matched a Food Lion deli-sliced lunch meat product ("Freshly Sliced,"
  // $6.99/lb) — a genuinely correct price read, but the wrong category of
  // product entirely (deli meat, not raw poultry for cooking). The price
  // extraction wasn't the bug; nothing was checking whether the matched
  // product was actually the right KIND of thing. Explicitly calling that
  // out here so a future mismatch gets rejected instead of recorded.
  const prompt =
    `You are looking at a screenshot from a grocery store's weekly ad website. It should show one specific product ` +
    `card/modal matching the shopping-list item "${shoppingListItemName}" — a product name, a price, and usually a ` +
    `unit (per lb, per each, etc.) and a "valid" date range.\n\n` +
    `Read the actual product name and description carefully and judge whether it's a genuine match for ` +
    `"${shoppingListItemName}" as a raw/fresh grocery ingredient — not just a keyword overlap. For example, if the ` +
    `shopping-list item is a raw ingredient like a cut of meat or fresh produce, a deli-sliced/lunch-meat, ` +
    `pre-cooked, canned, or otherwise processed product with the same words in its name is NOT a real match, even ` +
    `if the price is clearly legible — set found:false for a mismatch like that rather than reporting an unrelated price.\n\n` +
    `If no real product/price is visible at all (e.g. the page didn't load, or there's just a generic page with no ` +
    `price shown), also say so honestly rather than guessing.\n\n` +
    `Respond with ONLY valid JSON of the shape: { "found": boolean, "productName": string|null, "price": number|null, ` +
    `"unit": string|null, "validFrom": string|null, "validTo": string|null } — dates as YYYY-MM-DD if shown, else null.`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VISION_MODEL,
      prompt,
      images: [screenshotBase64],
      format: "json",
      stream: false,
      think: false,
      options: { num_ctx: 8192 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama request failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  return extractJson(body.response || body.thinking || "");
}

async function dismissCookieBanner(page) {
  try {
    await page.getByRole("button", { name: /accept all/i }).first().click({ timeout: 4000 });
  } catch {
    /* no consent banner shown, or already dismissed — fine either way */
  }
}

// One search covers every store at once — returns a map of flippSlug ->
// item detail URL, one per store that actually has a matching result.
async function searchAllStores(page, itemName) {
  await page.goto(`https://flipp.com/en-us/weekly_ads?postal_code=${POSTAL_CODE}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await dismissCookieBanner(page);

  const searchBox = page.locator('input[type="search"]').first();
  await searchBox.click({ timeout: 10000 });
  await searchBox.fill(itemName);

  // The dropdown suggestion is the typed term itself, rendered as a plain
  // (non-link) element — click it by its text to actually execute the
  // search. Pressing Enter does nothing (confirmed).
  const suggestion = page.getByText(new RegExp(`^${itemName}$`, "i")).first();
  await suggestion.waitFor({ state: "visible", timeout: 5000 });
  await suggestion.click();

  // The results page is a client-rendered SPA — domcontentloaded fires
  // before the actual item results are fetched/rendered (confirmed: an
  // earlier version of this script using domcontentloaded alone found zero
  // links for searches that manually, in a real browser, clearly returned
  // several). Wait for a real result link instead of a load-state event.
  await page.locator('a[href*="/item/"]').first().waitFor({ state: "visible", timeout: 10000 });
  const links = await page.locator('a[href*="/item/"]').evaluateAll((els) => els.map((el) => el.getAttribute("href")));

  const byStore = new Map();
  for (const href of links) {
    if (!href) continue;
    const match = href.match(/\/item\/\d+-([a-z0-9-]+?)(?:-weekly-ad|-smart-saver)?$/);
    const slug = match?.[1];
    if (slug && !byStore.has(slug)) {
      byStore.set(slug, href.startsWith("http") ? href : `https://flipp.com${href}`);
    }
  }
  return byStore;
}

async function readItemCard(page, itemUrl) {
  await page.goto(itemUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  let screenshotBuffer;
  try {
    const dialog = page.locator('[role="dialog"]').first();
    await dialog.waitFor({ state: "visible", timeout: 6000 });
    screenshotBuffer = await dialog.screenshot();
  } catch {
    screenshotBuffer = await page.screenshot();
  }
  return screenshotBuffer;
}

async function recordDeal(item, store, { name, price, unitPrice, unit, validFrom, validTo, sourceUrl }) {
  await fetchJson(`${SAGA_API_URL}/grocery/deals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shoppingListItemId: item.id,
      storeId: store.id,
      matchedProductName: name,
      price,
      unitPrice: unitPrice ?? undefined,
      unit: unit ?? undefined,
      validFrom: validFrom ?? undefined,
      validTo: validTo ?? undefined,
      sourceUrl: sourceUrl ?? undefined,
    }),
  });
}

// Surfaces something Brandon needs to look at — he's explicit that he
// isn't watching scan output live, so this has to reach him proactively
// rather than just sitting in a log line. Failures here (e.g. saga-api
// itself unreachable) are swallowed — an alert is a nice-to-have on top of
// the run, not something that should crash the scan.
async function reportAlert(source, message, storeId) {
  try {
    await fetchJson(`${SAGA_API_URL}/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, message, storeId }),
    });
  } catch (error) {
    console.error("Couldn't report alert:", error.message);
  }
}

// Flipp covers everything on this week's sale circular in one search per
// item, across every participating store at once — but only what's on
// sale, rendered as an image needing a vision model to read.
async function runFlippScan(page, flippStores, items, onLog, counts) {
  const storesBySlug = new Map(flippStores.map((s) => [s.flippSlug, s]));
  onLog(`Flipp: scanning ${items.length} item(s) across ${flippStores.length} store(s)…`);

  for (const item of items) {
    onLog(`Item: ${item.name}`);
    let matchesBySlug;
    try {
      matchesBySlug = await searchAllStores(page, item.name);
    } catch (error) {
      // Most often this means Flipp's own catalog just doesn't have a
      // matching indexed item for this term this week (confirmed
      // directly — "asparagus" showed no autocomplete suggestion at all
      // despite "chicken breast" and "broccoli" working fine) rather
      // than a real failure. Logged plainly either way.
      onLog(`  [not found] no matching item in this week's Flipp catalog (or: ${error.message})`);
      counts.notFound++;
      if (DEBUG_SCREENSHOTS) await page.screenshot({ path: `/app/debug-search-${item.name.replace(/\s+/g, "_")}.png` }).catch(() => undefined);
      continue;
    }

    for (const [slug, itemUrl] of matchesBySlug) {
      const store = storesBySlug.get(slug);
      if (!store) continue; // a store Flipp knows about but we don't track (e.g. BJ's, Sprouts)

      try {
        const screenshot = await readItemCard(page, itemUrl);
        const extracted = await readItemCardWithVision(screenshot.toString("base64"), item.name);
        if (!extracted.found || extracted.price == null) {
          onLog(`  [skip] ${store.name}: not a real match for this item`);
          continue;
        }
        // Deterministic guard, not left to the vision model's judgment —
        // same reasoning as pickBestMatch's NON_DAIRY_KEYWORDS filter for
        // direct-site stores. A dairy product is never an acceptable
        // "match" for a non-dairy search, full stop.
        if (requiresNonDairy(item.name) && !NON_DAIRY_KEYWORDS.some((kw) => (extracted.productName ?? "").toLowerCase().includes(kw))) {
          onLog(`  [skip] ${store.name}: "${extracted.productName}" isn't confirmed non-dairy — rejecting rather than risk it`);
          continue;
        }
        if (!wantsFrozen(item.name) && /\bfrozen\b/i.test(extracted.productName ?? "")) {
          onLog(`  [skip] ${store.name}: "${extracted.productName}" is frozen, not fresh — rejecting`);
          continue;
        }
        await recordDeal(item, store, {
          name: extracted.productName ?? item.name,
          price: extracted.price,
          unit: extracted.unit,
          validFrom: extracted.validFrom,
          validTo: extracted.validTo,
          sourceUrl: itemUrl,
        });
        counts.recorded++;
        onLog(`  [ok] ${store.name}: ${extracted.productName} — $${extracted.price} ${extracted.unit ?? ""}`);
      } catch (error) {
        onLog(`  [error] ${store.name}: ${error.message}`);
        counts.errors++;
        if (DEBUG_SCREENSHOTS) await page.screenshot({ path: `/app/debug-${slug}-${item.name.replace(/\s+/g, "_")}.png` }).catch(() => undefined);
      }
    }
  }
}

// Direct-site stores: real per-item pricing (not just this week's sale
// highlights), plain text (no vision model), but one search per
// store-per-item since each site is its own integration, plus a one-time
// store-selection step per store per scan.
//
// Also watches for signs that a site's own page structure changed under
// us — Brandon only checks in on this weekly, so a selector silently
// matching nothing needs to reach him proactively (an alert + push
// notification), not just sit in a log he won't read. A single item with
// no match is normal weekly catalog variance (see Flipp's identical
// behavior above); a whole store coming back with zero matches across
// every item on the list is a much stronger, unlikely-by-chance signal
// that something structural broke rather than just bad luck this week.
async function runDirectScan(page, directStores, items, onLog, counts) {
  for (const store of directStores) {
    const site = DIRECT_SITE_MODULES[store.externalConfig?.site];
    if (!site) {
      onLog(`  [skip] ${store.name}: no direct-site scraper built for this store yet`);
      continue;
    }

    const zip = store.externalConfig?.zip ?? POSTAL_CODE;
    let selectedStoreName;
    try {
      selectedStoreName = await site.selectStore(page, zip, store.externalConfig?.locationHint);
      onLog(`${store.name}: pinned to "${selectedStoreName ?? "unknown store"}" near ${zip}`);
    } catch (error) {
      onLog(`  [error] ${store.name}: couldn't select a store — ${error.message}`);
      counts.errors++;
      await reportAlert(
        "grocery_scanner",
        `${store.name}: couldn't select a store this run (${error.message}). The site's store-picker flow may have changed.`,
        store.id,
      );
      continue;
    }

    let storeRecorded = 0;
    for (const item of items) {
      try {
        const candidates = await site.searchProducts(page, item.name);
        if (candidates.length === 0) {
          onLog(`  [not found] ${item.name}: no results on ${store.name}'s site`);
          counts.notFound++;
          continue;
        }
        const best = await pickBestMatch(candidates, item.name);
        if (!best) {
          onLog(`  [skip] ${item.name}: no genuine match among ${candidates.length} result(s)`);
          continue;
        }
        // Capture both when available: the real price for the specific
        // package (what Brandon would actually pay) and the normalized
        // per-unit rate (for comparing package sizes across stores) —
        // Brandon asked for both to be shown, not just whichever one
        // parsePriceText happened to prefer.
        const unitParsed = parsePriceText(best.unitPrice);
        const totalParsed = parsePriceText(best.priceInfo);
        const primary = totalParsed ?? unitParsed;
        if (!primary) {
          onLog(`  [skip] ${item.name}: matched "${best.name}" but couldn't parse a price from it`);
          continue;
        }
        const hasDistinctUnitPrice = Boolean(unitParsed && totalParsed && unitParsed.price !== totalParsed.price);
        await recordDeal(item, store, {
          name: best.name,
          price: primary.price,
          unitPrice: hasDistinctUnitPrice ? unitParsed.price : undefined,
          unit: hasDistinctUnitPrice ? unitParsed.unit : (primary.unit ?? undefined),
          sourceUrl: best.url ?? undefined,
        });
        counts.recorded++;
        storeRecorded++;
        onLog(
          `  [ok] ${item.name} @ ${store.name}: ${best.name} — $${primary.price}` +
            (hasDistinctUnitPrice ? ` ($${unitParsed.price}/${unitParsed.unit})` : primary.unit ? `/${primary.unit}` : ""),
        );
      } catch (error) {
        onLog(`  [error] ${item.name} @ ${store.name}: ${error.message}`);
        counts.errors++;
      }
    }

    if (items.length > 0 && storeRecorded === 0) {
      onLog(`  [flagged] ${store.name}: matched zero of ${items.length} item(s) this run — flagging for review`);
      await reportAlert(
        "grocery_scanner",
        `${store.name} matched zero of ${items.length} shopping-list items this run. Either a genuinely bad week, or the site's page structure changed and the scraper needs updating — worth a look.`,
        store.id,
      );
    }
  }
}

// Runs one full scan pass. Returns a summary object rather than just
// logging, so an HTTP caller (server.js) can report back what happened.
export async function runScan(onLog = console.log) {
  const [allStores, items] = await Promise.all([
    fetchJson(`${SAGA_API_URL}/grocery/stores`),
    fetchJson(`${SAGA_API_URL}/grocery/shopping-list`),
  ]);
  const flippStores = allStores.filter((s) => s.source === "flipp" && s.flippSlug);
  const directStores = allStores.filter((s) => s.source === "direct");

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const counts = { recorded: 0, notFound: 0, errors: 0 };

  try {
    if (flippStores.length > 0) await runFlippScan(page, flippStores, items, onLog, counts);
    if (directStores.length > 0) await runDirectScan(page, directStores, items, onLog, counts);
  } finally {
    await browser.close();
  }

  const summary = { ...counts, itemsScanned: items.length };
  onLog(`Scan complete. ${counts.recorded} deal(s) recorded, ${counts.notFound} item(s) not found, ${counts.errors} error(s).`);
  return summary;
}
