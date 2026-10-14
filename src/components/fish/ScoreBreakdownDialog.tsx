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
import { AlertTriangle, Thermometer } from "lucide-react";

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
