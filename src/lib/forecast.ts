// Bite forecast algorithm — pure functions used by API routes & client.
// All text in Russian where appropriate.

import type { Species } from "./species";

export type FishWeights = {
  waterTemp?: number;
  pressureTrend?: number;
  pressureValue?: number;
  windSpeed?: number;
  windDirection?: number;
  timeOfDay?: number;
  moonPhase?: number;
  cloudCover?: number;
};

// ----------------- Piecewise-linear interpolation -----------------

// points sorted ascending by [0]; linear interp between; clamp ends.
export function piecewiseLinear(points: Array<[number, number]>, x: number): number {
  if (points.length === 0) return 0;
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return Math.round(y0 + t * (y1 - y0));
    }
  }
  return last[1];
}

// ----------------- Moon phase -----------------

// Reference new moon (lunar epoch): 2000-01-06 18:14 UTC
const LUNAR_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
const SYNODIC_MONTH = 29.53058867;

export function moonPhase(date: Date): { age: number; phase: number; label: string } {
  const ms = date.getTime() - LUNAR_EPOCH_MS;
  const day = ms / (1000 * 60 * 60 * 24);
  const age = ((day % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  const phase = age / SYNODIC_MONTH; // 0..1
  return { age, phase, label: moonPhaseLabel(phase) };
}

export function moonPhaseLabel(phase: number): string {
  // Phase 0..1
  const buckets = [
    { max: 0.03, label: "Новолуние" },
    { max: 0.22, label: "Растущая" },
    { max: 0.28, label: "Первая четверть" },
    { max: 0.47, label: "Растущая" },
    { max: 0.53, label: "Полнолуние" },
    { max: 0.72, label: "Убывающая" },
    { max: 0.78, label: "Последняя четверть" },
    { max: 0.97, label: "Убывающая" },
    { max: 1.01, label: "Новолуние" },
  ];
  for (const b of buckets) {
    if (phase <= b.max) return b.label;
  }
  return "Новолуние";
}

// Moon emoji (unicode) — works on Android.
export function moonPhaseEmoji(phase: number): string {
  // 0=new moon, 0.5=full moon
  const emojis = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
  const idx = Math.round((phase % 1) * 8) % 8;
  return emojis[idx];
}

// ----------------- Compass / wind -----------------

export const COMPASS_8_RU: { short: string; full: string; deg: number }[] = [
  { short: "С", full: "Север", deg: 0 },
  { short: "СВ", full: "Северо-восток", deg: 45 },
  { short: "В", full: "Восток", deg: 90 },
  { short: "ЮВ", full: "Юго-восток", deg: 135 },
  { short: "Ю", full: "Юг", deg: 180 },
  { short: "ЮЗ", full: "Юго-запад", deg: 225 },
  { short: "З", full: "Запад", deg: 270 },
  { short: "СЗ", full: "Северо-запад", deg: 315 },
];

export function windDirLabel(deg: number | null | undefined): string | null {
  if (deg == null || Number.isNaN(deg)) return null;
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 45) % 8;
  return COMPASS_8_RU[idx].short;
}

export function windDirFullLabel(deg: number | null | undefined): string | null {
  if (deg == null || Number.isNaN(deg)) return null;
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 45) % 8;
  return COMPASS_8_RU[idx].full;
}

// ----------------- Pressure trend -----------------

export type PressureTrend = "drop_sharp" | "drop" | "stable" | "rise" | "rise_sharp";

// Thresholds based on user's research (image 1):
//   Резкий скачок = падение ≥ 5–8 mmHg/сутки → ~0.6–1 mmHg/3ч
//   Плавное падение = 2–3 mmHg/сутки → ~0.25–0.4 mmHg/3ч
// Thresholds (per 3-hour window):
//   < -1 mmHg/3ч           → Резко падает
//   -1 .. -0.3 mmHg/3ч     → Падает (плавное)
//   -0.3 .. +0.3 mmHg/3ч   → Стабильно
//   +0.3 .. +1 mmHg/3ч     → Растёт (плавное)
//   > +1 mmHg/3ч           → Резко растёт
export function pressureTrend(deltaMmHg: number): { trend: PressureTrend; label: string } {
  if (deltaMmHg < -1) return { trend: "drop_sharp", label: "Резко падает" };
  if (deltaMmHg < -0.3) return { trend: "drop", label: "Падает" };
  if (deltaMmHg <= 0.3) return { trend: "stable", label: "Стабильно" };
  if (deltaMmHg <= 1) return { trend: "rise", label: "Растёт" };
  return { trend: "rise_sharp", label: "Резко растёт" };
}

// hPa → mmHg
export const HPA_TO_MMHG = 0.750062;

// ----------------- Weather code → Russian label -----------------

export function weatherCodeLabel(code: number): string {
  const map: Record<number, string> = {
    0: "Ясно",
    1: "Переменная облачность",
    2: "Переменная облачность",
    3: "Переменная облачность",
    45: "Туман",
    48: "Изморозь",
    51: "Морось",
    53: "Морось",
    55: "Морось",
    56: "Ледяной дождь",
    57: "Ледяной дождь",
    61: "Дождь",
    63: "Дождь",
    65: "Сильный дождь",
    66: "Ледяной дождь",
    67: "Ледяной дождь",
    71: "Снег",
    73: "Снег",
    75: "Сильный снег",
    77: "Снежные зёрна",
    80: "Ливень",
    81: "Ливень",
    82: "Сильный ливень",
    85: "Снегопад",
    86: "Снегопад",
    95: "Гроза",
    96: "Гроза с градом",
    99: "Гроза с градом",
  };
  return map[code] ?? "—";
}

// ----------------- Water-temperature curves (per-species) -----------------
// Detailed piecewise-linear curves researched by user — see worklog Task 4.
// x = waterTemp °C, y = score 0..100.

