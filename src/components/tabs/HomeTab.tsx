"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api, type SpotDTO } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreGauge } from "@/components/fish/ScoreGauge";
import { FishChips } from "@/components/fish/FishChips";
import { EmptyState } from "@/components/fish/EmptyState";
import { SpotSelector } from "@/components/fish/SpotSelector";
import { ScoreBreakdownDialog } from "@/components/fish/ScoreBreakdownDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  MapPin,
  Moon,
  SlidersHorizontal,
  ThermometerSun,
  Wind,
  Gauge,
  Fish,
  Sunrise,
  Sunset,
  HelpCircle,
  Info,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { format } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";
import { ALL_SPECIES, SPECIES_LABELS, SPECIES_COLORS } from "@/lib/species";
import { biteLabel } from "@/lib/forecast";
import type { ForecastResponse } from "@/lib/types";

export function HomeTab() {
  const { currentSpotId, targetSpecies, setTargetSpecies, setActiveTab, currentSessionId } = useAppStore();
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  // Spot-local clock — updates every minute so user sees the current time.
  // Without this, time-of-day sensitive UI is static between navigations.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const spotsQ = useQuery<{ spots: SpotDTO[] }>({ queryKey: ["spots"], queryFn: api.spots.list });
  const spots = spotsQ.data?.spots ?? [];
  const spot = spots.find((s) => s.id === currentSpotId) ?? null;

  const forecastQ = useQuery<ForecastResponse>({
    queryKey: ["forecast", currentSpotId, targetSpecies],
    queryFn: () => api.forecast({ spotId: currentSpotId!, targetSpecies }),
    enabled: !!currentSpotId,
    staleTime: 30 * 60 * 1000, // 30 min cache
  });

  const todayHours = useMemo(() => {
    if (!forecastQ.data) return [];
    // "Today" at the spot's local timezone (not server's UTC).
    const offsetMs = (forecastQ.data.utcOffsetSeconds ?? 0) * 1000;
    const localNow = new Date(Date.now() + offsetMs);
    const todayStr = localNow.toISOString().slice(0, 10);
    return forecastQ.data.hours.filter((h) => h.time.slice(0, 10) === todayStr);
  }, [forecastQ.data]);

  const currentHour = useMemo(() => {
    if (!forecastQ.data) return null;
    // Forecast hours are in spot's local time (e.g. "2026-10-12T00:00" for UTC+10 spot).
    // Server's Date.now() is in UTC. To match, we need to compute "now" in the spot's
    // local time: localNow = utcNow + offset.
    const offsetMs = (forecastQ.data.utcOffsetSeconds ?? 0) * 1000;
    const localNow = new Date(Date.now() + offsetMs);
    const nowStr = localNow.toISOString().slice(0, 13); // YYYY-MM-DDTHH
    return forecastQ.data.hours.find((h) => h.time.slice(0, 13) === nowStr) ?? null;
  }, [forecastQ.data]);

  // Spot-local "now" — used to display date + day of week + current time.
  // date-fns `format` with ru locale gives lowercase day of week (e.g. "понедельник").
  const todayDateStr = useMemo(() => {
    const offsetMs = (forecastQ.data?.utcOffsetSeconds ?? 0) * 1000;
    const localNow = new Date(Date.now() + offsetMs);
    return format(localNow, "d MMMM yyyy, EEEE", { locale: ruLocale });
    // nowTick forces re-evaluation every minute (so the HH:mm suffix stays current).
  }, [forecastQ.data, nowTick]);

  const currentTimeStr = useMemo(() => {
    const offsetMs = (forecastQ.data?.utcOffsetSeconds ?? 0) * 1000;
    const localNow = new Date(Date.now() + offsetMs);
    const hh = String(localNow.getUTCHours()).padStart(2, "0");
    const mm = String(localNow.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }, [forecastQ.data, nowTick]);

  if (spots.length === 0) {
    return (
      <div className="space-y-4">
        <SpotSelector onAddSpot={() => useAppStore.getState().setSettingsOpen(true)} showAddButton={false} />
      </div>
    );
  }

  if (!currentSpotId || !spot) {
    return (
      <div className="space-y-4">
        <SpotSelector onAddSpot={() => useAppStore.getState().setSettingsOpen(true)} />
        <EmptyState
          icon={MapPin}
          title="Выберите место"
          description="Выберите рыболовное место, чтобы увидеть прогноз клёва"
        />
      </div>
    );
  }

  if (forecastQ.isLoading) {
    return <HomeSkeleton />;
  }

  if (forecastQ.isError || !forecastQ.data) {
    return (
      <div className="space-y-4">
        <SpotSelector onAddSpot={() => useAppStore.getState().setSettingsOpen(true)} />
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить прогноз</AlertTitle>
          <AlertDescription>{(forecastQ.error as Error)?.message ?? "Проверьте интернет и попробуйте снова"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const targetScore = currentHour?.scores?.[targetSpecies] ?? 0;
  const enabledSpecies = forecastQ.data.enabledSpecies ?? ALL_SPECIES;
  const targetWeights = forecastQ.data.weights?.[targetSpecies];
  const targetSeasonInfo = currentHour?.seasonStatus?.[targetSpecies];

  // Show alert banner for any non-active season status on target species (карась/сазан only —
  // сом/щука always "active"). Also covers off_season/spawning (informative, not just warning).
  const showSeasonAlert = targetSeasonInfo && targetSeasonInfo.status !== "active";

  // ScoreGauge seasonLabel: show only when score is 0 AND status is off_season/spawning (suppressed).
  const gaugeSeasonLabel =
    targetSeasonInfo &&
    targetScore === 0 &&
    (targetSeasonInfo.status === "off_season" || targetSeasonInfo.status === "spawning")
      ? targetSeasonInfo.label
      : undefined;

  // Top 3 hours by target score
  const top3 = [...todayHours].sort((a, b) => b.scores[targetSpecies] - a.scores[targetSpecies]).slice(0, 3);

  const waterTempSource = forecastQ.data.waterTempSource;
  const waterTempSST = forecastQ.data.waterTempSST;
  const waterTemp = currentHour?.waterTemp ?? forecastQ.data.waterTempEstimate;

  // Chart data for today (24h)
  const chartData = todayHours.map((h) => {
    const hr = parseInt(h.time.slice(11, 13), 10);
    return {
      hour: hr,
      score: h.scores[targetSpecies],
      [targetSpecies]: h.scores[targetSpecies],
    };
  });

  const moon = currentHour?.moonEmoji ?? "🌑";
  const lunarDay = currentHour?.lunarDay ?? null;

  return (
    <div className="space-y-4">
      <SpotSelector onAddSpot={() => useAppStore.getState().setSettingsOpen(true)} />

      {/* Date + moon + current time */}
      <div className="flex items-center justify-between rounded-xl bg-card border border-border p-3">
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">Сегодня</span>
          <span className="text-base font-semibold capitalize">
            {todayDateStr} · {currentTimeStr}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Moon className="h-5 w-5 text-secondary" />
          <div className="flex flex-col items-end">
            <span className="text-xl leading-none">{moon}</span>
            <span className="text-[10px] text-muted-foreground">
              {currentHour?.moonPhaseLabel ?? "—"}
              {lunarDay != null && <span className="ml-1">· день {lunarDay}</span>}
            </span>
          </div>
        </div>
      </div>

      {/* Gauge */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-5 w-5 text-primary" />
            Оценка клёва — {SPECIES_LABELS[targetSpecies]}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 pt-0">
          {showSeasonAlert && targetSeasonInfo && (
            <Alert className="w-full bg-accent/10 border-accent/40">
              <Info className="h-4 w-4 text-accent" />
              <AlertTitle>{targetSeasonInfo.label}</AlertTitle>
              <AlertDescription>{targetSeasonInfo.description}</AlertDescription>
            </Alert>
          )}

          <ScoreGauge
            value={targetScore}
            label="из 100"
            sublabel={biteLabel(targetScore).toLowerCase()}
            seasonLabel={gaugeSeasonLabel}
          />

          {/* "Почему такая оценка?" button — opens breakdown dialog for current hour */}
          {currentHour && (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-10"
              onClick={() => setBreakdownOpen(true)}
            >
              <HelpCircle className="h-4 w-4 mr-1.5" />
              Почему такая оценка?
            </Button>
          )}

          {/* Fish chips */}
          <div className="w-full">
            <FishChips
              scores={currentHour?.scores ?? { карась: 0, сазан: 0, сом: 0, щука: 0 }}
              seasonStatus={currentHour?.seasonStatus}
              enabledSpecies={enabledSpecies}
              target={targetSpecies}
              onSelect={(s) => setTargetSpecies(s)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Conditions */}
      {currentHour && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ThermometerSun className="h-5 w-5 text-accent" /> Условия сейчас
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <Cond icon={ThermometerSun} label="Воздух" value={`${Math.round(currentHour.airTemp)}°C`} />
            <Cond
              icon={ThermometerSun}
              label={
                waterTempSource === "override"
                  ? "Температура воды"
                  : "Оценка температуры воды"
              }
              value={`${Math.round(waterTemp)}°C`}
              hint={
                waterTempSource === "override"
                  ? "ручной ввод"
                  : waterTempSST != null
                    ? `по воздуху 3 дня · SST залива: ${waterTempSST.toFixed(1)}°C`
                    : "по воздуху 3 дня"
              }
            />
            <Cond icon={Wind} label="Ветер" value={`${currentHour.windSpeed.toFixed(1)} м/с ${currentHour.windDirLabel}`} />
            <Cond icon={Gauge} label="Давление" value={`${currentHour.pressure} мм`} hint={currentHour.pressureTrendLabel} />
            <Cond icon={Fish} label="Погода" value={currentHour.weatherCodeLabel} />
            <Cond icon={Sunrise} label="Осадки" value={`${currentHour.precipitation.toFixed(1)} мм`} />
          </CardContent>
        </Card>
      )}

      {/* Top hours */}
      {top3.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" /> Лучшее время сегодня
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {top3.map((h, i) => {
              const hr = parseInt(h.time.slice(11, 13), 10);
              return (
                <div key={h.time} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={i === 0 ? "default" : "secondary"}>{i + 1}</Badge>
                    <span className="font-medium">{String(hr).padStart(2, "0")}:00–{String((hr + 1) % 24).padStart(2, "0")}:00</span>
                  </div>
                  <span className="text-primary font-semibold">{Math.round(h.scores[targetSpecies])}%</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* 24h chart */}
      {chartData.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Прогноз клёва — 24 часа</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" opacity={0.4} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `${v}ч`} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`${Math.round(v)}%`, SPECIES_LABELS[targetSpecies]]}
                    labelFormatter={(v) => `${v}:00`}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={SPECIES_COLORS[targetSpecies]}
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick action */}
      <Button
        className="w-full h-12 text-base"
        onClick={() => setActiveTab("adjust")}
        variant={currentSessionId ? "secondary" : "default"}
      >
        <SlidersHorizontal className="h-5 w-5 mr-2" />
        {currentSessionId ? "Сессия активна — изменить коррективы" : "Я на месте — внести коррективы"}
      </Button>

      {/* Score breakdown dialog */}
      <ScoreBreakdownDialog
        open={breakdownOpen}
        onOpenChange={setBreakdownOpen}
        hour={currentHour}
        species={targetSpecies}
        weights={targetWeights ?? {}}
        seasonInfo={targetSeasonInfo}
        headerLabel="Сегодня"
      />
    </div>
  );
}

function Cond({ icon: Icon, label, value, hint }: { icon: React.ElementType; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-2">
      <Icon className="h-4 w-4 text-secondary shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
        <div className="text-sm font-medium truncate">{value}</div>
        {hint && <div className="text-[9px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-16 w-full" />
      <div className="flex flex-col items-center">
        <Skeleton className="h-48 w-48 rounded-full" />
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
}
