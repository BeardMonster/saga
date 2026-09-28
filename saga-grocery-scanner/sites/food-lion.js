// Direct-site scraper for Food Lion — confirmed live before writing this:
// real per-item pricing as plain DOM text, no login needed to view prices,
// no Akamai-style block encountered (unlike Harris Teeter). Store selection
// persists via cookies for the rest of the page's navigations. All
// selectors below were read directly off the live site, not guessed.

const BASE_URL = "https://foodlion.com";

// Opens the shopping-method modal, then the store-picker modal, searches by
// zip, and selects the closest result (the site sorts by distance). Only
// needs to run once per browser session — the selection persists via
// cookies for the rest of the page's navigations.
export async function selectStore(page, zip) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  await page.locator("button.robot-shopping-mode-type").click({ timeout: 15000 });
  await page.getByText("Change", { exact: true }).click({ timeout: 10000 });

  const zipInput = page.locator("#search-zip-code");
  await zipInput.waitFor({ state: "visible", timeout: 10000 });
  await zipInput.fill(zip);
  await page.locator("#search-location").click();

  const firstResult = page.locator(".pdl-location_select-btn").first();
  await firstResult.waitFor({ state: "visible", timeout: 10000 });
  // The address text lives in the same result block as the button, a few
  // levels up — grab it before clicking, since the modal closes after.
  const storeName = await firstResult
    .locator("xpath=ancestor::*[self::li or self::div][1]")
    .textContent()
    .catch(() => null);
  await firstResult.click();

  return storeName?.trim() ?? null;
}

// Returns every product card on the search results page as structured
// data — real DOM text, not OCR/vision.
export async function searchProducts(page, query) {
  await page.goto(`${BASE_URL}/product-search/${encodeURIComponent(query)}?searchRef=&semanticSearch=false`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  try {
    await page.locator("li.product-grid-cell").first().waitFor({ state: "visible", timeout: 15000 });
  } catch {
    return []; // no results for this term at this store
  }

  return page.evaluate(() => {
    const cards = [...document.querySelectorAll("li.product-grid-cell")];
    return cards
      .map((card) => ({
        name: card.querySelector(".product-grid-cell_name-text")?.textContent?.trim() ?? null,
        // e.g. "$5.99 /LB" — the actual per-unit price when it's a
        // variable-weight item; falls back to package size otherwise.
        unitPrice: card.querySelector(".product-grid-cell_size")?.textContent?.trim() ?? null,
        // e.g. "$5.99" or "Sale Price  $8.99"
        priceInfo: card.querySelector(".product-grid-cell_main-price")?.textContent?.trim() ?? null,
        sponsored: !!card.textContent?.includes("Sponsored"),
      }))
      .filter((p) => p.name);
  });
}