const WATER_TEMP_CURVES: Record<Species, Array<[number, number]>> = {
  // Карась — peak 14-15°C (pre-spawning feast), dip at 16-17 (spawning), recovery 18-25, decline >25.
  // Lowered at 8-14°C to reflect "autumn slowdown" — 10-12°C is "stable biting barely starts",
  // not "good" (per user's research). With quadratic tempGate (threshold 80), this suppresses
  // day-over-day variation from moon/pressure when water is suboptimal.
  // Off-season / spawning are additionally suppressed via season modifier in scoreForSpecies.
  карась: [
    [-10, 5], [0, 10], [2, 15], [4, 20], [6, 30], [8, 40], [10, 50], [12, 55],
    [14, 75], [15, 90], [16, 30], [17, 40], [18, 70], [20, 90], [22, 95], [24, 95],
    [25, 80], [26, 65], [28, 45], [30, 30], [32, 20],
  ],
  // Сазан — <10°C passive (depth), pre-spawn 14-16, spawn dip 17-19, post-spawn peak 22-26, decline >30.
  // Lowered at 10-14°C — sazan is sluggish in cold water, only active at 18+.
  сазан: [
    [-5, 0], [5, 5], [8, 15], [10, 25], [12, 40], [14, 55], [16, 75], [17, 80],
    [18, 85], [20, 90], [22, 95], [24, 100], [26, 100], [28, 90], [30, 70], [33, 40],
  ],
  // Сом — very low <10, spring feast 14-17, spawning dip 18-22, post-spawn peak 25-28, decline >30.
  // Lowered at 10-14°C — som is cold-water sensitive, doesn't feed actively until 14+.
  сом: [
    [-5, 0], [4, 0], [6, 10], [8, 20], [10, 30], [12, 40], [14, 60], [15, 75],
    [17, 90], [18, 80], [20, 55], [22, 70], [24, 90], [26, 100], [28, 95], [30, 75],
    [33, 50],
  ],
  // Щука — peak 10-12, good 8-15, decline 18-22, very low >22, metabolism stops below 3°C.
  щука: [
    [-1, 5], [0, 15], [2, 25], [4, 50], [6, 65], [8, 80], [10, 95], [11, 100],
    [12, 95], [14, 85], [16, 75], [18, 55], [20, 40], [22, 25], [25, 15], [30, 5],
  ],
  // Краснопёрка — semi-anadromous. Peak activity during:
  //   - Spring pre-spawn (4-12°C, after ice break-up) — pre-spawn feeding
  //   - Autumn migration (8-12°C, sea cooling) — mass run to river for wintering
  // Spawning at 18-20°C suppresses bite. Summer > 22°C — only juveniles (off-season).
  краснопёрка: [
    [-2, 5], [0, 5], [2, 5], [4, 25], [6, 50], [8, 80], [10, 90], [12, 75],
    [14, 60], [16, 40], [18, 15], [20, 25], [22, 35], [24, 15], [26, 10], [30, 5],
  ],
};

// ----------------- Pressure trend scores (per-species) -----------------
// Table-driven per spec. Values 0..100.

// Based on user's image 2 (по видам рыб: тренд давления → клёв) and image 1:
//   Карась: Стабильно=Хорошо, Плавное падение=Среднее, Резкий скачок=Привередлив
//   Сазан: Стабильно=Среднее, Плавное падение=Хорошо, Резкий скачок=Привередлив
//   Сом:   Стабильно=Хорошо (тёплыми ночами), Плавное падение=Хорошо, Резкий скачок=Слабо
//   Щука:  Стабильно=Хорошо, Плавное падение=Хорошо, Резкий скачок=Слабо
// Оценки 0..100:
//   Отлично=90-100, Хорошо=70-85, Среднее=50-65, Слабо=30-45, Привередлив/Плохо=20-30
const PRESSURE_TREND_SCORES: Record<Species, Record<PressureTrend, number>> = {
  // Карась: prefers stable pressure.
  карась: {
    drop_sharp: 30,   // привередлив
    drop: 60,         // среднее
    stable: 90,       // хорошо
    rise: 70,         // хорошо (растущее приемлемо)
    rise_sharp: 25,   // привередлив
  },
  // Сазан: плавное падение ЛУЧШЕ стабильного (по данным фото 2).
  сазан: {
    drop_sharp: 30,   // привередлив
    drop: 85,         // хорошо
    stable: 65,       // среднее
    rise: 75,         // хорошо
    rise_sharp: 30,   // привередлив
  },
  // Сом: и стабильное, и плавное падение — хорошо.
  сом: {
    drop_sharp: 35,   // слабо
    drop: 80,         // хорошо
    stable: 85,       // хорошо (тёплыми ночами)
    rise: 60,         // среднее
    rise_sharp: 40,   // слабо
  },
  // Щука: и стабильное, и плавное падение — хорошо; резкий скачок — слабо.
  // (по данным фото 2: «Стабильно=Хорошо, Плавное падение=Хорошо, Резкий скачок=Слабо»)
  щука: {
    drop_sharp: 35,   // слабо
    drop: 85,         // хорошо
    stable: 85,       // хорошо
    rise: 60,         // среднее
    rise_sharp: 30,   // слабо
  },
  // Краснопёрка: prefers stable pressure (как карась — миграция идёт при устойчивой погоде).
  // Плавное падение приемлемо (70), резкие скачки — плохо.
  краснопёрка: {
    drop_sharp: 30,
    drop: 70,
    stable: 85,
    rise: 70,
    rise_sharp: 25,
  },
};

// ----------------- Scoring helpers -----------------

// Bell-shaped sub-score kept for backward compat (still used in some tests).
export function bellScore(value: number, peak: number, lo: number, hi: number): number {
  if (value < lo || value > hi) {
    return Math.max(0, 100 - Math.abs(value - peak) * 8);
  }
  const half = Math.max((hi - lo) / 2, 0.001);
  const d = Math.abs(value - peak) / half;
  return Math.round(100 - 25 * d * d);
}

// Water-temperature sub-score per species — uses detailed piecewise curve.
export function waterTempScore(species: Species, waterTemp: number): number {
  return piecewiseLinear(WATER_TEMP_CURVES[species], waterTemp);
}

// Pressure trend sub-score (table-driven).
export function pressureTrendScore(trend: PressureTrend, species: Species): number {
  return PRESSURE_TREND_SCORES[species][trend];
}

// Pressure value sub-score (absolute range) — based on user's image 1:
//   745-765 (стабильно нормальное) → Уверенный, стабильный → 90
//   720-745 (стабильно низкое)     → Уверенный, рыбы идут на глубину → 75
//   765-780 (стабильно высокое)    → Слабый днём, лучше на заре → 50
//   700-720 / 780-800 (крайние)    → 35
//   <700 / >800 (экстремальные)    → 20
// Note: trend (стабильно/падает/растёт) учитывается отдельной функцией pressureTrendScore.
export function pressureValueScore(pressureMmHg: number): number {
  if (pressureMmHg >= 745 && pressureMmHg <= 765) return 90;
  if (pressureMmHg >= 720 && pressureMmHg < 745) return 75;
  if (pressureMmHg > 765 && pressureMmHg <= 780) return 50;
  if ((pressureMmHg >= 700 && pressureMmHg < 720) || (pressureMmHg > 780 && pressureMmHg <= 800)) return 35;
  return 20;
}

// Time-of-day sub-score for dawn/dusk preference.
export function timeOfDayScore(minutesFromSunEvent: number): number {
  const sigma = 60;
  const v = 100 * Math.exp(-(minutesFromSunEvent * minutesFromSunEvent) / (sigma * sigma));
  return Math.round(v);
}

