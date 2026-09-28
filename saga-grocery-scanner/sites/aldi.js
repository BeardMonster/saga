// Direct-site scraper for Aldi — confirmed live before writing this: real
// per-item pricing as plain DOM text, no login needed to view prices, no
// bot-block encountered (unlike Harris Teeter and Food Lion, both blocked
// at the network level from this box's IP — confirmed via a real
// "Access is temporarily restricted" page citing the LXC's IP). Aldi's
// online storefront is actually Instacart-powered under the hood (product
// images/URLs point at instacart.com), which explains the SPA behavior
// below. Store selection persists via cookies for the rest of the page's
// navigations. All selectors below were read directly off the live site,
// not guessed.
//
// The site's CSS classes are content-hashed (e.g. "e-1aytrge") and NOT
// stable — every selector here anchors on real attributes (data-item-card,
// id="streetAddress", id="address-suggestion-list", role="option") or
// semantic structure (h3 for the name, screen-reader-only text for price)
// instead.

const BASE_URL = "https://www.aldi.us";

// The cookie-consent banner and the "How would you like to shop?" modal
// can both be showing at once on a fresh load — and "Accept All" renders
// twice in the DOM (a hidden duplicate alongside the real button, same
// pattern seen elsewhere on this site), so `.first()` isn't reliably the
// clickable one. Try every match instead of just one.
async function dismissCookieBanner(page) {
  const buttons = await page.getByRole("button", { name: "Accept All" }).all();
  for (const button of buttons) {
    try {
      await button.click({ timeout: 2000 });
      return;
    } catch {
      /* not the visible one, or already gone — try the next */
    }
  }
}

// Confirmed directly: after picking a store, the shopping-method modal's
// Reakit portal (a Mapbox canvas plus, sometimes, the modal's own stale
// wrapper) is left behind in the DOM with `pointer-events: auto`, even
// though it's visually gone and Escape/further clicks don't reliably clear
// it. Real shoppers never see this — it only shows up under automation
// timing — so removing the dead nodes directly is more reliable than
// guessing which synthetic event the SPA would respond to.
async function removeStrayOverlays(page) {
  await page
    .evaluate(() => {
      document.querySelectorAll(".__reakit-portal").forEach((portal) => {
        if (portal.querySelector("canvas.mapboxgl-canvas") || /how would you like to shop/i.test(portal.textContent ?? "")) {
          portal.remove();
        }
      });
      // The modal-open lock (body { overflow: hidden }) survives even
      // after its portal is gone, and an inline `overflow: hidden` on
      // body was confirmed directly to make the WHOLE body intercept
      // clicks meant for elements underneath.
      if (document.body.style.overflow === "hidden") document.body.style.overflow = "";
    })
    .catch(() => undefined);
}

// Opens the shopping-method modal, then the store-picker modal, searches by
// zip, and selects a location. When `locationHint` is given (e.g.
// "Creedmoor" for Brandon's explicitly preferred Aldi), picks the first
// result whose name/address contains it rather than just the closest one —
// Aldi's zip-closest result isn't always the store Brandon actually shops
// at. Falls back to the closest result when no hint matches. Only needs to
// run once per browser session — the selection persists via cookies.
export async function selectStore(page, zip, locationHint) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await dismissCookieBanner(page);

  await page.getByText("How would you like to shop?").waitFor({ state: "visible", timeout: 15000 });
  // Two "Change store" buttons exist (Pickup, then In-Store) — the second
  // one in DOM/visual order is In-Store's (confirmed directly; Delivery's
  // equivalent is labeled "Edit", not "Change store").
  await page.getByText("Change store").last().click({ timeout: 10000 });

  await page.getByText("Choose an In-Store location").waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: /^Near /, exact: false }).click({ timeout: 10000 });

  const addressInput = page.locator("#streetAddress");
  await addressInput.waitFor({ state: "visible", timeout: 10000 });
  await addressInput.fill(zip);

  const suggestionList = page.locator("#address-suggestion-list");
  await suggestionList.locator('[role="option"]').first().waitFor({ state: "visible", timeout: 10000 });
  await suggestionList.locator('[role="option"]').first().click();

  // The store list re-sorts by distance from the new address. Clicking a
  // list item's own button selects it immediately — no separate confirm
  // step (that only shows up via the map-marker path, not this one).
  const storeList = page.locator("li").filter({ hasText: "mi away" });
  await storeList.first().waitFor({ state: "visible", timeout: 10000 });
  const target = locationHint ? storeList.filter({ hasText: locationHint }).first() : storeList.first();
  const matched = (await target.count()) > 0 ? target : storeList.first();
  const storeName = await matched.locator("h3, h2, strong").first().textContent().catch(() => null);
  await matched.locator("button").click();

  // Confirmed directly: selecting a store from the list closes the
  // location-picker's own map/list modal, but the OUTER "How would you
  // like to shop?" modal is left behind as a STALE ghost — still showing
  // the original pre-selection store, `pointer-events: auto`, blocking
  // every later click. Its own "Confirm" button re-submits that stale
  // snapshot and silently reverts the store back to the original one —
  // confirmed directly (the header reverted to "PET 97 - Durham" after
  // clicking it). Removing the dead node is correct; confirming it is not.
  await removeStrayOverlays(page);
  return storeName?.trim() ?? null;
}

