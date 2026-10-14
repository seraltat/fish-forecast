import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ALL_SPECIES, type Species } from "@/lib/species";
import { DEFAULT_WEIGHTS, type FishWeights } from "@/lib/forecast";

const BUCKETS = [
  { label: "0-20", min: 0, max: 20 },
  { label: "20-40", min: 20, max: 40 },
  { label: "40-60", min: 40, max: 60 },
  { label: "60-80", min: 60, max: 80 },
  { label: "80-100", min: 80, max: 101 },
];

// Краснопёрка водится только в устьях рек Раздольная и Артемовка
// (полупроходной вид, живёт в опреснённых участках моря и заходит в реки).
const KRASNOPERKA_SPOTS = new Set(["Раздольная", "Артемовка"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const spotId = url.searchParams.get("spotId") || undefined;

  const catches = await db.catch.findMany({
    where: spotId ? { spotId } : undefined,
    include: { spot: true },
  });

  // Determine which species are "relevant" for this view:
  //  - "Все места" (no spotId): include every species that has at least 1 catch.
  //    Краснопёрка shows if there's any catch of her anywhere.
  //  - Specific spot: include all species that have catches at this spot, PLUS
  //    краснопёрка only if the spot is named "Раздольная" or "Артемовка".
  let relevantSpecies: Species[] = [];
  if (spotId) {
    // Find spot name from first catch (or via Spot lookup if no catches).
    let spotName: string | null = null;
    if (catches.length > 0) {
      spotName = catches[0]?.spot?.name ?? null;
    } else {
      const spot = await db.spot.findUnique({ where: { id: spotId } });
      spotName = spot?.name ?? null;
    }
    const krasnoperAllowed = spotName != null && KRASNOPERKA_SPOTS.has(spotName);
    const speciesWithCatches = new Set<Species>();
    for (const c of catches) {
      if (ALL_SPECIES.includes(c.species as Species)) {
        speciesWithCatches.add(c.species as Species);
      }
    }
    for (const sp of ALL_SPECIES) {
      if (sp === "краснопёрка") {
        if (krasnoperAllowed && speciesWithCatches.has(sp)) {
          relevantSpecies.push(sp);
        }
      } else if (speciesWithCatches.has(sp)) {
        relevantSpecies.push(sp);
      }
    }
  } else {
    const speciesWithCatches = new Set<Species>();
    for (const c of catches) {
      if (ALL_SPECIES.includes(c.species as Species)) {
        speciesWithCatches.add(c.species as Species);
      }
    }
    relevantSpecies = ALL_SPECIES.filter((sp) => speciesWithCatches.has(sp));
  }

  // Count per species — initialise from ALL_SPECIES (auto-includes краснопёрка)
  const countPerSpecies = {} as Record<Species, number>;
  for (const sp of ALL_SPECIES) countPerSpecies[sp] = 0;
  for (const c of catches) {
    if (c.species in countPerSpecies) {
      countPerSpecies[c.species as Species] += 1;
    }
  }

  // Histogram of catches by predicted-score bucket per species
  const histogram = {} as Record<Species, { bucket: string; count: number }[]>;
  for (const sp of ALL_SPECIES) {
    histogram[sp] = BUCKETS.map((b) => ({ bucket: b.label, count: 0 }));
  }
  for (const c of catches) {
    if (!(c.species in histogram)) continue;
    const score = c.predictedScore ?? 0;
    for (let i = 0; i < BUCKETS.length; i++) {
      const b = BUCKETS[i];
      if (score >= b.min && score < b.max) {
        histogram[c.species as Species][i].count += 1;
        break;
      }
    }
  }

  // Hit rate per species — initialise from ALL_SPECIES so new species (e.g. краснопёрка)
  // are automatically included.
  const hitRate = {} as Record<Species, { hits: number; total: number; rate: number }>;
  for (const sp of ALL_SPECIES) hitRate[sp] = { hits: 0, total: 0, rate: 0 };

  // Group catches by species → set of distinct YYYY-MM-DD keys
  const dayKeys = {} as Record<Species, Set<string>>;
  const hitDays = {} as Record<Species, Set<string>>;
  for (const sp of ALL_SPECIES) {
    dayKeys[sp] = new Set();
    hitDays[sp] = new Set();
  }
  for (const c of catches) {
    if (!(c.species in dayKeys)) continue;
    const sp = c.species as Species;
    const day = new Date(c.caughtAt).toISOString().slice(0, 10);
    dayKeys[sp].add(day);
    if (c.predictedScore != null && c.predictedScore > 60) {
      hitDays[sp].add(day);
    }
  }
  for (const sp of ALL_SPECIES) {
    const total = dayKeys[sp].size;
    const hits = hitDays[sp].size;
    hitRate[sp] = { hits, total, rate: total > 0 ? hits / total : 0 };
  }

  // Suggested weight adjustments — pass relevantSpecies so suggestions
  // only reference species the user actually wants to see for this view.
  const suggestions = generateSuggestions(catches, countPerSpecies, histogram, relevantSpecies);

  return NextResponse.json({
    totalCatches: catches.length,
    spotId: spotId ?? null,
    relevantSpecies,
    countPerSpecies,
    histogram,
    hitRate,
    suggestions,
  });
}

interface Suggestion {
  species: Species;
  text: string;
  weightKey: keyof FishWeights;
  delta: number; // suggested change (positive = increase, negative = decrease)
  current: number;
}

function generateSuggestions(
  catches: { species: string; predictedScore: number | null; waterTemp: number | null; pressure: number | null; windSpeed: number | null }[],
  _countPerSpecies: Record<Species, number>,
  histogram: Record<Species, { bucket: string; count: number }[]>,
  relevantSpecies: Species[]
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const sp of relevantSpecies) {
    if (!histogram[sp]) continue;
    if (histogram[sp].reduce((s, b) => s + b.count, 0) < 3) continue; // not enough data
    const highBucket = histogram[sp].find((b) => b.bucket === "60-80")?.count ?? 0;
    const veryHigh = histogram[sp].find((b) => b.bucket === "80-100")?.count ?? 0;
    const lowBucket = histogram[sp].find((b) => b.bucket === "0-20")?.count ?? 0;
    // If we have many catches even when score was low → algorithm under-weights some factor.
    // Heuristic suggestion:
    if (lowBucket >= 2 && veryHigh === 0) {
      const w = DEFAULT_WEIGHTS[sp];
      // try to push the dominant factor
      const entries = Object.entries(w) as [keyof FishWeights, number][];
      entries.sort((a, b) => b[1] - a[1]);
      const top = entries[0];
      if (top) {
        out.push({
          species: sp,
          text: `Ваши данные показывают: при низком прогнозе клёва ${sp} вы всё равно ловили. Возможно, у ${sp} есть сильный фактор, который мы недооцениваем — попробуйте увеличить вес фактора «${factorNameRu(top[0])}» с ${top[1].toFixed(2)} до ${(top[1] + 0.05).toFixed(2)}.`,
          weightKey: top[0],
          delta: 0.05,
          current: top[1],
        });
      }
    }
    // If catches happen only when score > 80 → algorithm is good (high-confidence).
    if (veryHigh >= 3 && lowBucket === 0) {
      out.push({
        species: sp,
        text: `Прогноз для ${sp} работает хорошо: уловы случались только при высокой оценке клёва (>80%). Продолжайте в том же духе.`,
        weightKey: "waterTemp",
        delta: 0,
        current: DEFAULT_WEIGHTS[sp].waterTemp ?? 0,
      });
    }
  }
  if (out.length === 0) {
    out.push({
      species: "щука",
      text: "Недостаточно данных для рекомендаций. Записывайте уловы — после 3+ записей на вид появятся точные подсказки.",
      weightKey: "pressureTrend",
      delta: 0,
      current: DEFAULT_WEIGHTS["щука"].pressureTrend ?? 0,
    });
  }
  return out;
}

function factorNameRu(key: keyof FishWeights): string {
  switch (key) {
    case "waterTemp": return "температура воды";
    case "pressureTrend": return "тенденция давления";
    case "pressureValue": return "значение давления";
    case "windSpeed": return "скорость ветра";
    case "windDirection": return "направление ветра";
    case "timeOfDay": return "время суток";
    case "moonPhase": return "фаза луны";
    case "cloudCover": return "облачность";
    default: return key;
  }
}
