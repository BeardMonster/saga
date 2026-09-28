// The 9 FDA major food allergens (Milk, Eggs, Fish, Shellfish, Tree Nuts,
// Peanuts, Wheat, Soybeans, Sesame) plus Coconut, offered as quick-toggle
// checkboxes. Recipe.allergens is a freeform string array, not an enum —
// anything not on this list can still be typed in as a custom tag, and new
// entries here later need no schema change (e.g. once an Ollama ingredient
// scan can tag allergens automatically instead of by hand).
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
