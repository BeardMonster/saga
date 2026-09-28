// Pixel-art icon mappings for the completion/reward UI.
// - /icons/goals/*      — 16-Bit RPG Icons by jshetler (CC0, itch.io)
// - /icons/achievements/* — Achievements Icon Pack by GTORAVERSE (itch.io)

export type Horizon = "ten_year" | "five_year" | "three_year" | "one_year" | "six_month" | "three_month" | "one_month" | "two_week" | "one_week";

// Shown next to an active goal — an ascending "value" progression (coin →
// potion → sprout → key → book → gem → amulet) that reads as "how big this
// goal is" the same way RPG loot tiers do.
export const HORIZON_ICON: Record<Horizon, string> = {
  one_week: "/icons/goals/one_month.png",
  two_week: "/icons/goals/one_month.png",
  one_month: "/icons/goals/one_month.png",
  three_month: "/icons/goals/three_month.png",
  six_month: "/icons/goals/six_month.png",
  one_year: "/icons/goals/one_year.png",
  three_year: "/icons/goals/three_year.png",
  five_year: "/icons/goals/five_year.png",
  ten_year: "/icons/goals/ten_year.png",
};

// Shown once a goal is marked achieved — tiered by horizon so a 10-year
// goal's payoff visually outranks a 3-month one. The pack only goes
// Bronze/Silver/Gold for typed badges, so the shortest horizons double up
// at Bronze (a coin for the very shortest, a trophy from three_month up)
// and Diamond (a standalone top-tier badge in the pack) caps the biggest goal.
export const GOAL_TIER_ICON: Record<Horizon, string> = {
  one_week: "/icons/achievements/bronze-coin.png",
  two_week: "/icons/achievements/bronze-coin.png",
  one_month: "/icons/achievements/bronze-coin.png",
  three_month: "/icons/achievements/bronze-trophy.png",
  six_month: "/icons/achievements/bronze-trophy.png",
  one_year: "/icons/achievements/silver-trophy.png",
  three_year: "/icons/achievements/silver-trophy.png",
  five_year: "/icons/achievements/gold-trophy.png",
  ten_year: "/icons/achievements/diamond.png",
};

export const GOLD_STAR_ICON = "/icons/achievements/gold-star.png";
export const TREASURE_CHEST_OPEN_ICON = "/icons/achievements/treasure-chest-open.png";
export const GIFT_BOX_PURCHASED_ICON = "/icons/achievements/gift-box-blue.png";
export const GIFT_BOX_GIVEN_ICON = "/icons/achievements/gift-box-green-open.png";

// Shared className for crisp scaling of small pixel-art source images —
// browsers default to smoothing/blurring on upscale otherwise.
export const PIXEL_ICON_CLASS = "[image-rendering:pixelated]";
