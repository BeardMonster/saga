// Direct-site scraper for Harris Teeter — confirmed live before writing
// this: real per-item pricing as plain text (data-testid attributes, not
// images), no login needed to view prices, and store selection persists
// via cookies (Akamai bot-management cookies present — a real risk worth
// watching if this ever gets flagged, not something to pretend isn't
// there). All selectors below were read directly off the live site, not
// guessed.

const BASE_URL = "https://www.harristeeter.com";

// Opens the store-change modal, searches by zip, picks the closest result
// (the site already sorts by distance), and confirms pickup at that store.
// Only needs to run once per browser session — the selection persists via
// cookies for the rest of the page's navigations.
export async function selectStore(page, zip) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  await page.locator('[data-testid="CurrentModality-button"]').click({ timeout: 15000 });
  const zipInput = page.locator('[data-testid="PostalCodeSearchBox-input"]');
  await zipInput.waitFor({ state: "visible", timeout: 10000 });
  await zipInput.fill(zip);
  await zipInput.press("Enter");

  const firstStore = page.locator('[data-testid^="ModalityOption-Store-Card-"]').first();
  await firstStore.waitFor({ state: "visible", timeout: 10000 });
  const storeName = await firstStore.locator("h3, h2").first().textContent().catch(() => null);
  await firstStore.click();

  await page.locator('[data-testid="Start-Shopping-PICKUP"]').click({ timeout: 10000 });
  return storeName?.trim() ?? null;
}

// Returns every product card on the search results page as structured
// data — real DOM text via data-testid selectors, not OCR/vision. Up to
// ~200 results for a common term; the caller decides how many to actually
// consider.
export async function searchProducts(page, query) {
  await page.goto(`${BASE_URL}/search?query=${encodeURIComponent(query)}`, { waitUntil: "domcontentloaded", timeout: 30000 });

  try {
    await page.locator('[data-testid^="product-card-"]').first().waitFor({ state: "visible", timeout: 15000 });
  } catch {
    return []; // no results for this term at this store
  }

  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid^="product-card-"]')];
    return cards
      .map((card) => ({
        name: card.querySelector('[data-testid="cart-page-item-description"]')?.textContent?.trim() ?? null,
        // e.g. "$2.59/lb" — the actual per-unit price, usually more useful
        // for comparison than the "each" price of a variable-weight pack.
        unitPrice: card.querySelector('[data-testid="product-item-sizing"]')?.textContent?.trim() ?? null,
        // e.g. "about $12.07 each — Sale: about $12.07 each discounted
        // from $18.59" — includes sale/regular price context.
        priceInfo: card.querySelector('[data-testid="product-item-unit-price"]')?.textContent?.trim() ?? null,
        sponsored: !!card.textContent?.includes("Sponsored"),
      }))
      .filter((p) => p.name);
  });
}
