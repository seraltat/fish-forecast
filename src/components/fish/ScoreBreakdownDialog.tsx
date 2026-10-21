"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SPECIES_LABELS, type Species } from "@/lib/species";
import type { FishWeights, HourInput, PressureTrend, SeasonInfo } from "@/lib/forecast";
import {
  biteColor,
  biteLabel,
  cloudCoverScore,
  getSeasonStatus,
  moonPhaseScore,
  pressureTrend,
  pressureTrendScore,
  pressureValueScore,
  seasonModifier,
  timeOfDayScore,
  waterTempScore,
  windDirScore,
  windDirFullLabel,
  windSpeedScore,
} from "@/lib/forecast";
import type { ForecastHour } from "@/lib/types";
import { AlertTriangle, Thermometer, Fish } from "lucide-react";

// Re-export for callers that need to construct HourInput.
export type { HourInput };

interface ScoreBreakdownDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hour: ForecastHour | null;
  species: Species;
  weights: FishWeights;
  // Optional header label, e.g. "12 Окт, 14:00 — Карась" or "Сегодня 14:00".
  headerLabel?: string;
  // Optional override for season info; if omitted, computed from hour + species.
  seasonInfo?: SeasonInfo;
}

// Map internal factor keys → Russian factor names.
const FACTOR_NAMES: Record<string, string> = {
  waterTemp: "Температура воды",
  pressureTrend: "Тенденция давления",
  pressureValue: "Значение давления",
  windSpeed: "Скорость ветра",
  windDirection: "Направление ветра",
  timeOfDay: "Время суток",
  moonPhase: "Фаза луны",
  cloudCover: "Облачность",
};

// Convert ForecastHour → HourInput suitable for the scoring helpers.
function hourToInput(hour: ForecastHour): HourInput {
  const trend: PressureTrend = pressureTrend(hour.pressureTrend).trend;
  // Local month (1-12) from hour.time — "YYYY-MM-DDTHH:MM" parsed as UTC.
  const month = new Date(hour.time + ":00Z").getUTCMonth() + 1;
  return {
    airTemp: hour.airTemp,
    waterTemp: hour.waterTemp,
    windSpeed: hour.windSpeed,
    windDir: hour.windDir,
    pressureMmHg: hour.pressure,
    pressureTrend: trend,
    precipitation: hour.precipitation,
    cloudCover: hour.cloudCover,
    weatherCode: hour.weatherCode,
    minutesFromSunEvent: 0, // not stored on hour; recomputed from time-of-day sub-score itself if needed
    isNight: hour.isNight,
    moonPhaseValue: hour.moonPhase,
    lunarDay: hour.lunarDay,
    month,
  };
}

interface FishingTips {
  depth: string;       // где искать (глубина/мелководье)
  bait: string;         // рекомендуемые насадки
  timeOfDay: string;   // лучшее время суток
  gear: string;        // снасти
  note?: string;       // дополнительные нюансы
}

