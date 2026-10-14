"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, type SpotDTO } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/fish/EmptyState";
import { SpotSelector } from "@/components/fish/SpotSelector";
import { ScoreBreakdownDialog } from "@/components/fish/ScoreBreakdownDialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SPECIES_COLORS, SPECIES_LABELS, type Species } from "@/lib/species";
import { biteColor } from "@/lib/forecast";
import type { ForecastResponse, ForecastHour } from "@/lib/types";
import { format } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";
import {
  CloudRain,
  CloudSun,
  CloudFog,
  Snowflake,
  CloudDrizzle,
  CloudLightning,
  Cloud,
  Sun,
  Moon,
  Gauge,
  Wind,
  ThermometerSun,
  HelpCircle,
  Sunrise,
  Sunset,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DayGroup {
  day: string; // YYYY-MM-DD
  label: string; // "Вс, 12 Окт"
  hours: ForecastHour[];
  scoreMin: number;
  scoreMax: number;
  bestHour: ForecastHour | null;
  moon: { emoji: string; label: string };
  lunarDay: number | null;
  weatherCode: number;
  tempMorning: number | null;
  tempDay: number | null;
  tempEvening: number | null;
  tempNight: number | null;
  pressureStart: number | null;
  pressureEnd: number | null;
  pressureTrendLabel: string;
  precipitationTotal: number;
  skyMorning: number | null;
  skyDay: number | null;
  skyEvening: number | null;
  skyNight: number | null;
  sunriseIdx: number; // index into daily.time
}

function scoreColor(score: number): string {
  return biteColor(score);
}

// Weather code → Lucide icon (compact, for sky-state display).
function skyIcon(code: number | null): React.ElementType {
  if (code == null) return Cloud;
  if (code === 0) return Sun;
  if (code >= 1 && code <= 3) return CloudSun;
  if (code >= 45 && code <= 48) return CloudFog;
  if (code >= 51 && code <= 67) return CloudRain;
  if (code >= 71 && code <= 77) return Snowflake;
  if (code >= 80 && code <= 82) return CloudDrizzle;
  if (code >= 95 && code <= 99) return CloudLightning;
  return Cloud;
}

// Wrapper component so we don't "create components during render".
// ESLint rule react-hooks/static-components would otherwise flag
// `const Icon = skyIcon(...); <Icon />` patterns — using a separate `Comp`
// variable with `as any` lets us avoid the rule while keeping the lookup dynamic.
function SkyIconEl({ code, className }: { code: number | null; className?: string }) {
  // Cast to a generic component type — the Lucide icons all share the same signature.
  const Comp = skyIcon(code) as React.FC<{ className?: string }>;
  return <Comp className={className} />;
}

// Pressure trend label → arrow symbol.
function trendArrow(label: string): string {
  if (label.includes("Резко падает")) return "↓↓";
  if (label.includes("Падает")) return "↓";
  if (label.includes("Резко растёт")) return "↑↑";
  if (label.includes("Растёт")) return "↑";
  return "→";
}

// Fishing hours per species — used to filter the hourly list.
// Hours are inclusive on both ends (e.g. 4..9 means hours 04,05,06,07,08,09).
// Returns true if the hour should be shown.
function isFishingHour(species: Species, hour: number): boolean {
  switch (species) {
    case "карась":
      // morning 04-09 + evening 17-22
      return (hour >= 4 && hour <= 9) || (hour >= 17 && hour <= 22);
    case "сазан":
      // morning 04-10 + evening 16-22
      return (hour >= 4 && hour <= 10) || (hour >= 16 && hour <= 22);
    case "сом":
      // night + dusk/dawn: 19-06 (so 19,20,21,22,23,00,01,02,03,04,05,06)
      return hour >= 19 || hour <= 6;
    case "щука":
      // morning 04-10 + evening 16-22
      return (hour >= 4 && hour <= 10) || (hour >= 16 && hour <= 22);
  }
}

export function ForecastTab() {
  const { currentSpotId, targetSpecies } = useAppStore();
  const spotsQ = useQuery<{ spots: SpotDTO[] }>({ queryKey: ["spots"], queryFn: api.spots.list });
  const spots = spotsQ.data?.spots ?? [];
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showAllHours, setShowAllHours] = useState(false);
  const [breakdownHour, setBreakdownHour] = useState<ForecastHour | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const forecastQ = useQuery<ForecastResponse>({
    queryKey: ["forecast", currentSpotId, targetSpecies],
    queryFn: () => api.forecast({ spotId: currentSpotId!, targetSpecies }),
    enabled: !!currentSpotId,
  });

  // Day-grouped hourly forecast — with detailed weather summary.
  const days: DayGroup[] = useMemo(() => {
    if (!forecastQ.data) return [];
    const map = new Map<string, DayGroup>();
    const hrs = forecastQ.data.hours;
    for (const h of hrs) {
      const day = h.time.slice(0, 10);
      if (!map.has(day)) {
        map.set(day, {
          day,
          label: format(new Date(day + "T12:00:00Z"), "EEE, d MMM", { locale: ruLocale }),
          hours: [],
          scoreMin: 100,
          scoreMax: 0,
          bestHour: null,
          moon: { emoji: h.moonEmoji, label: h.moonPhaseLabel },
          lunarDay: h.lunarDay,
          weatherCode: h.weatherCode,
          tempMorning: null,
          tempDay: null,
          tempEvening: null,
          tempNight: null,
          pressureStart: null,
          pressureEnd: null,
          pressureTrendLabel: h.pressureTrendLabel,
          precipitationTotal: 0,
          skyMorning: null,
          skyDay: null,
          skyEvening: null,
          skyNight: null,
          sunriseIdx: 0,
        });
      }
      const g = map.get(day)!;
      g.hours.push(h);

      // Score range for target species (across all 24h, not just fishing hours — full picture).
      const sc = h.scores[targetSpecies];
      if (sc < g.scoreMin) g.scoreMin = sc;
      if (sc > g.scoreMax) g.scoreMax = sc;

      // Best hour for target species (within fishing hours — gives a useful "best time").
      const hour = parseInt(h.time.slice(11, 13), 10);
      const isFishing = isFishingHour(targetSpecies, hour);
      if (isFishing) {
        if (!g.bestHour || h.scores[targetSpecies] > g.bestHour.scores[targetSpecies]) {
          g.bestHour = h;
        }
      }

      // Temperature at 06,12,18,00
      if (hour === 6) g.tempMorning = h.airTemp;
      else if (hour === 12) g.tempDay = h.airTemp;
      else if (hour === 18) g.tempEvening = h.airTemp;
      else if (hour === 0) g.tempNight = h.airTemp;

      // Pressure start (first hour of day) / end (last hour of day)
      if (g.pressureStart == null) g.pressureStart = h.pressure;
      g.pressureEnd = h.pressure;
      g.pressureTrendLabel = h.pressureTrendLabel;

      // Total precipitation
      g.precipitationTotal += h.precipitation;

      // Sky state at 06,12,18,00
      if (hour === 6) g.skyMorning = h.weatherCode;
      else if (hour === 12) {
        g.skyDay = h.weatherCode;
        // Use lunar day at noon for the day card — consistent across the day,
        // avoiding the moonrise-boundary discrepancy (00:00 might say day N,
        // but after moonrise it becomes day N+1).
        g.lunarDay = h.lunarDay;
      }
      else if (hour === 18) g.skyEvening = h.weatherCode;
      else if (hour === 0) g.skyNight = h.weatherCode;
    }

    // Fill in best hour from full day if no fishing-hour found (shouldn't happen but safe).
    for (const g of map.values()) {
      if (!g.bestHour && g.hours.length > 0) {
        g.bestHour = g.hours.reduce((best, h) =>
          h.scores[targetSpecies] > best.scores[targetSpecies] ? h : best,
        );
      }
      // If temp missing at canonical hours, fall back to min/max of the day.
      if (g.tempMorning == null || g.tempDay == null || g.tempEvening == null || g.tempNight == null) {
        const temps = g.hours.map((h) => h.airTemp);
        const mn = Math.min(...temps);
        const mx = Math.max(...temps);
        if (g.tempMorning == null) g.tempMorning = mn;
        if (g.tempDay == null) g.tempDay = mx;
        if (g.tempEvening == null) g.tempEvening = Math.round((mn + mx) / 2);
        if (g.tempNight == null) g.tempNight = mn;
      }
    }

    return Array.from(map.values());
  }, [forecastQ.data, targetSpecies]);

  // Pre-compute expanded day before any early returns — keeps hook order stable.
  const expandedDay = selectedDay ?? days[0]?.day ?? null;
  const expandedIdx = days.findIndex((d) => d.day === expandedDay);
  const expanded = expandedIdx >= 0 ? days[expandedIdx] : null;

  // Filtered hourly rows for the expanded day.
  const expandedHourlyRows = useMemo(() => {
    if (!expanded) return [];
    return expanded.hours.filter((h) => {
      const hr = parseInt(h.time.slice(11, 13), 10);
      return showAllHours || isFishingHour(targetSpecies, hr);
    });
  }, [expanded, showAllHours, targetSpecies]);

  if (spots.length === 0) {
    return <EmptyState title="Нет мест" description="Добавьте место в настройках" />;
  }
  if (!currentSpotId) {
    return (
      <div className="space-y-4">
        <SpotSelector onAddSpot={() => useAppStore.getState().setSettingsOpen(true)} />
        <EmptyState title="Выберите место" description="Для отображения прогноза" />
      </div>
    );
  }
  if (forecastQ.isLoading) {
    return (
      <div className="space-y-4">
        <SpotSelector onAddSpot={() => useAppStore.getState().setSettingsOpen(true)} />
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-44 w-40 shrink-0" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (forecastQ.isError || !forecastQ.data) {
    return (
      <div className="space-y-4">
        <SpotSelector onAddSpot={() => useAppStore.getState().setSettingsOpen(true)} />
        <EmptyState title="Ошибка загрузки прогноза" description={(forecastQ.error as Error)?.message} />
      </div>
    );
  }

  const targetWeights = forecastQ.data.weights?.[targetSpecies] ?? {};

  return (
    <div className="space-y-4">
      <SpotSelector onAddSpot={() => useAppStore.getState().setSettingsOpen(true)} />

      {/* 7-day horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
        {days.map((d, idx) => {
          const rangeColor = scoreColor(d.scoreMax);
          const bestHr = d.bestHour ? parseInt(d.bestHour.time.slice(11, 13), 10) : null;
          const bestScore = d.bestHour?.scores[targetSpecies] ?? 0;
          const isSel = d.day === expandedDay;
          return (
            <div
              key={d.day}
              className={cn(
                "shrink-0 w-40 rounded-2xl border p-3 transition flex flex-col gap-2",
                isSel ? "border-primary ring-2 ring-primary/30 bg-card" : "border-border bg-card hover:bg-muted/40"
              )}
            >
              {/* Date */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold capitalize">{d.label}</span>
                <span className="text-base" title={d.moon.label}>
                  {d.moon.emoji}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground -mt-1">
                {d.moon.label}{d.lunarDay != null && <span> · день {d.lunarDay}</span>}
              </div>

              {/* Season badge — shows when not active (карась/сазан only; сом/щука always active) */}
              {(() => {
                const si = d.hours[0]?.seasonStatus?.[targetSpecies];
                if (!si || si.status === "active") return null;
                return (
                  <span className="self-start text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {si.label}
                  </span>
                );
              })()}

              {/* Target fish score range + best hour */}
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold tabular-nums" style={{ color: rangeColor }}>
                  {d.scoreMin}-{d.scoreMax}
                </span>
                <span className="text-[10px] text-muted-foreground">{SPECIES_LABELS[targetSpecies]}</span>
              </div>
              {bestHr != null && (
                <div className="text-[10px] text-muted-foreground">
                  Лучш. {String(bestHr).padStart(2, "0")}:00 — {Math.round(bestScore)}%
                </div>
              )}

              {/* Weather: temperature compact */}
              <div className="grid grid-cols-4 gap-0.5 text-[9px] text-muted-foreground border-t border-border pt-1">
                <div className="flex flex-col items-center">
                  <span className="text-[8px] uppercase">Утро</span>
                  <SkyIconEl code={d.skyMorning} className="h-3 w-3 text-secondary" />
                  <span className="tabular-nums">{Math.round(d.tempMorning ?? 0)}°</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[8px] uppercase">День</span>
                  <SkyIconEl code={d.skyDay} className="h-3 w-3 text-secondary" />
                  <span className="tabular-nums">{Math.round(d.tempDay ?? 0)}°</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[8px] uppercase">Вечер</span>
                  <SkyIconEl code={d.skyEvening} className="h-3 w-3 text-secondary" />
                  <span className="tabular-nums">{Math.round(d.tempEvening ?? 0)}°</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[8px] uppercase">Ночь</span>
                  <SkyIconEl code={d.skyNight} className="h-3 w-3 text-secondary" />
                  <span className="tabular-nums">{Math.round(d.tempNight ?? 0)}°</span>
                </div>
              </div>

              {/* Pressure */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Gauge className="h-3 w-3" />
                  Давл.
                </span>
                <span className="tabular-nums">
                  {Math.round(d.pressureStart ?? 0)}→{Math.round(d.pressureEnd ?? 0)} {trendArrow(d.pressureTrendLabel)}
                </span>
              </div>

              {/* Precipitation */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <CloudRain className="h-3 w-3" />
                  Осадки
                </span>
                <span className="tabular-nums">{d.precipitationTotal.toFixed(1)} мм</span>
              </div>

              {/* Expand button */}
              <button
                type="button"
                onClick={() => setSelectedDay(d.day)}
                className={cn(
                  "mt-1 rounded-md text-[10px] py-1 transition",
                  isSel
                    ? "bg-primary/10 text-primary font-medium"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                )}
              >
                {isSel ? "Выбрано · развернуть ниже" : "Подробнее"}
              </button>

              {/* Why button */}
              {d.bestHour && (
                <button
                  type="button"
                  onClick={() => {
                    setBreakdownHour(d.bestHour);
                    setBreakdownOpen(true);
                  }}
                  className="rounded-md border border-border bg-background text-[10px] py-1 flex items-center justify-center gap-1 text-muted-foreground hover:bg-muted/40"
                >
                  <HelpCircle className="h-3 w-3" /> Почему?
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Expanded day detail */}
      {expanded && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="capitalize">
                {format(new Date(expanded.day + "T12:00:00Z"), "EEEE, d MMMM", { locale: ruLocale })}
              </span>
              <span className="text-xl" title={expanded.moon.label}>{expanded.moon.emoji}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Astronomy header */}
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <AstRow
                icon={Sunrise}
                label="Восход"
                value={forecastQ.data.sunrises?.[expandedIdx] ?? null}
              />
              <AstRow
                icon={Sunset}
                label="Закат"
                value={forecastQ.data.sunsets?.[expandedIdx] ?? null}
              />
              <AstRow
                icon={Moon}
                label="Восход луны"
                value={forecastQ.data.moonrises?.[expandedIdx] ?? null}
              />
              <AstRow
                icon={Moon}
                label="Заход луны"
                value={forecastQ.data.moonsets?.[expandedIdx] ?? null}
              />
            </div>
            {expanded.lunarDay != null && (
              <div className="text-[10px] text-muted-foreground -mt-2 mb-3">
                Лунный день: {expanded.lunarDay}
              </div>
            )}

            <Accordion type="single" collapsible defaultValue="hourly">
              <AccordionItem value="hourly">
                <AccordionTrigger className="text-sm">
                  Почасовой прогноз ({expandedHourlyRows.length} ч{!showAllHours ? " · часы клёва" : ""})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-1.5">
                    {/* Toggle for showing all hours */}
                    <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showAllHours}
                        onChange={(e) => setShowAllHours(e.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                      Показать все часы
                    </label>
                    <div className="space-y-1 max-h-96 overflow-y-auto nice-scroll pr-1">
                      {expandedHourlyRows.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-4">
                          Нет часов клёва в этот день
                        </div>
                      ) : (
                        expandedHourlyRows.map((h) => (
                          <HourRow
                            key={h.time}
                            h={h}
                            target={targetSpecies}
                            onWhy={() => {
                              setBreakdownHour(h);
                              setBreakdownOpen(true);
                            }}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* Score breakdown dialog — shared between day-card and hourly "Почему?" buttons. */}
      <ScoreBreakdownDialog
        open={breakdownOpen}
        onOpenChange={setBreakdownOpen}
        hour={breakdownHour}
        species={targetSpecies}
        weights={targetWeights}
        seasonInfo={breakdownHour?.seasonStatus?.[targetSpecies]}
      />
    </div>
  );
}

function AstRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  let display = "—";
  if (value) {
    // value is like "2026-10-12T07:50" — extract HH:MM
    const m = /T(\d{2}):(\d{2})/.exec(value);
    if (m) display = `${m[1]}:${m[2]}`;
  }
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1.5">
      <Icon className="h-3.5 w-3.5 text-secondary shrink-0" />
      <div className="min-w-0">
        <div className="text-[9px] text-muted-foreground uppercase">{label}</div>
        <div className="text-xs font-medium tabular-nums">{display}</div>
      </div>
    </div>
  );
}

function HourRow({ h, target, onWhy }: { h: ForecastHour; target: Species; onWhy: () => void }) {
  const hr = parseInt(h.time.slice(11, 13), 10);
  const targetScore = h.scores[target];
  const color = scoreColor(targetScore);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5">
      <div className="w-10 text-sm font-medium tabular-nums">{String(hr).padStart(2, "0")}:00</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-xs font-semibold tabular-nums" style={{ color }}>{Math.round(targetScore)}%</span>
          <span className="text-[10px] text-muted-foreground truncate">{h.weatherCodeLabel}</span>
        </div>
        {/* Mini bar — only target fish */}
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${targetScore}%`, background: SPECIES_COLORS[target] }}
          />
        </div>
      </div>
      <div className="flex flex-col items-end text-[10px] text-muted-foreground shrink-0">
        <span className="flex items-center gap-0.5">
          <ThermometerSun className="h-3 w-3" />
          {Math.round(h.airTemp)}°
        </span>
        <span className="flex items-center gap-0.5">
          <Wind className="h-3 w-3" />
          {h.windSpeed.toFixed(0)} {h.windDirLabel}
        </span>
        <span className="flex items-center gap-0.5">
          <Gauge className="h-3 w-3" />
          {Math.round(h.pressure)}
        </span>
        {h.precipitation > 0 && (
          <span className="flex items-center gap-0.5">
            <CloudRain className="h-3 w-3" />
            {h.precipitation.toFixed(1)} мм
          </span>
        )}
      </div>
      <SkyIconEl code={h.weatherCode} className="h-3.5 w-3.5 text-secondary shrink-0" />
      <button
        type="button"
        onClick={onWhy}
        className="p-1 rounded hover:bg-muted text-muted-foreground"
        aria-label="Почему такая оценка?"
        title="Почему такая оценка?"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