// Wind direction sub-score — piecewise by 8-point compass.
// По правилу пользователя: «южный, западный клев нормальный; северный, восточный — не очень».
// Используем 8-румбовый компас с явной оценкой для каждого направления:
//   С  (N,   0°)   → 25  — холодный, не очень
//   СВ (NE, 45°)  → 30  — холодный с востоком, не очень
//   В  (E,  90°)  → 35  — восточный, не очень
//   ЮВ (SE, 135°) → 75  — тёплый с востоком, хорошо
//   Ю  (S, 180°)  → 90  — тёплый, хороший
//   ЮЗ (SW, 225°) → 100 — лучший: тёплый, нагоняет корм в берег
//   З  (W, 270°)  → 90  — хороший
//   СЗ (NW, 315°) → 65  — западный с холодным севером, средне
const WIND_DIR_SCORES_8PT: Array<{ short: string; score: number; deg: number }> = [
  { short: "С", score: 25, deg: 0 },
  { short: "СВ", score: 30, deg: 45 },
  { short: "В", score: 35, deg: 90 },
  { short: "ЮВ", score: 75, deg: 135 },
  { short: "Ю", score: 90, deg: 180 },
  { short: "ЮЗ", score: 100, deg: 225 },
  { short: "З", score: 90, deg: 270 },
  { short: "СЗ", score: 65, deg: 315 },
];

export function windDirScore(deg: number | null | undefined, _bestDirs?: number[]): number {
  if (deg == null || Number.isNaN(deg)) return 50;
  const norm = ((deg % 360) + 360) % 360;
  // Find closest 8-point compass direction
  let closest = WIND_DIR_SCORES_8PT[0];
  let bestDiff = 360;
  for (const dir of WIND_DIR_SCORES_8PT) {
    const diff = Math.min(Math.abs(norm - dir.deg), 360 - Math.abs(norm - dir.deg));
    if (diff < bestDiff) {
      bestDiff = diff;
      closest = dir;
    }
  }
  // If exactly on the compass point, return its score.
  // If between two points, interpolate linearly between their scores.
  if (bestDiff === 0) return closest.score;
  // Find the next compass point clockwise
  const idx = WIND_DIR_SCORES_8PT.indexOf(closest);
  const next = WIND_DIR_SCORES_8PT[(idx + 1) % 8];
  const nextDeg = next.deg < closest.deg ? next.deg + 360 : next.deg;
  const segmentSize = nextDeg - closest.deg;
  const t = bestDiff / segmentSize;
  return Math.round(closest.score + t * (next.score - closest.score));
}

// Bite score → label + color (used by FishChips, ScoreGauge, ForecastTab).
// Шкала по запросу пользователя:
//   0-10   → "Клёва нет"   (тёмно-красный)
//   11-30  → "Слабый"      (красный)
//   31-60  → "Средний"     (оранжевый)
//   61-80  → "Хороший"     (зелёный)
//   81-100 → "Отличный"    (тёмно-зелёный)
export function biteLabel(score: number): string {
  if (score >= 81) return "Отличный";
  if (score >= 61) return "Хороший";
  if (score >= 31) return "Средний";
  if (score >= 11) return "Слабый";
  return "Клёва нет";
}

export function biteColor(score: number): string {
  if (score >= 81) return "#1a4d2e"; // отличнo — тёмно-зелёный
  if (score >= 61) return "#2d5a3d";  // хороший — зелёный
  if (score >= 31) return "#d97706";  // средний — оранжевый
  if (score >= 11) return "#dc2626";  // слабый — красный
  return "#7f1d1d";                   // клёва нет — тёмно-красный
}

// ----------------- Seasonal logic (карась & сазан) -----------------

export type SeasonStatus =
  | "off_season"      // Nov-Apr — don't analyze
  | "warming"         // May, water < 12°C — waiting for warm
  | "pre_spawn"       // Water approaching spawn temp
  | "spawning"        // At spawn temp — biting stops
  | "post_spawn"      // 7-10 days after spawn — great bite
  | "active"          // Normal active season
  | "cooling"         // Fall, water 10-12°C — season ending
  | "too_hot";        // Summer heat > 25-28°C — lethargic

export interface SeasonInfo {
  status: SeasonStatus;
  label: string;        // Short label for UI badge
  description: string;  // Longer description for "Почему?" dialog
}

