// Direct-site scraper for Lidl — confirmed live before writing this: real
// per-item pricing, no login needed, no bot-block encountered (unlike
// Harris Teeter and Food Lion, both blocked at the network level from this
// box). Store selection persists via cookies for the rest of the page's
// navigations. All selectors below were read directly off the live site,
// not guessed.
//
// Genuinely better data source than the other direct sites: each product
// card carries a `data-gridbox-impression` attribute — a URL-encoded JSON
// blob with a clean `name` and a real numeric `price`, no text-regex
// parsing needed for the base price at all. A real per-unit rate ("$2.19
// per lb.") is separate, plain text elsewhere on the same card.
//
// Confirmed directly: navigating straight to the search results URL
// (`/q/search?q=...`) shows the right heading/count but the product grid
// never actually loads (stuck on skeleton placeholders indefinitely) —
// same class of SPA quirk as Aldi's `?q=` URL. The search box + its
// "Start Searching" button have to be used from an already-loaded page.

const BASE_URL = "https://www.lidl.com";

export async function selectStore(page, zip, locationHint) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  // The OneTrust consent banner renders on a delay, not immediately at
  // goto — confirmed directly that clicking too early misses it, and its
  // dark backdrop then blocks every later click (including the store
  // finder button) until dismissed. Wait for it to actually show up
  // before trying to dismiss it; a short timeout here just means the
  // banner genuinely wasn't shown this time (already consented, etc.).
  try {
    await page.getByRole("button", { name: "Agree All" }).first().waitFor({ state: "visible", timeout: 8000 });
  } catch {
    /* no consent banner shown */
  }
  const agreeButtons = await page.getByRole("button", { name: "Agree All" }).all();
  for (const button of agreeButtons) {
    try {
      await button.click({ timeout: 2000 });
      break;
    } catch {
      /* not the visible one, or already gone — try the next */
    }
  }

  // Confirmed directly on a real fresh page load: OneTrust's Preference
  // Center dark backdrop (`.onetrust-pc-dark-filter`) can render as visible
  // even while the Preference Center panel itself stays hidden — a race in
  // Lidl's own consent widget, not tied to which button gets clicked.
  // Clicking "Agree All" above usually clears it within about a second,
  // but on a slower run it can still be mid-transition and block every
  // later click (this is what caused the store-finder button to time out).
  // Same fix as Aldi's leftover-overlay bug earlier — force-remove the dead
  // node directly rather than trust the site's own script to clear it in
  // time.
  await page
    .evaluate(() => {
      document.querySelectorAll(".onetrust-pc-dark-filter").forEach((el) => el.remove());
    })
    .catch(() => undefined);

  await page.locator(".leaflet-slider-store-finder-button").click({ timeout: 15000 });

  const zipInput = page.locator('input[placeholder="ZIP code or city"]');
  await zipInput.waitFor({ state: "visible", timeout: 10000 });

  // The suggestion <li> renders immediately as an empty placeholder — its
  // real address text only appears once a debounced geocoding call
  // resolves, and confirmed directly that how long that takes varies run
  // to run (sometimes ~5s, sometimes long enough to blow past a 20s
  // wait entirely). Re-typing resets the debounce rather than just
  // waiting longer on a request that may already have stalled.
  const suggestion = page.locator("li.search-field__flyout-item", { hasText: zip }).first();
  let suggestionReady = false;
  for (let attempt = 0; attempt < 3 && !suggestionReady; attempt++) {
    await zipInput.fill("");
    await zipInput.fill(zip);
    try {
      await suggestion.waitFor({ state: "visible", timeout: 15000 });
      suggestionReady = true;
    } catch {
      /* try again */
    }
  }
  if (!suggestionReady) throw new Error(`Lidl store search never returned a suggestion for zip ${zip}`);
  await suggestion.click();

  const favoriteButtons = page.locator('button[aria-label*="Set as favorite store"]');
  await favoriteButtons.first().waitFor({ state: "visible", timeout: 10000 });
  // The address lives only in the aria-label (an icon button, no visible
  // text), so matching by locationHint means reading attributes directly
  // rather than Playwright's usual text-based `filter`.
  let chosen = favoriteButtons.first();
  if (locationHint) {
    const all = await favoriteButtons.all();
    for (const button of all) {
      const label = await button.getAttribute("aria-label");
      if (label?.includes(locationHint)) {
        chosen = button;
        break;
      }
    }
  }
  const storeName = (await chosen.getAttribute("aria-label"))?.replace(/^Set as favorite store\s*/i, "") ?? null;
  await chosen.click();

  const closeButtons = await page.getByRole("button", { name: "Close the store search" }).all();
  for (const button of closeButtons) {
    try {
      await button.click({ timeout: 2000 });
      break;
    } catch {
      /* not the visible one */
    }
  }

  // Confirmed directly (via real getBoundingClientRect + scrollY
  // readings, not a guess): the page is left scrolled to wherever it was
  // when the store-search panel was open (scrollY in the thousands), and
  // the header/search bar — which should be `position: sticky` — isn't
  // actually sticking in this context, leaving it rendered far above the
  // viewport (a negative `top`). Scrolling back to the top directly fixes
  // the real cause instead of fighting Playwright's viewport checks.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page
    .locator('input[type="search"]')
    .first()
    .waitFor({ state: "visible", timeout: 20000 })
    .catch(() => undefined);

  return storeName;
}

