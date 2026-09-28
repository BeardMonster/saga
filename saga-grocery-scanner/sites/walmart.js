// Direct-site scraper for Walmart — confirmed live before writing this:
// real per-item pricing as plain DOM text (data-automation-id attributes),
// no login needed to view prices, no bot-block encountered. Store
// selection persists via cookies. All selectors below were read directly
// off the live site, not guessed.
//
// Walmart has no separate "in-store" browsing mode like the other sites —
// just Shipping/Pickup/Delivery. Pickup was chosen since it reflects a
// specific physical store's real shelf pricing/availability, same intent
// as the other sites' "in-store" pricing.
//
// Unlike Aldi/Lidl, navigating straight to the search results URL
// (`/search?q=...`) works fine and shows real results immediately — no
// SPA routing quirk here, confirmed directly.

const BASE_URL = "https://www.walmart.com";

export async function selectStore(page, zip, locationHint) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  await page.getByText("Pickup or delivery?", { exact: true }).click({ timeout: 15000 });
  await page.getByRole("button", { name: "Pickup", exact: true }).click({ timeout: 10000 });

  // The current store shows as its own button (name + address) inside the
  // now-open panel — click it to open the "Select a store" search panel.
  await page
    .locator("button")
    .filter({ hasText: /Supercenter|Neighborhood Market/ })
    .first()
    .click({ timeout: 10000 });

  const zipInput = page.getByPlaceholder("Enter zip code or city, state");
  await zipInput.waitFor({ state: "visible", timeout: 10000 });
  await zipInput.fill("");
  await zipInput.fill(zip);
  await zipInput.press("Enter");

  const storeOptions = page.locator("label").filter({ hasText: /Supercenter|Neighborhood Market/ });
  await storeOptions.first().waitFor({ state: "visible", timeout: 10000 });
  const target = locationHint ? storeOptions.filter({ hasText: locationHint }) : storeOptions;
  const matched = (await target.count()) > 0 ? target.first() : storeOptions.first();
  const storeName = await matched.textContent().then((t) => t?.replace(/\s+/g, " ").trim()) ?? null;
  await matched.click();

  await page.getByRole("button", { name: "Save", exact: true }).click({ timeout: 10000 });

  return storeName;
}

export async function searchProducts(page, query) {
  await page.goto(`${BASE_URL}/search?q=${encodeURIComponent(query)}&facet=fulfillment_method%3APickup`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  try {
    await page.locator("[data-item-id]").first().waitFor({ state: "visible", timeout: 15000 });
  } catch {
    return []; // no results for this term at this store
  }

  return page.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-item-id]")];
    return cards
      .map((card) => {
        const name = card.querySelector('[data-automation-id="product-title"]')?.textContent?.trim() ?? null;
        const cardText = card.textContent ?? "";
        // e.g. "$3.57/lb" — only present for items sold by weight
        // ("Final cost by weight" nearby confirms it's a real per-unit
        // rate, not just adjacent unrelated text).
        const unitMatch = cardText.match(/\$\d+\.\d{2}\s*\/\s*(lb|oz|ct|ea)\b/i);
        // The price block's text duplicates itself (e.g. "$724current
        // price $7.24") — take the "current price $X.XX" copy, which is
        // always the clean, real one.
        const priceText = card.querySelector('[data-automation-id="product-price"]')?.textContent ?? "";
        const priceMatch = priceText.match(/current price \$(\d+\.\d{2})/i);
        return {
          name,
          unitPrice: unitMatch?.[0] ?? null,
          priceInfo: priceMatch ? `$${priceMatch[1]}` : null,
        };
      })
      .filter((p) => p.name);
  });
}