// Determine season status for a species at a given month + water temperature.
// Returns label + description for UI display.
// Note: щука always returns "active" (cold-water predator, active year-round per user's research).
// Карась, сазан, сом have seasonal rules below.
export function getSeasonStatus(species: Species, month: number, waterTemp: number): SeasonInfo {
  // Щука: no seasonal logic (existing temp curves handle cold water via tempGate)
  if (species === "щука") {
    return { status: "active", label: "Активно", description: "Сезон открыт круглый год" };
  }

  // Краснопёрка — полупроходная рыба. Живёт в море, заходит в реки для зимовки и нереста.
  // Сезон интересен: весенний преднерестовый жор (март-середина апреля),
  // посленерестовый скат (конец мая-июнь), осенний ход (октябрь-ноябрь, крупная рыба).
  if (species === "краснопёрка") {
    // Winter (Dec-Feb): глухозимье — in wintering holes, not feeding
    if (month === 12 || month === 1 || month === 2) {
      return {
        status: "off_season",
        label: "Глухозимье",
        description: "Краснопёрка в зимовальных ямах, не питается. Сезон откроется весной после ледохода"
      };
    }
    // Summer (Jun-Aug): only juveniles in river mouths — not interesting
    if (month >= 6 && month <= 8) {
      return {
        status: "off_season",
        label: "Не сезон (мелочь)",
        description: "Взрослая краснопёрка в море. В устьях только мелочь. Сезон откроется в октябре при похолодании"
      };
    }
    // Spring pre-spawn (March - mid April): water 4-16°C — BEST spring fishing
    if ((month === 3 || month === 4) && waterTemp >= 4 && waterTemp < 16) {
      return {
        status: "pre_spawn",
        label: "Весенний жор!",
        description: "Краснопёрка поднялась из ям, активно нагуливает корм перед нерестом. Лучшее время весной!"
      };
    }
    // Spawning: May-June, water 18-20°C
    if ((month === 5 || month === 6) && waterTemp >= 18 && waterTemp <= 20) {
      return {
        status: "spawning",
        label: "Нерест",
        description: "Краснопёрка мечет икру на мелководье (15-35 см) в тихих местах. Клёв прекращён"
      };
    }
    // Post-spawn: May-June, water > 20°C, adults rolling back to sea
    if ((month === 5 || month === 6) && waterTemp > 20 && waterTemp <= 23) {
      return {
        status: "post_spawn",
        label: "Посленерестовый скат",
        description: "Взрослая краснопёрка скатывается в море. Можно успеть поймать уходящих особей"
      };
    }
    // Autumn migration (Oct-Nov): water 8-12°C — BEST autumn fishing
    if ((month === 10 || month === 11) && waterTemp >= 8 && waterTemp <= 12) {
      return {
        status: "pre_spawn",  // reusing the "good bite" status (boost ×1.10)
        label: "Осенний ход!",
        description: "Морская вода остыла до 8-10°C — краснопёрка массово идёт в реку на зимовку. Лучшее время осенью!"
      };
    }
    // Late autumn (water < 8°C in Oct-Nov): fish already in wintering holes
    if ((month === 10 || month === 11) && waterTemp < 8) {
      return {
        status: "off_season",
        label: "На зимовальных ямах",
        description: "Краснопёрка залегла в зимовальные ямы. Сезон закрыт до весны"
      };
    }
    // Mid-spring (April-May, water 16-18°C): transitional, less active
    if ((month === 4 || month === 5) && waterTemp >= 16 && waterTemp < 18) {
      return {
        status: "active",
        label: "Активно",
        description: "Вода прогревается, краснопёрка активна, но скоро нерест"
      };
    }
    // September: depends on water temp
    if (month === 9) {
      if (waterTemp < 14) {
        return {
          status: "pre_spawn",
          label: "Осенний ход начинается",
          description: "Вода остывает — краснопёрка начинает заход в реку"
        };
      }
      return {
        status: "off_season",
        label: "Не сезон",
        description: "Вода ещё тёплая, взрослая краснопёрка в море"
      };
    }
    return { status: "off_season", label: "Не сезон", description: "В данный момент краснопёрка не интересна для ловли" };
  }

  // Карась, Сазан, Сом: November-April (months 11, 12, 1, 2, 3, 4) = off-season
  const isOffSeason = month === 11 || month === 12 || month === 1 || month === 2 || month === 3 || month === 4;
  if (isOffSeason && waterTemp < 8) {
    if (species === "сазан") {
      return {
        status: "off_season",
        label: "Не сезон",
        description: "Сазан на зимовальных ямах, не питается. Сезон откроется в мае при прогреве воды до 12-15°C"
      };
    }
    if (species === "сом") {
      return {
        status: "off_season",
        label: "Зимовка",
        description: "Сом залёг в зимовальные ямы и не питается. Сезон откроется в мае при прогреве воды до 8-10°C"
      };
    }
    // Карась
    return {
      status: "off_season",
      label: "Не сезон",
      description: "Карась в спячке, зарывшись в ил. Сезон откроется в мае при прогреве воды до 12-15°C"
    };
  }

  if (species === "сазан") {
    // Cooling: water 10-12°C in fall (Sep-Nov) — checked BEFORE generic <12 warming
    // so that autumn cooling-down period is reported correctly, not "warming".
    if (waterTemp >= 10 && waterTemp < 12 && (month >= 9 && month <= 11)) {
      return {
        status: "cooling",
        label: "Сезон заканчивается",
        description: `Вода ${waterTemp.toFixed(1)}°C — сазан уходит на зимовальные ямы. Скоро сезон закроется`
      };
    }
    // Off-season: water < 10°C in fall (Sep-Nov) — fish already passive
    if (waterTemp < 10 && (month >= 9 || month <= 4)) {
      return {
        status: "off_season",
        label: "Не сезон",
        description: `Вода ${waterTemp.toFixed(1)}°C — сазан пассивен, на глубине`
      };
    }
    // Water < 12°C: warming up (typical May spring)
    if (waterTemp < 12) {
      return {
        status: "warming",
        label: "Вода прогревается",
        description: `Вода ${waterTemp.toFixed(1)}°C — ждём прогрева до 12-15°C для начала активности сазана`
      };
    }
    // Pre-spawn: 14-16°C in May-July
    if (waterTemp >= 14 && waterTemp < 17 && (month >= 5 && month <= 7)) {
      return {
        status: "pre_spawn",
        label: "Приближается нерест",
        description: `Вода ${waterTemp.toFixed(1)}°C — скоро нерест сазана (при 17°C). Можно успеть на преднерестовый жор!`
      };
    }
    // Spawning: 17-18°C stable in May-July
    if (waterTemp >= 17 && waterTemp <= 19 && (month >= 5 && month <= 7)) {
      return {
        status: "spawning",
        label: "Нерест",
        description: `Вода ${waterTemp.toFixed(1)}°C — сазан мечет икру. Клёв прекращён. Через 7-10 дней начнётся посленерестовый жор`
      };
    }
    // Post-spawn: water just above spawn temp (19-22°C) in May-July
    if (waterTemp > 19 && waterTemp <= 23 && (month >= 5 && month <= 7)) {
      return {
        status: "post_spawn",
        label: "Посленерестовый жор!",
        description: `Вода ${waterTemp.toFixed(1)}°C — сазан отнерестился и активно кормится. Лучшее время для ловли!`
      };
    }
    return { status: "active", label: "Активно", description: `Вода ${waterTemp.toFixed(1)}°C — сазан активно питается` };
  }

  if (species === "сом") {
    // Below 6°C: hibernation in wintering holes (any month)
    if (waterTemp < 6) {
      return {
        status: "off_season",
        label: "Зимовка",
        description: `Вода ${waterTemp.toFixed(1)}°C — сом залёг в зимовальные ямы и не питается. Сезон откроется в мае при прогреве воды до 8-10°C`
      };
    }
    // Cooling: water 10-12°C in fall (Sep-Nov) — checked BEFORE generic off-season
    // so autumn cooling-down is reported correctly (not "off_season").
    if (waterTemp >= 10 && waterTemp < 12 && (month >= 9 && month <= 11)) {
      return {
        status: "cooling",
        label: "Сезон заканчивается",
        description: `Вода ${waterTemp.toFixed(1)}°C — сом перемещается к местам зимовки в глубокие ямы с минимальным течением`
      };
    }
    // Waking up: water 8-12°C in May-June — checked BEFORE generic off-season
    // (since waterTemp 8-10 would otherwise trigger the off-season branch below).
    if (waterTemp >= 8 && waterTemp < 12 && (month >= 5 && month <= 6)) {
      return {
        status: "warming",
        label: "Сом пробуждается",
        description: `Вода ${waterTemp.toFixed(1)}°C — сом пробуждается от зимней спячки. Клёв пока слабый`
      };
    }
    // Off-season: water < 10°C any month (not May-June 8-10°C, already handled above)
    if (waterTemp < 10) {
      return {
        status: "off_season",
        label: "Не сезон",
        description: `Вода ${waterTemp.toFixed(1)}°C — сом почти не кормится`
      };
    }
    // Pre-spawn (spring feast): 13-17°C in May-June
    if (waterTemp >= 13 && waterTemp < 18 && (month >= 5 && month <= 6)) {
      return {
        status: "pre_spawn",
        label: "Весенний жор",
        description: `Вода ${waterTemp.toFixed(1)}°C — весенний жор сома. Клёв слабый из-за подготовки к нересту`
      };
    }
    // Spawning: 18-22°C in late May-July
    if (waterTemp >= 18 && waterTemp <= 22 && (month >= 5 && month <= 7)) {
      return {
        status: "spawning",
        label: "Нерест",
        description: `Вода ${waterTemp.toFixed(1)}°C — сом строит гнёзда, клёв практически прекращается. Через 7-10 дней начнётся посленерестовый жор`
      };
    }
    // Post-spawn: 20-28°C in July-August (peak activity)
    if (waterTemp >= 20 && waterTemp <= 28 && (month >= 7 && month <= 8)) {
      return {
        status: "post_spawn",
        label: "Посленерестовый жор!",
        description: `Вода ${waterTemp.toFixed(1)}°C — пик активности сома! Тёплые ночи стимулируют ночную охоту. Лучшее время: июль-август`
      };
    }
    return { status: "active", label: "Активно", description: `Вода ${waterTemp.toFixed(1)}°C — сом активно питается` };
  }

  // species === "карась"
  // Сезонная логика по статьям о карасе (обобщённая практика рыболовов ДВ):
  //   < 4°C  — глухозимье (только в оттепель, в глубоких ямах)
  //   4-8°C  — пассивен, но клюёт (зимой и поздней осенью)
  //   8-12°C — осенний/весенний жор (активно питается)
  //   12-15°C — пик активности (преднерестовый жор / осеннее накопление)
  //   15-20°C — нерест в мае-июле; активный жор в другие месяцы
  //   20-25°C — посленерестовый жор в мае-июле; летняя активность
  //   > 25°C  — жара, кислород падает, уходит на глубину

  // По первому льду (декабрь), вода 4-10°C — ещё активен (проверяем ПЕРВЫМ, до общей зимней пассивности)
  if (month === 12 && waterTemp >= 4 && waterTemp < 10) {
    return {
      status: "active",
      label: "По первому льду",
      description: `Вода ${waterTemp.toFixed(1)}°C — карась ещё активен на глубине до 3 м. Лучшее время: 11-15 ч, в оттепель`
    };
  }

  // Глухозимье (декабрь-февраль), вода < 4°C — карась в спячке
  if ((month === 12 || month === 1 || month === 2) && waterTemp < 4) {
    return {
      status: "off_season",
      label: "Глухозимье",
      description: `Вода ${waterTemp.toFixed(1)}°C — карась в зимовальных ямах, едва активен. В оттепель — мотыль, глубокие ямы с ракушечным дном`
    };
  }

  // Зимняя пассивность (январь-февраль), вода 4-10°C — пассивен, но клюёт
  if ((month === 1 || month === 2) && waterTemp >= 4 && waterTemp < 10) {
    return {
      status: "off_season",
      label: "Зимняя пассивность",
      description: `Вода ${waterTemp.toFixed(1)}°C — карась пассивен, но клюёт в оттепель. Глубокие ямы с ракушечным дном, мотыль, 11-15 ч`
    };
  }

  // Весна (март-май), вода 4-12°C — преднерестовый жор
  if ((month >= 3 && month <= 5) && waterTemp >= 4 && waterTemp < 12) {
    return {
      status: "pre_spawn",
      label: "Весенний жор!",
      description: `Вода ${waterTemp.toFixed(1)}°C — карась отошёл от спячки, жадно питается на мелководье. Лучшее время: 10-17 ч, солнечные дни`
    };
  }

  // Весна (март-май), вода 12-15°C — пик весеннего жора
  if ((month >= 3 && month <= 5) && waterTemp >= 12 && waterTemp < 15) {
    return {
      status: "pre_spawn",
      label: "Весенний жор!",
      description: `Вода ${waterTemp.toFixed(1)}°C — пик весеннего жора. Карась неприхотлив к насадкам, на мелководье и у берега`
    };
  }

  // Нерест (май-июль), вода 15-20°C
  if ((month >= 5 && month <= 7) && waterTemp >= 15 && waterTemp < 20) {
    return {
      status: "spawning",
      label: "Нерест",
      description: `Вода ${waterTemp.toFixed(1)}°C — карась мечет икру на мелководье. Клёв прекращён. Через 7-10 дней — посленерестовый жор`
    };
  }

  // Посленерестовый жор (май-июль), вода 20-25°C
  if ((month >= 5 && month <= 7) && waterTemp >= 20 && waterTemp <= 25) {
    return {
      status: "post_spawn",
      label: "Посленерестовый жор!",
      description: `Вода ${waterTemp.toFixed(1)}°C — карась отнерестился и активно кормится. Лучшее время для ловли!`
    };
  }

  // Летняя жара (июнь-август), вода > 25°C
  if ((month >= 6 && month <= 8) && waterTemp > 25) {
    return {
      status: "too_hot",
      label: "Жара — кислород падает",
      description: `Вода ${waterTemp.toFixed(1)}°C — кислород снижается, карась вялый. Уходит на глубину или к ключам. Лучше ловить утром (4-8) и вечером`
    };
  }

  // Осень (сен-ноя), вода < 4°C — близко к спячке
  if ((month >= 9 && month <= 11) && waterTemp < 4) {
    return {
      status: "off_season",
      label: "Близко к спячке",
      description: `Вода ${waterTemp.toFixed(1)}°C — карась почти в спячке. Можно поймать в тёплый день на мотыля`
    };
  }

  // Осень (сен-ноя), вода 4-8°C — сезон заканчивается, но клюёт
  if ((month >= 9 && month <= 11) && waterTemp >= 4 && waterTemp < 8) {
    return {
      status: "cooling",
      label: "Сезон заканчивается",
      description: `Вода ${waterTemp.toFixed(1)}°C — карась на глубинных ямах и бровках, но клюёт. Фидер, матчевая снасть, животные насадки. Лучшее время: 12-16 ч`
    };
  }

  // Осень (сен-ноя), вода 8-12°C — осенний жор
  if ((month >= 9 && month <= 11) && waterTemp >= 8 && waterTemp < 12) {
    return {
      status: "cooling",
      label: "Осенний жор",
      description: `Вода ${waterTemp.toFixed(1)}°C — карась активно кормится, накапливая жир. На бровках и устьях рек. Животные насадки: мотыль, червь, опарыш. Лучшее время: 12-16 ч`
    };
  }

  return { status: "active", label: "Активно", description: `Вода ${waterTemp.toFixed(1)}°C — карась активно кормится` };
}