// Рекомендации по лову на основе статей о карасе (для других видов — пусто).
// Используется в диалоге "Почему?" — помогает рыбаку понять не только оценку,
// но и КАК ловить в текущих условиях.
function getFishingTips(species: Species, hour: ForecastHour): FishingTips | null {
  if (species !== "карась") return null; // пока только для карася

  const wt = hour.waterTemp;
  // Месяц из времени часа (UTC)
  const month = new Date(hour.time + ":00Z").getUTCMonth() + 1;
  const isNight = hour.isNight;

  // Зима (декабрь-февраль)
  if (month === 12 || month === 1 || month === 2) {
    if (wt < 4) {
      return {
        depth: "Глубокие ямы с ракушечным или глиняным дном, коряжник, устья, родники",
        bait: "Мотыль (мормышка 3-5 г)",
        timeOfDay: "11-15 ч, в оттепель",
        gear: "Зимняя удочка с боковым кивком",
        note: "Глухозимье — карась едва активен. Ловят только в оттепель и в правильных местах",
      };
    }
    // По первому льду / зимняя пассивность
    return {
      depth: "Глубокие ямы с ракушечным дном, коряжник на глубине, устья, родники",
      bait: "Мотыль (мормышка 3-5 г)",
      timeOfDay: "11-15 ч, в оттепель",
      gear: "Зимняя удочка с боковым кивком или поплавочная",
      note: "По первому льду — ещё на глубине до 3 м. В оттепель клюёт лучше",
    };
  }

  // Весна (март-май) — преднерестовый жор
  if (month >= 3 && month <= 5) {
    if (wt >= 15 && wt < 20) {
      // Нерест
      return {
        depth: "Мелководье (15-35 см) — нерестилища",
        bait: "Не клюёт — карась мечет икру",
        timeOfDay: "—",
        gear: "—",
        note: "Через 7-10 дней начнётся посленерестовый жор",
      };
    }
    if (wt >= 4 && wt < 12) {
      return {
        depth: "Мелководье: защищённые от ветра заводи, илистое/глиняное дно, ямы и бугры, коряги, граница растительности",
        bait: "Червь, опарыш, мотыль (можно бутерброд)",
        timeOfDay: "10-17 ч (солнце прогревает воду)",
        gear: "Поплавочная удочка (маховая, болонская), фидер",
        note: "Карась отходит от спячки и жадно питается — неприхотлив к насадкам",
      };
    }
    if (wt >= 12 && wt < 15) {
      return {
        depth: "Мелководье у берега, отмели рядом с ямами, устья ручьёв",
        bait: "Червь, опарыш, перловка, кукуруза — карась неприхотлив",
        timeOfDay: "10-17 ч (солнечные дни)",
        gear: "Поплавочная удочка, фидер",
        note: "Пик весеннего жора — лучшее время для ловли карася",
      };
    }
  }

  // Нерест и посленерестовый жор (май-июль)
  if (month >= 5 && month <= 7) {
    if (wt >= 15 && wt < 20) {
      return {
        depth: "Мелководье (15-35 см) — нерестилища",
        bait: "Не клюёт — карась мечет икру",
        timeOfDay: "—",
        gear: "—",
        note: "Через 7-10 дней начнётся посленерестовый жор",
      };
    }
    if (wt >= 20 && wt <= 25) {
      return {
        depth: "Уходит чуть дальше на глубину, пиха в затопленных кустах и коряжнике",
        bait: "Червь, опарыш, перловка с кукурузой, тесто",
        timeOfDay: "4-8 утра и перед закатом (в жару — ночь)",
        gear: "Поплавочная удочка, фидер, матчевая снасть",
        note: "Посленерестовый жор — пик активности! Лучшее время для ловли",
      };
    }
  }

  // Лето (июнь-август)
  if (month >= 6 && month <= 8) {
    if (wt > 25) {
      // Жара
      return {
        depth: "Глубина, бровки, к ключам и родникам — там кислород",
        bait: "Утром — животные (червь, опарыш), днём — растительные (кукуруза, перловка)",
        timeOfDay: "4-8 утра и перед закатом — в жару карась вялый",
        gear: "Фидер на глубине, поплавочная удочка утром/вечером",
        note: "Жара — кислород падает. Карась меняет место 3-4 раза за день",
      };
    }
    // Нормальное лето (18-25°C)
    return {
      depth: isNight
        ? "Ближе к берегу, в камышах и рогозе, чистые «окна» в растительности"
        : "Глубина, перепады глубин, бровки, затопленные сооружения, илистые свалы",
      bait: "Растительные с ароматизаторами: чеснок, анис, конопля, ваниль, шоколад. Крупные частицы — перловка, кукуруза, горох",
      timeOfDay: "4-8 утра (пик), перед закатом, ночь (крупные особи)",
      gear: "Поплавочная удочка у берега, фидер на дальних дистанциях, матчевая на течении",
      note: "Летом карась становится «вегетарианцем». Меняет место 3-4 раза за день",
    };
  }

  // Осень (сен-ноя)
  if (month >= 9 && month <= 11) {
    if (wt < 4) {
      return {
        depth: "Глубокие ямы с твёрдым дном (глина, песок, ракушка)",
        bait: "Мотыль",
        timeOfDay: "11-15 ч, в тёплый день",
        gear: "Зимняя удочка с мормышкой",
        note: "Близко к спячке — клюёт редко, только в оттепель",
      };
    }
    if (wt < 8) {
      return {
        depth: "Бровки, ямы с твёрдым дном, устья впадающих рек, коряжник на глубине",
        bait: "Животные: мотыль, навозный червь, опарыш, личинка репейника",
        timeOfDay: "11-16 ч, пик в обед",
        gear: "Фидер (3.5-4.2 м, дальние забросы), матчевая снасть",
        note: "Сезон заканчивается — карась на глубине, но клюёт. Избегать мелководья <1.5 м",
      };
    }
    if (wt < 12) {
      return {
        depth: "Бровки рядом со свалами на глубину, ямы с твёрдым дном, устья впадающих рек",
        bait: "Животные: мотыль, червь, опарыш, бутерброд из мотыля и опарыша",
        timeOfDay: "12-16 ч (обед)",
        gear: "Фидер (длинное удилище 3.5-4.2 м), матчевая для точечных забросов",
        note: "Осенний жор — карась активно кормится, накапливая жир к зиме. Стаи и глубина",
      };
    }
    // > 12°C осенью — ещё по-летнему
    return {
      depth: "Бровки, перепады глубин, устья рек, затопленные сооружения",
      bait: "Смешанные: растительные + животные, экспериментировать",
      timeOfDay: "12-17 ч",
      gear: "Поплавочная удочка, фидер",
      note: "Тёплая осень — карась ещё по-летнему активен",
    };
  }

  // Fallback (не должно сработать, но на всякий)
  return {
    depth: "Различные глубины и рельеф дна",
    bait: "Червь, опарыш, перловка, кукуруза",
    timeOfDay: "Утро и вечер",
    gear: "Поплавочная удочка, фидер",
  };
}

