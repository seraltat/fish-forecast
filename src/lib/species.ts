// Species metadata shared across app
export type Species = "карась" | "сазан" | "сом" | "щука" | "краснопёрка";

export const ALL_SPECIES: Species[] = ["карась", "сазан", "сом", "щука", "краснопёрка"];

export const SPECIES_LABELS: Record<Species, string> = {
  карась: "Карась",
  сазан: "Сазан",
  сом: "Сом",
  щука: "Щука",
  краснопёрка: "Краснопёрка",
};

// Stable colors per species — nature palette (no blue/indigo)
export const SPECIES_COLORS: Record<Species, string> = {
  карась: "#b8860b", // dark goldenrod (carp-like gold)
  сазан: "#a0522d", // sienna brown
  сом: "#4b5d3a", // dark olive
  щука: "#5b8c5a", // sage green
  краснопёрка: "#dc2626", // red — краснопёрка has bright red fins
};

export function isSpecies(s: unknown): s is Species {
  return s === "карась" || s === "сазан" || s === "сом" || s === "щука" || s === "краснопёрка";
}