// Season modifier — multiplied with the tempGate-adjusted score.
// off_season/spawning → 0.15 (mostly no bite)
// post_spawn → 1.10 (slight boost)
// too_hot → 0.75 (reduced activity)
// cooling → 0.85 (slight reduction)
// pre_spawn → 1.0 (no modifier — curve already accounts for pre-spawn activity)
// warming/active → 1.0
export function seasonModifier(status: SeasonStatus): number {
  switch (status) {
    case "off_season": return 0.15;
    case "spawning": return 0.15;
    case "post_spawn": return 1.10;
    case "too_hot": return 0.75;
    case "cooling": return 0.85;
    default: return 1.0;
  }
}

// Lunar day number (1..30) from moon phase (0..1).
// Used for UI display — to show user which lunar day the algorithm is using.
// age = phase * 29.53 (days since new moon, 0-indexed).
// lunar day = floor(age) + 1 (1-indexed, day 1 = new moon).
export function lunarDayFromPhase(phase: number): number {
  const age = phase * SYNODIC_MONTH;
  return Math.floor(age) + 1;
}

// Moon phase sub-score — based on user's research (28-day lunar cycle table).
// Convention: lunarDay = floor(moon age in days) — matches what's shown on popular sites
// (Yandex Weather, Meteocast, Voshod-Solnca). Day 0 = day of new moon, day 1 = 1 day after, etc.
//
// Table (per user's research, shifted to Convention B):
//   День 0-2 (новолуние ±): плохой → 25
//   День 3: хороший → 70
//   День 4-8 (первая четверть, растущая): отличный → 90
//   День 9-10: хороший → 70
//   День 11-12 (растущая, близко к полнолунию): слабый → 45
//   День 13-16 (полнолуние ±): плохой → 25
//   День 17 (сразу после полнолуния): слабый → 45
//   День 18-19: отличный → 90
//   День 20-22 (третья четверть): хороший → 70
//   День 23-26 (убывающая): слабый → 45
//   День 27+ (близко к новолунию): плохой → 25
// Принимает ЛУННЫЙ ДЕНЬ (0..30) от computeUserLunarDay.
export function moonPhaseScore(lunarDay: number): number {
  const day = Math.max(0, Math.min(30, Math.floor(lunarDay)));
  if (day <= 2) return 25;                       // плохой (новолуние ±)
  if (day === 3) return 70;                     // хороший
  if (day >= 4 && day <= 8) return 90;            // отличный
  if (day === 9 || day === 10) return 70;         // хороший
  if (day === 11 || day === 12) return 45;        // слабый
  if (day >= 13 && day <= 16) return 25;          // плохой (полнолуние)
  if (day === 17) return 45;                    // слабый
  if (day === 18 || day === 19) return 90;      // отличный
  if (day >= 20 && day <= 22) return 70;        // хороший
  if (day >= 23 && day <= 26) return 45;        // слабый
  if (day >= 27) return 25;                    // плохой (близко к новолунию)
  return 50; // fallback
}