// Compute the windSpeed sub-score per species (mirrors scoreForSpecies logic).
function windSpeedSubscore(species: Species, speed: number): number {
  if (species === "сом") return windSpeedScore(speed, 1, 3, 5);
  if (species === "щука") return windSpeedScore(speed, 2, 5, 8);
  if (species === "карась") return windSpeedScore(speed, 1, 4, 7);
  return windSpeedScore(speed, 1, 5, 8); // сазан
}

// Time-of-day sub-score per species. We can't recover minutesFromSunEvent from the
// hour, so we use the already-stored isNight flag plus the hour's local time to
// Best-effort recovery of timeOfDay sub-score (same species-specific logic as forecast.ts).
// Since hour.minutesFromSunEvent is not on the API response, we approximate using
// hour-of-day buckets. The exact Gaussian curve is in forecast.ts; here we bucket by hour.
function timeOfDaySubscore(species: Species, hour: ForecastHour): number {
  const hr = parseInt(hour.time.slice(11, 13), 10);
  const isNight = hour.isNight;

  // Define "dawn/dusk" window: hours 5-8 (morning) or 18-21 (evening) — typical sunrise/sunset ± 1h.
  const isDawn = hr >= 5 && hr <= 8;
  const isDusk = hr >= 18 && hr <= 21;
  const isDawnDusk = isDawn || isDusk;

  if (species === "сом") {
    // Nocturnal: peak at night, decent at dawn/dusk, low mid-day
    if (isNight) return 95;
    if (isDawnDusk) return 80;
    return 25;
  }
  if (species === "щука") {
    // Predator: peak at dawn/dusk, good mid-day (hunts), low at night
    if (isNight) return 25;
    if (isDawnDusk) return 90;
    return 65; // daytime baseline
  }
  // Карась, сазан: peak at dawn/dusk, medium mid-day, low at night
  if (isNight) return 25;
  if (isDawnDusk) return 90;
  return 50; // daytime baseline
}

