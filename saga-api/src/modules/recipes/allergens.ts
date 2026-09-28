// Mirrors saga-web/src/shared/lib/allergens.ts — the 9 FDA major food
// allergens plus Coconut. Kept in sync by hand since the frontend and
// backend are separate codebases; Recipe.allergens itself stays a freeform
// string array either way, so this list only shapes the scan prompt below.
export const COMMON_ALLERGENS = [
  "Milk",
  "Eggs",
  "Fish",
  "Shellfish",
  "Tree Nuts",
  "Peanuts",
  "Wheat",
  "Soy",
  "Sesame",
  "Coconut",
];