// Compute lunar day using the standard astronomical convention:
//   lunarDay = floor(moon age in days)
// where moon age = phase × SYNODIC_MONTH, and phase is the Open-Meteo value
// (sampled at noon local for each day).
//
// This matches what's shown on popular sites (Yandex Weather, Meteocast, Voshod-Solnca):
//   - On the day of new moon, age ≈ 0 → lunarDay = 0 (or "новолуние")
//   - Day after new moon: age = 1.0+ → lunarDay = 1 ("1 день")
//   - Day N after new moon: lunarDay = N
//
// No more moonrise-based counting — that was inconsistent (per-day phase variation
// caused off-by-one errors when adjacent days' phases straddled an integer boundary).
// Now the day number is stable: increments by 1 each solar day, never goes backwards.
export function computeUserLunarDay(_now: Date, _moonrises: Date[], phase: number): number {
  const age = phase * SYNODIC_MONTH;
  return Math.floor(age);
}

// Find the most recent new moon before `now` using the lunar epoch + synodic month.
// Iterates backwards from `now` to find the largest t such that
// t = LUNAR_EPOCH_MS + k * SYNODIC_MONTH * ms_per_day, t <= now.
export function mostRecentNewMoon(now: Date): Date {
  const msPerDay = 1000 * 60 * 60 * 24;
  const msPerCycle = SYNODIC_MONTH * msPerDay;
  const elapsedMs = now.getTime() - LUNAR_EPOCH_MS;
  const cycles = Math.floor(elapsedMs / msPerCycle);
  return new Date(LUNAR_EPOCH_MS + cycles * msPerCycle);
}

// Wind speed sub-score: ideal [lo,hi], >badMps → low
export function windSpeedScore(speed: number, lo: number, hi: number, badMps: number): number {
  if (speed >= lo && speed <= hi) return 95;
  if (speed > badMps) return 10;
  if (speed < lo) {
    const d = lo - speed;
    return Math.max(20, Math.round(95 - d * 10));
  }
  const d = speed - hi;
  return Math.max(10, Math.round(95 - d * 15));
}

// Cloud cover sub-score (0..100%)
export function cloudCoverScore(cover: number, preference: "overcast" | "sunny" | "neutral"): number {
  if (preference === "neutral") return 70;
  if (preference === "overcast") {
    return Math.round((cover / 100) * 90 + 10);
  }
  return Math.round(((100 - cover) / 100) * 90 + 10);
}

// ----------------- Per-species config (rebalanced per Task 4 spec) -----------------