// Per-factor brief explanation. Uses hour data + species to produce Russian text.
function explainFactor(
  factor: string,
  hour: ForecastHour,
  species: Species,
  subscore: number,
): string {
  switch (factor) {
    case "waterTemp": {
      const wt = hour.waterTemp.toFixed(1);
      const target = species === "карась" ? "нужно 14-16°C"
        : species === "сазан" ? "нужно 22-26°C"
        : species === "сом" ? "нужно 25-28°C"
        : "нужно 10-12°C";
      if (subscore < 25) return `Вода ${wt}°C → ${SPECIES_LABELS[species].toLowerCase()} почти неактивен (${target})`;
      if (subscore < 50) return `Вода ${wt}°C → активность слабая (${target})`;
      if (subscore < 80) return `Вода ${wt}°C → активность средняя (${target})`;
      return `Вода ${wt}°C → комфортная температура`;
    }
    case "pressureTrend":
      return `${hour.pressureTrendLabel} → ${subscore >= 70 ? "рыба адаптирована" : subscore >= 40 ? "рыба насторожена" : "рыба в стрессе"}`;
    case "pressureValue": {
      const p = hour.pressure.toFixed(0);
      if (subscore >= 80) return `Давление ${p} мм — оптимальный диапазон (745-765)`;
      if (subscore >= 60) return `Давление ${p} мм — пониженное, рыба уходит на глубину`;
      if (subscore >= 40) return `Давление ${p} мм — повышенное, клёв слабее днём`;
      return `Давление ${p} мм — экстремальное для рыбы`;
    }
    case "windSpeed": {
      const v = hour.windSpeed.toFixed(1);
      if (subscore >= 80) return `Ветер ${v} м/с → комфортно`;
      if (subscore >= 40) return `Ветер ${v} м/с → терпимо`;
      return `Ветер ${v} м/с → слишком сильный`;
    }
    case "windDirection": {
      const dir = windDirFullLabel(hour.windDir) ?? "—";
      if (subscore >= 80) return `${dir} ветер — тёплый, хороший клёв`;
      if (subscore >= 60) return `${dir} ветер — средний клёв`;
      if (subscore >= 40) return `${dir} ветер — прохладный, средне`;
      return `${dir} ветер — холодный, рыба менее активна`;
    }
    case "timeOfDay": {
      // Species-specific labels based on the new timeOfDay logic
      if (species === "сом") {
        if (subscore >= 80) return "Ночь — пик активности сома";
        if (subscore >= 50) return "Сумерки — сом активен";
        return "День — сом пассивен (прячется в ямах)";
      }
      if (species === "щука") {
        if (subscore >= 85) return "Зорька — пик охоты щуки";
        if (subscore >= 60) return "День — щука продолжает охотиться";
        return "Ночь — щука неактивна (визуальный охотник)";
      }
      // Карась, сазан
      if (subscore >= 85) return "Зорька — пик клёва";
      if (subscore >= 45) return "День — клюёт, но слабее";
      return "Ночь — неактивны";
    }
    case "moonPhase": {
      if (subscore >= 80) return `Лунный день ${hour.lunarDay} → отличный клёв`;
      if (subscore >= 60) return `Лунный день ${hour.lunarDay} → хороший клёв`;
      if (subscore >= 40) return `Лунный день ${hour.lunarDay} → слабый клёв`;
      return `Лунный день ${hour.lunarDay} → плохой клёв`;
    }
    case "cloudCover": {
      const c = Math.round(hour.cloudCover);
      if (subscore >= 80) return `Облачность ${c}% — щука активна при пасмурной погоде`;
      if (subscore >= 50) return `Облачность ${c}% — умеренная активность`;
      return `Облачность ${c}% — малооблачно, щука осторожна`;
    }
    default:
      return "";
  }
}

interface FactorRow {
  factor: string; // internal key
  name: string; // Russian name
  weight: number; // 0..1
  subscore: number; // 0..100
  contribution: number; // subscore × weight
  explanation: string;
}

