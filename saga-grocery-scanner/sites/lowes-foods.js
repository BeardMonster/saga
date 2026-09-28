// Direct-site scraper for Lowe's Foods — confirmed live before writing
// this: real per-item pricing (both a total price and a real per-lb rate)
// as plain DOM text, no login needed, no bot-block encountered. The
// actual storefront lives on a separate subdomain (shop.lowesfoods.com,
// linked from the main site as "Lowes Foods To Go") — the marketing
// homepage at lowesfoods.com has no product search at all.
//
// Confirmed directly: the "Shop In-Store" store-picker's zip/city search
// box does NOT actually filter or re-sort the store list (typing a zip and
// clicking its suggestion left the same ~85-store, already-visible list
// unchanged). Rather than fight that, this searches the full always-shown
// list by name/address text directly — reliable since Brandon's preferred
// store address is known and fixed, and simpler than the zip flow anyway.

const BASE_URL = "https://shop.lowesfoods.com";

// `locationHint` should match text in the store's name/address (e.g.
// "Strickland" for Brandon's preferred Raleigh location) — required in
// practice here, unlike the other direct sites, since there's no reliable
// "closest" ordering to fall back on (the list's default order isn't
// actually distance-sorted by zip, just whatever the session's own
// approximate location happens to produce).
export async function selectStore(page, zip, locationHint) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  // A fresh session always defaults to Pickup mode (confirmed directly) —
  // the "CHANGE" button's own class varies by current mode
  // (...--button--pickup vs ...--button--instore), so target it by its
  // stable visible text instead, then explicitly switch to the "Shop
  // In-Store" tab rather than assuming it's already active.
  await page.getByRole("button", { name: "CHANGE" }).first().click({ timeout: 15000 });
  await page.getByText(/shop in-store/i).click({ timeout: 10000 });

  const cards = page.locator("section.c-store-address-card");
  await cards.first().waitFor({ state: "visible", timeout: 15000 });

  const target = locationHint ? cards.filter({ hasText: locationHint }).first() : cards.first();
  const matched = (await target.count()) > 0 ? target : cards.first();
  const storeName = await matched.textContent().then((t) => t?.replace(/\s+/g, " ").trim().replace(/^Select/, "")) ?? null;
  await matched.locator("button").click();

  return storeName;
}

// Returns every product card on the search results page as structured
// data — real DOM text, not OCR/vision.
export async function searchProducts(page, query) {
  await page.goto(`${BASE_URL}/search?searchTerms=${encodeURIComponent(query)}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  try {
    await page.locator(".c-card--product").first().waitFor({ state: "visible", timeout: 15000 });
  } catch {
    return []; // no results for this term at this store
  }

  return page.evaluate(() => {
    const cards = [...document.querySelectorAll(".c-card--product")];
    return cards
      .map((card) => {
        const name = card.querySelector(".c-card__content__title")?.textContent?.trim() ?? null;
        const cardText = card.textContent ?? "";
        // e.g. "($4.87/lb)" — only present for items sold by weight.
        const unitMatch = cardText.match(/\(\$\d+\.\d{2}\s*\/\s*[a-z.]+\)/i);
        // The product link's aria-label always states a real price plainly
        // — "...at the discounted price of $7.31" on sale, or "...priced
        // at $10.00" otherwise (confirmed both forms directly) — more
        // reliable than hunting for the price across several fragmented
        // inline spans in the card itself.
        const link = card.querySelector("a.c-card__link");
        const ariaLabel = link?.getAttribute("aria-label") ?? "";
        const priceMatch = ariaLabel.match(/price of \$(\d+\.\d{2})/) ?? ariaLabel.match(/priced at \$(\d+\.\d{2})/);
        const href = link?.getAttribute("href");
        return {
          name,
          unitPrice: unitMatch?.[0] ?? null,
          priceInfo: priceMatch ? `$${priceMatch[1]}` : null,
          url: href ? `https://shop.lowesfoods.com${href}` : null,
        };
      })
      .filter((p) => p.name);
  });
}