export const DEFAULT_WEIGHTS: Record<Species, FishWeights> = {
  // Карась: windDirection увеличен до 0.10 (по правилу пользователя: S/W норм, N/E не очень).
  карась: {
    waterTemp: 0.35,
    pressureTrend: 0.20,
    pressureValue: 0.05,
    windSpeed: 0.15,
    windDirection: 0.10,
    timeOfDay: 0.10,
    moonPhase: 0.05,
  },
  // Сазан: windDirection 0.10 (сазан чувствителен к тёплым S/SW ветрам — они нагоняют корм).
  сазан: {
    waterTemp: 0.40,
    pressureTrend: 0.15,
    pressureValue: 0.05,
    windSpeed: 0.10,
    windDirection: 0.10,
    timeOfDay: 0.15,
    moonPhase: 0.05,
  },
  // Сом: добавлен windDirection 0.05 (сом любит тёплые южные ветра — нагоняют корм в прибрежную зону).
  сом: {
    waterTemp: 0.40,
    timeOfDay: 0.20,
    pressureTrend: 0.15,
    pressureValue: 0.05,
    windSpeed: 0.10,
    windDirection: 0.05,
    moonPhase: 0.10,
  },
  // Щука: добавлен windDirection 0.05 (хищник, но на направление ветра реагирует слабо — низкий вес).
  щука: {
    pressureTrend: 0.25,
    waterTemp: 0.20,
    cloudCover: 0.15,
    timeOfDay: 0.15,
    windSpeed: 0.10,
    windDirection: 0.05,
    moonPhase: 0.10,
  },
  // Краснопёрка: waterTemp критичен — управляет триггерами миграции (осеннее похолодание,
  // весенний прогрев). Давление и время суток важны, лунный цикл — нейтрально.
  краснопёрка: {
    waterTemp: 0.40,
    pressureTrend: 0.15,
    pressureValue: 0.05,
    windSpeed: 0.10,
    windDirection: 0.05,  // S/SW warm winds warm water faster in spring
    timeOfDay: 0.15,
    moonPhase: 0.10,
  },
};

// Per-species scoring inputs
export interface HourInput {
  airTemp: number;
  waterTemp: number;
  windSpeed: number;
  windDir: number; // degrees
  pressureMmHg: number;
  pressureTrend: PressureTrend;
  precipitation: number;
  cloudCover: number;
  weatherCode: number;
  minutesFromSunEvent: number; // for time-of-day (dawn/dusk)
  isNight: boolean; // for catfish night logic
  moonPhaseValue: number; // 0..1 (astronomical phase, for emoji display)
  lunarDay: number; // 1..30 (Russian fishing tradition: by moonrise at spot coords)
  month: number; // 1-12, for season status detection
  // Optional override for season logic — used by краснопёрка: score is computed
  // from river waterTemp, but season (migration trigger) is determined by
  // SST in the bays. When set, season logic uses seasonTemp instead of waterTemp.
  seasonTemp?: number;
}

// Per-species scoring function
export function scoreForSpecies(species: Species, weights: FishWeights, input: HourInput): number {
  const subscores: Record<string, number> = {};

  // Water temperature — piecewise curve per species.
  if (weights.waterTemp) {
    subscores.waterTemp = waterTempScore(species, input.waterTemp);
  }

  // Pressure trend — table-driven per species.
  if (weights.pressureTrend) {
    subscores.pressureTrend = pressureTrendScore(input.pressureTrend, species);
  }

  // Pressure value — same formula for all species (broad band, minor factor).
  if (weights.pressureValue) {
    subscores.pressureValue = pressureValueScore(input.pressureMmHg);
  }

  // Wind speed
  if (weights.windSpeed) {
    if (species === "сом") {
      subscores.windSpeed = windSpeedScore(input.windSpeed, 1, 3, 5);
    } else if (species === "щука") {
      subscores.windSpeed = windSpeedScore(input.windSpeed, 2, 5, 8);
    } else if (species === "карась") {
      subscores.windSpeed = windSpeedScore(input.windSpeed, 1, 4, 7);
    } else if (species === "сазан") {
      subscores.windSpeed = windSpeedScore(input.windSpeed, 1, 5, 8);
    } else if (species === "краснопёрка") {
      // Краснопёрка — как карась: идеальный ветер 1-4 m/s, выше 7 — плохо.
      subscores.windSpeed = windSpeedScore(input.windSpeed, 1, 4, 7);
    }
  }

  // Wind direction
  if (weights.windDirection) {
    subscores.windDirection = windDirScore(input.windDir, [180, 225, 270]);
  }

  // Time of day
  // Time of day — species-specific (was: pure Gaussian for all, which gave ~0 at noon
  // even for щука — wrong, since predators hunt during the day).
  // dawnDuskScore = Gaussian peak at sunrise/sunset (sigma=60 min).
  // Базовые уровни (baseline) применяются, если Gaussian даёт меньше:
  //   Щука днем: 65 (хищник, охотится весь день)
  //   Карась/Сазан днем: 50 (клюёт, но слабее зорьки)
  //   Сом днем: 25 (ночник, днём прячется)
  // Ночью: щука=25 (визуальный охотник), карась/сазан=25, сом=95 (пик)
  if (weights.timeOfDay) {
    const dist = Math.min(input.minutesFromSunEvent, 720); // cap at 12h
    const dawnDuskScore = 100 * Math.exp(-(dist * dist) / (60 * 60));

    if (species === "сом") {
      // Ночной хищник: пик ночью, переходные часы (рассвет/закат) — 80, днём — 25
      subscores.timeOfDay = input.isNight
        ? 95
        : Math.max(25, Math.round(dawnDuskScore * 0.8));
    } else if (species === "щука") {
      // Хищник-засадчик: пик на рассвете/закате (90+), днём — 65 (продолжает охотиться),
      // ночью — 25 (визуальный охотник, в темноте не видит)
      subscores.timeOfDay = input.isNight
        ? 25
        : Math.round(Math.max(65, dawnDuskScore));
    } else if (species === "краснопёрка") {
      // Краснопёрка: тот же паттерн, что у карася/сазана — пик на зорьке (90+),
      // днём — 50 (клюёт, но слабее), ночью — 25.
      subscores.timeOfDay = input.isNight
        ? 25
        : Math.round(Math.max(50, dawnDuskScore));
    } else {
      // Карась, сазан: пик на зорьке (90+), днём — 50 (клюёт, но слабее),
      // ночью — 25 (неактивны в темноте)
      subscores.timeOfDay = input.isNight
        ? 25
        : Math.round(Math.max(50, dawnDuskScore));
    }
  }

  // Moon phase — одинаковая таблица 28-дневного цикла для всех видов рыб.
  // Используем lunarDay (по восходам луны на координатах места) вместо
  // глобальной фазы — это даёт корректный лунный день для русского календаря.
  if (weights.moonPhase) {
    subscores.moonPhase = moonPhaseScore(input.lunarDay);
  }

  // Cloud cover (only щука uses this)
  if (weights.cloudCover) {
    subscores.cloudCover = cloudCoverScore(input.cloudCover, "overcast");
  }

  // Weighted average
  let total = 0;
  let weightSum = 0;
  for (const [key, w] of Object.entries(weights)) {
    const wnum = w as number;
    if (wnum && subscores[key] != null) {
      total += wnum * subscores[key];
      weightSum += wnum;
    }
  }
  if (weightSum === 0) return 0;
  let finalScore = Math.round(total / weightSum);

  // Water-temperature gate — критически важная защита от абсурдных оценок.
  // Если вода слишком холодная (или слишком тёплая) — рыба физически не активна,
  // даже при идеальном давлении/ветре/времени суток.
  //
  // Логика (квадратичный штраф с порогом 80):
  //   sub-score >= 80 (отличная вода) → gate 1.0 (без штрафа)
  //   sub-score 70  (хорошая вода)    → gate 0.77 (небольшой штраф)
  //   sub-score 50  (средняя вода)    → gate 0.39 (средний штраф)
  //   sub-score 30  (холодная вода)  → gate 0.14 (сильный штраф)
  //   sub-score 10 (очень холодная) → gate 0.016 (почти нет клёва)
  //
  // Квадратичная функция делает температуру ДОМИНИРУЮЩИМ фактором при холодной воде:
  // изменения от луны/давления/ветра сильно сглаживаются, чтобы не было "улучшений"
  // когда рыба физически неактивна из-за температуры.
  if (subscores.waterTemp != null) {
    const tempGate = subscores.waterTemp >= 80
      ? 1.0
      : Math.pow(subscores.waterTemp / 80, 2);
    finalScore = Math.round(finalScore * tempGate);
  }

  // Apply season modifier (for карась and сазан — off-season, spawning, etc.)
  // сом and щука always return 1.0 (no seasonal rules).
  // краснопёрка: season uses seasonTemp (SST) if provided — migration trigger
  // depends on bay temperature, not river water temp.
  const season = getSeasonStatus(species, input.month, input.seasonTemp ?? input.waterTemp);
  finalScore = Math.round(finalScore * seasonModifier(season.status));

  return Math.min(100, Math.max(0, finalScore));
}