function buildFactorRows(
  hour: ForecastHour,
  species: Species,
  weights: FishWeights,
): { rows: FactorRow[]; baseScore: number; tempGate: number; finalScore: number } {
  const input = hourToInput(hour);
  const rows: FactorRow[] = [];
  let total = 0;
  let weightSum = 0;
  let waterTempSubscore: number | null = null;

  if (weights.waterTemp) {
    const s = waterTempScore(species, input.waterTemp);
    waterTempSubscore = s;
    rows.push({
      factor: "waterTemp",
      name: FACTOR_NAMES.waterTemp,
      weight: weights.waterTemp,
      subscore: s,
      contribution: s * weights.waterTemp,
      explanation: explainFactor("waterTemp", hour, species, s),
    });
    total += weights.waterTemp * s;
    weightSum += weights.waterTemp;
  }
  if (weights.pressureTrend) {
    const s = pressureTrendScore(input.pressureTrend, species);
    rows.push({
      factor: "pressureTrend",
      name: FACTOR_NAMES.pressureTrend,
      weight: weights.pressureTrend,
      subscore: s,
      contribution: s * weights.pressureTrend,
      explanation: explainFactor("pressureTrend", hour, species, s),
    });
    total += weights.pressureTrend * s;
    weightSum += weights.pressureTrend;
  }
  if (weights.pressureValue) {
    const s = pressureValueScore(input.pressureMmHg);
    rows.push({
      factor: "pressureValue",
      name: FACTOR_NAMES.pressureValue,
      weight: weights.pressureValue,
      subscore: s,
      contribution: s * weights.pressureValue,
      explanation: explainFactor("pressureValue", hour, species, s),
    });
    total += weights.pressureValue * s;
    weightSum += weights.pressureValue;
  }
  if (weights.windSpeed) {
    const s = windSpeedSubscore(species, input.windSpeed);
    rows.push({
      factor: "windSpeed",
      name: FACTOR_NAMES.windSpeed,
      weight: weights.windSpeed,
      subscore: s,
      contribution: s * weights.windSpeed,
      explanation: explainFactor("windSpeed", hour, species, s),
    });
    total += weights.windSpeed * s;
    weightSum += weights.windSpeed;
  }
  if (weights.windDirection) {
    const s = windDirScore(input.windDir, [180, 225, 270]);
    rows.push({
      factor: "windDirection",
      name: FACTOR_NAMES.windDirection,
      weight: weights.windDirection,
      subscore: s,
      contribution: s * weights.windDirection,
      explanation: explainFactor("windDirection", hour, species, s),
    });
    total += weights.windDirection * s;
    weightSum += weights.windDirection;
  }
  if (weights.timeOfDay) {
    const s = timeOfDaySubscore(species, hour);
    rows.push({
      factor: "timeOfDay",
      name: FACTOR_NAMES.timeOfDay,
      weight: weights.timeOfDay,
      subscore: s,
      contribution: s * weights.timeOfDay,
      explanation: explainFactor("timeOfDay", hour, species, s),
    });
    total += weights.timeOfDay * s;
    weightSum += weights.timeOfDay;
  }
  if (weights.moonPhase) {
    const s = moonPhaseScore(input.lunarDay);
    rows.push({
      factor: "moonPhase",
      name: FACTOR_NAMES.moonPhase,
      weight: weights.moonPhase,
      subscore: s,
      contribution: s * weights.moonPhase,
      explanation: explainFactor("moonPhase", hour, species, s),
    });
    total += weights.moonPhase * s;
    weightSum += weights.moonPhase;
  }
  if (weights.cloudCover) {
    const s = cloudCoverScore(input.cloudCover, "overcast");
    rows.push({
      factor: "cloudCover",
      name: FACTOR_NAMES.cloudCover,
      weight: weights.cloudCover,
      subscore: s,
      contribution: s * weights.cloudCover,
      explanation: explainFactor("cloudCover", hour, species, s),
    });
    total += weights.cloudCover * s;
    weightSum += weights.cloudCover;
  }

  const baseScore = weightSum > 0 ? Math.round(total / weightSum) : 0;
  const tempGate = waterTempSubscore != null ? Math.min(1, waterTempSubscore / 50) : 1;
  const finalScore = Math.round(baseScore * tempGate);
  return { rows, baseScore, tempGate, finalScore };
}