export async function searchProducts(page, query) {
  // Same scroll-position issue as selectStore's ending — a plain JS scroll
  // is cheap and can't "fail fast" the way a Playwright actionability
  // check can, so it's worth doing defensively before every search rather
  // than only once.
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
  // Confirmed live (real test run) that the same OneTrust dark-backdrop
  // race from selectStore isn't a one-time thing tied to the initial page
  // load — it recurred here too, after the store-search panel closed and
  // the page settled back on the homepage, blocking the search input click
  // the exact same way. Not worth guessing whether it's tied to the panel
  // close specifically vs. some other in-page navigation — just clear it
  // defensively every time, same as the scroll-position fix above.
  await page
    .evaluate(() => {
      document.querySelectorAll(".onetrust-pc-dark-filter").forEach((el) => el.remove());
    })
    .catch(() => undefined);
  const searchInput = page.locator('input[type="search"]').first();
  // Deliberately NOT force:true here — confirmed directly that force
  // skips Playwright's actionability retry loop entirely (it has nothing
  // left to wait on once checks are bypassed), so it fires once against
  // whatever the element's geometry happens to be at that instant. A
  // plain click keeps retrying against real geometry until it's valid,
  // which is what actually rides out the page's post-navigation reflow.
  await searchInput.click({ timeout: 20000 });
  await searchInput.fill(query);
  await page.getByRole("button", { name: "Start Searching" }).click({ timeout: 20000 });

  try {
    await page.locator("[data-gridbox-impression]").first().waitFor({ state: "visible", timeout: 15000 });
  } catch {
    return []; // no results for this term, or the grid didn't render
  }

  return page.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-gridbox-impression]")];
    return cards
      .map((card) => {
        let parsed;
        try {
          parsed = JSON.parse(decodeURIComponent(card.getAttribute("data-gridbox-impression")));
        } catch {
          return null;
        }
        const cardText = card.parentElement?.textContent ?? "";
        // e.g. "$ 2.19 per lb." — only present for variable-weight items.
        const unitMatch = cardText.match(/\$\s*\d+\.\d{2}\s*per\s*[a-z.]+/i);
        // A real product-detail link, e.g. "/p/boneless-skinless-chicken-
        // breast-family-pack/p11247136#...tracking params". Stripped of the
        // tracking fragment for a clean, stable link.
        const href = card.parentElement?.querySelector("a")?.getAttribute("href")?.split("#")[0];
        return {
          name: parsed.name ?? null,
          unitPrice: unitMatch?.[0]?.replace(/\s+/g, " ") ?? null,
          // The JSON's own `price` is a clean number — format back to a
          // "$X.XX" string so it flows through the same parsePriceText
          // path as every other direct-site store, rather than special-casing
          // a numeric field just for this one site.
          priceInfo: typeof parsed.price === "number" ? `$${parsed.price.toFixed(2)}` : null,
          url: href ? `https://www.lidl.com${href}` : null,
        };
      })
      .filter((p) => p && p.name);
  });
}