// Returns every product card on the search results page as structured
// data — real DOM text, not OCR/vision. The search box's dropdown
// suggestion must be clicked (same pattern as Flipp) — a plain Enter
// keypress or a `?q=` URL param alone does not actually run the search
// (confirmed: navigating straight to a `?q=...` URL just shows the
// homepage with an empty "Results for" heading).
export async function searchProducts(page, query) {
  await removeStrayOverlays(page);
  const searchBox = page.getByPlaceholder("Search products, recipes, and more");
  // `force: true` on both clicks below: confirmed directly that Playwright's
  // actionability check reports the search box (and later the suggestion)
  // as covered by `<body>` even though nothing is actually there
  // (document.elementsFromPoint at that exact coordinate returns only
  // body/html) — a false-positive interception, not a real blocker. A
  // forced click there was verified to actually type into the box and
  // reach the real results page.
  await searchBox.click({ timeout: 15000, force: true });
  await searchBox.fill(query);

  // The suggestion renders lowercase regardless of the query's original
  // casing (shopping-list items are stored Title Case, e.g. "Chicken
  // Breast") — confirmed directly that an exact-case match against the
  // raw query fails every time. Case-insensitive, same as Flipp's search.
  const suggestion = page.getByText(new RegExp(`^${query}$`, "i")).first();
  try {
    await suggestion.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    // Same limitation already confirmed on Flipp: the autocomplete only
    // matches Aldi's own indexed catalog terms exactly, and some phrases
    // (e.g. "Non-Dairy Yogurt") have no suggestion at all — a real "no
    // match this week" outcome, not a scraper bug.
    return [];
  }
  await suggestion.click({ force: true });

  try {
    await page.getByText(new RegExp(`Results for "${query}"`, "i")).waitFor({ state: "visible", timeout: 15000 });
  } catch {
    return []; // no results page rendered for this term
  }

  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-item-card="true"]')].filter((c) => c.getAttribute("aria-hidden") !== "true");
    return cards
      .map((card) => {
        const nameEl = card.querySelector("h3");
        const name = nameEl?.textContent?.trim() ?? null;
        // e.g. "Current price: $9.62 per package (estimated)" or "Current
        // price: $5.99" for a fixed-price item — always present.
        const priceInfo = card.querySelector("span.screen-reader-only")?.textContent?.trim() ?? null;
        // e.g. "$2.29 / lb" — only present for variable-weight items;
        // absent for fixed-price packaged goods (those rely on priceInfo).
        const unitPriceDiv = [...card.querySelectorAll("div")].find(
          (d) => d.children.length === 0 && /\$\d+\.\d{2}\s*\/\s*[a-z.]+/i.test(d.textContent ?? ""),
        );
        const href = card.querySelector('a[data-item-card-button="true"]')?.getAttribute("href");
        return {
          name,
          unitPrice: unitPriceDiv?.textContent?.trim() ?? null,
          priceInfo,
          url: href ? `https://www.aldi.us${href}` : null,
        };
      })
      .filter((p) => p.name);
  });
}