export function ScoreBreakdownDialog({
  open,
  onOpenChange,
  hour,
  species,
  weights,
  headerLabel,
  seasonInfo,
}: ScoreBreakdownDialogProps) {
  const breakdown = useMemo(() => {
    if (!hour) return null;
    return buildFactorRows(hour, species, weights);
  }, [hour, species, weights]);

  // Use provided seasonInfo (from API) or compute locally from hour.time + waterTemp.
  const computedSeason = useMemo<SeasonInfo | null>(() => {
    if (!hour) return null;
    if (seasonInfo) return seasonInfo;
    const month = new Date(hour.time + ":00Z").getUTCMonth() + 1;
    return getSeasonStatus(species, month, hour.waterTemp);
  }, [hour, species, seasonInfo]);

  const seasonMult = computedSeason ? seasonModifier(computedSeason.status) : 1.0;

  const finalScore = hour?.scores?.[species] ?? 0;
  const color = biteColor(finalScore);
  const topFactorsList = hour?.topFactors?.[species] ?? [];
  const fishingTips = hour ? getFishingTips(species, hour) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto nice-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Thermometer className="h-4 w-4 text-accent" />
            Почему такая оценка?
          </DialogTitle>
          <DialogDescription>
            Разбор баллов для выбранной рыбы
          </DialogDescription>
        </DialogHeader>

        {!hour || !breakdown ? (
          <div className="text-sm text-muted-foreground">Нет данных</div>
        ) : (
          <div className="space-y-3">
            {/* Season section — at the top so user understands context first */}
            {computedSeason && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <div className="text-xs text-muted-foreground uppercase">Сезон</div>
                <div className="text-sm font-medium">{computedSeason.label}</div>
                <div className="text-xs text-muted-foreground">{computedSeason.description}</div>
                {seasonMult !== 1.0 && (
                  <div className="text-xs">Множитель сезона: ×{seasonMult.toFixed(2)}</div>
                )}
              </div>
            )}

            {/* Fishing tips — рекомендации по лову (пока только для карася) */}
            {fishingTips && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="text-xs font-medium text-primary uppercase flex items-center gap-1.5">
                  <Fish className="h-3.5 w-3.5" /> Рекомендации по лову
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground shrink-0 w-16">Глубина:</span>
                    <span className="text-foreground">{fishingTips.depth}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground shrink-0 w-16">Насадка:</span>
                    <span className="text-foreground">{fishingTips.bait}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground shrink-0 w-16">Время:</span>
                    <span className="text-foreground">{fishingTips.timeOfDay}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground shrink-0 w-16">Снасти:</span>
                    <span className="text-foreground">{fishingTips.gear}</span>
                  </div>
                  {fishingTips.note && (
                    <div className="pt-1.5 mt-1.5 border-t border-primary/20 text-muted-foreground italic">
                      {fishingTips.note}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Title row */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-card">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">
                  {headerLabel ? `${headerLabel} — ` : ""}Оценка клёва
                </span>
                <span className="text-sm font-semibold">{SPECIES_LABELS[species]}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums" style={{ color }}>
                  {finalScore}
                </span>
                <span className="text-xs text-muted-foreground">/ 100</span>
                <span className="text-xs text-muted-foreground ml-2">— {biteLabel(finalScore).toLowerCase()}</span>
              </div>
            </div>

            {/* tempGate warning */}
            {breakdown.tempGate < 1.0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-destructive">
                      Температурный множитель: ×{breakdown.tempGate.toFixed(2)}
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      Рыба физически неактивна при этой температуре воды — оценка снижена принудительно.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Per-factor rows */}
            <div className="space-y-2">
              {breakdown.rows.map((r) => (
                <div key={r.factor} className="rounded-lg border border-border p-2.5 bg-card">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {r.subscore}/100 · вес {Math.round(r.weight * 100)}%
                    </span>
                  </div>
                  {/* Mini bar */}
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${r.subscore}%`, background: biteColor(r.subscore) }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Вклад: {r.contribution.toFixed(1)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
                    {r.explanation}
                  </div>
                </div>
              ))}
            </div>

            {/* Final calculation */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs">
              <div className="font-medium text-primary mb-1">Итоговый расчёт</div>
              <div className="text-muted-foreground">
                Базовая оценка: <span className="font-semibold text-foreground">{breakdown.baseScore}</span>
                {breakdown.tempGate < 1.0 && (
                  <>
                    {" → ×"}{breakdown.tempGate.toFixed(2)} (темп.) = <span className="font-semibold text-foreground">{breakdown.finalScore}</span>
                  </>
                )}
                {seasonMult !== 1.0 && (
                  <div className="mt-1">
                    {"→ ×"}{seasonMult.toFixed(2)} (сезон) = <span className="font-semibold text-foreground">{Math.min(100, Math.round(breakdown.finalScore * seasonMult))}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Top 2 factors */}
            {topFactorsList.length > 0 && (
              <div className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Топ-факторы: </span>
                {topFactorsList.join(", ")}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