// Top contributing factors (for "Почему так?" tooltip).
// Returns top 2 factors by weighted contribution * (subscore - 50).
export function topFactors(species: Species, weights: FishWeights, input: HourInput): string[] {
  const results: { factor: string; contribution: number }[] = [];

  const w = weights;
  if (w.waterTemp) {
    const s = waterTempScore(species, input.waterTemp);
    results.push({ factor: "Температура воды", contribution: (w.waterTemp as number) * (s - 50) });
  }
  if (w.pressureTrend) {
    const s = pressureTrendScore(input.pressureTrend, species);
    results.push({ factor: "Тенденция давления", contribution: (w.pressureTrend as number) * (s - 50) });
  }
  if (w.pressureValue) {
    const s = pressureValueScore(input.pressureMmHg);
    results.push({ factor: "Значение давления", contribution: (w.pressureValue as number) * (s - 50) });
  }
  if (w.windSpeed) {
    let s: number;
    if (species === "сом") s = windSpeedScore(input.windSpeed, 1, 3, 5);
    else if (species === "щука") s = windSpeedScore(input.windSpeed, 2, 5, 8);
    else if (species === "карась") s = windSpeedScore(input.windSpeed, 1, 4, 7);
    else if (species === "краснопёрка") s = windSpeedScore(input.windSpeed, 1, 4, 7);
    else s = windSpeedScore(input.windSpeed, 1, 5, 8);
    results.push({ factor: "Скорость ветра", contribution: (w.windSpeed as number) * (s - 50) });
  }
  if (w.windDirection) {
    const s = windDirScore(input.windDir, [180, 225, 270]);
    results.push({ factor: "Направление ветра", contribution: (w.windDirection as number) * (s - 50) });
  }
  if (w.timeOfDay) {
    // Same species-specific logic as in scoreForSpecies (see comments there).
    const dist = Math.min(input.minutesFromSunEvent, 720);
    const dawnDuskScore = 100 * Math.exp(-(dist * dist) / (60 * 60));
    let s: number;
    if (species === "сом") {
      s = input.isNight ? 95 : Math.max(25, Math.round(dawnDuskScore * 0.8));
    } else if (species === "щука") {
      s = input.isNight ? 25 : Math.round(Math.max(65, dawnDuskScore));
    } else if (species === "краснопёрка") {
      s = input.isNight ? 25 : Math.round(Math.max(50, dawnDuskScore));
    } else {
      s = input.isNight ? 25 : Math.round(Math.max(50, dawnDuskScore));
    }
    results.push({ factor: "Время суток", contribution: (w.timeOfDay as number) * (s - 50) });
  }
  if (w.moonPhase) {
    const s = moonPhaseScore(input.lunarDay);
    results.push({ factor: "Фаза луны", contribution: (w.moonPhase as number) * (s - 50) });
  }
  if (w.cloudCover && species === "щука") {
    const s = cloudCoverScore(input.cloudCover, "overcast");
    results.push({ factor: "Облачность", contribution: (w.cloudCover as number) * (s - 50) });
  }

  results.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return results.slice(0, 2).map((r) => r.factor);
}

// ----------------- Water temperature estimation -----------------

// Mean air temperature over the past 3 days BEFORE the forecast starts.
// Open-Meteo response: with past_days=35 + forecast_days=7, hourly array has 42*24=1008 hours.
// Past 3 days before forecast = indices [N-168-72, N-168) = last 72 hours of past data.
// If past_days=3 (legacy), the first 72 hours are the past 3 days — function still works.
export function meanPast3DaysAirTemp(temps: number[]): number {
  if (temps.length === 0) return 15;
  // Last 72 hours BEFORE the last 168 (forecast) hours.
  const forecastLen = 168;
  let slice: number[];
  if (temps.length > forecastLen + 72) {
    // past_days >= 3: take the 72 hours right before forecast starts.
    slice = temps.slice(temps.length - forecastLen - 72, temps.length - forecastLen);
  } else if (temps.length >= 72) {
    // Fallback: take the first 72 hours (assumes past_days=3, no forecast data prepended).
    slice = temps.slice(0, 72);
  } else {
    slice = temps;
  }
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

// Seasonal piecewise formula based on avg3 (mean of past 3 days air temp).
// Rivers have lower thermal inertia (1-2 day lag) than lakes (5-7 day lag).
export function estimateWaterTemp(avg3: number, waterType: "river" | "lake"): number {
  let base: number;
  if (avg3 < 4) {
    // Winter: water stays above freezing
    base = Math.max(0.5, 0.7 * avg3 + 2);
  } else if (avg3 < 12) {
    // Spring warming: water lags behind air
    base = 0.8 * avg3 + 1;
  } else if (avg3 < 20) {
    // Transitional: water close to air
    base = 0.95 * avg3;
  } else {
    // Summer: water slightly cooler than air (evaporative cooling)
    base = 0.9 * avg3;
  }
  // Rivers flow → mix → more responsive (closer to air). Lakes retain heat → smooth.
  if (waterType === "lake") {
    base = base * 0.97;
  }
  return Math.max(0, Math.min(35, Math.round(base * 10) / 10));
}
