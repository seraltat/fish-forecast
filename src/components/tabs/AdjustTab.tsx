"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, type SpotDTO } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/fish/EmptyState";
import { SpotSelector } from "@/components/fish/SpotSelector";
import { ScoreGauge } from "@/components/fish/ScoreGauge";
import { FishChips } from "@/components/fish/FishChips";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Clock,
  Gauge,
  Info,
  SlidersHorizontal,
  Square,
  ThermometerSun,
  Wind,
  Play,
  Save,
} from "lucide-react";
import { format } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";
import type { ForecastResponse } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { SPECIES_LABELS } from "@/lib/species";

const COMPASS = [
  { val: "-1", label: "Авто (по прогнозу)" },
  { val: "0", label: "С" },
  { val: "45", label: "СВ" },
  { val: "90", label: "В" },
  { val: "135", label: "ЮВ" },
  { val: "180", label: "Ю" },
  { val: "225", label: "ЮЗ" },
  { val: "270", label: "З" },
  { val: "315", label: "СЗ" },
];

const SESSION_HINT =
  "Сессия — ваша рыбалка на этом месте. Уловы, записанные после, привяжутся к ней для аналитики «прогноз vs факт».";

const AUTO_RECALC_DEBOUNCE_MS = 500;

export function AdjustTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const {
    currentSpotId,
    currentSessionId,
    setCurrentSessionId,
    overrideWaterTemp,
    overrideWindDir,
    overrideWindSpeed,
    overridePressure,
    setOverrides,
    targetSpecies,
    setTargetSpecies,
  } = useAppStore();

  // Local mirror so user can edit before pressing "пересчитать"
  const [localWater, setLocalWater] = useState<string>(overrideWaterTemp != null ? String(overrideWaterTemp) : "");
  const [localWindDir, setLocalWindDir] = useState<string>(overrideWindDir != null ? String(overrideWindDir) : "-1");
  const [localWindSpeed, setLocalWindSpeed] = useState<string>(overrideWindSpeed != null ? String(overrideWindSpeed) : "");
  const [localPressure, setLocalPressure] = useState<string>(overridePressure != null ? String(overridePressure) : "");

  // Live clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const sessionsQ = useQuery({ queryKey: ["active-sessions"], queryFn: () => api.sessions.list(true), refetchInterval: 30000 });

  // Parse locals into override values (null = "auto").
  const parseOverrides = () => {
    const wt = localWater.trim() ? parseFloat(localWater) : null;
    const wd = localWindDir && localWindDir !== "-1" ? parseInt(localWindDir, 10) : null;
    const ws = localWindSpeed.trim() ? parseFloat(localWindSpeed) : null;
    const pr = localPressure.trim() ? parseFloat(localPressure) : null;
    return {
      waterTemp: Number.isNaN(wt as number) ? null : wt,
      windDir: Number.isNaN(wd as number) ? null : wd,
      windSpeed: Number.isNaN(ws as number) ? null : ws,
      pressure: Number.isNaN(pr as number) ? null : pr,
    };
  };

  // Core apply function — silent=true skips the toast (used by auto-recalc).
  const applyOverrides = (silent = false) => {
    const o = parseOverrides();
    setOverrides(o);
    qc.invalidateQueries({ queryKey: ["forecast"] });
    if (!silent) toast({ title: "Прогноз пересчитан" });
    // If active session — sync to server
    if (currentSessionId) {
      api.sessions.update(currentSessionId, o).catch(() => {});
    }
  };

  // Auto-recalc on field change with debounce. Only fires when at least one
  // field actually differs from the currently-applied store state.
  const firstRunRef = useRef(true);
  useEffect(() => {
    // Skip the initial mount — we don't want to invalidate on first render.
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    const o = parseOverrides();
    const differs =
      o.waterTemp !== overrideWaterTemp ||
      o.windDir !== overrideWindDir ||
      o.windSpeed !== overrideWindSpeed ||
      o.pressure !== overridePressure;
    if (!differs) return;
    const t = setTimeout(() => {
      setOverrides(o);
      qc.invalidateQueries({ queryKey: ["forecast"] });
      if (currentSessionId) {
        api.sessions.update(currentSessionId, o).catch(() => {});
      }
    }, AUTO_RECALC_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [localWater, localWindDir, localWindSpeed, localPressure]);

  // Scroll result section into view when overrides transition from empty
  // to non-empty (e.g., first time user types).
  const resultRef = useRef<HTMLDivElement | null>(null);
  const hadResultRef = useRef(false);
  const hasAnyOverride =
    overrideWaterTemp != null ||
    overrideWindDir != null ||
    overrideWindSpeed != null ||
    overridePressure != null;
  useEffect(() => {
    if (hasAnyOverride && !hadResultRef.current && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      hadResultRef.current = true;
    } else if (!hasAnyOverride) {
      hadResultRef.current = false;
    }
  }, [hasAnyOverride]);

  const startSession = useMutation({
    mutationFn: () =>
      api.sessions.create({
        spotId: currentSpotId!,
        waterTemp: localWater.trim() ? parseFloat(localWater) : null,
        windDirOverride: localWindDir && localWindDir !== "-1" ? parseInt(localWindDir, 10) : null,
        windSpeedOverride: localWindSpeed.trim() ? parseFloat(localWindSpeed) : null,
        pressureOverride: localPressure.trim() ? parseFloat(localPressure) : null,
      }),
    onSuccess: (data) => {
      setCurrentSessionId(data.session.id);
      toast({ title: "Сессия начата" });
      qc.invalidateQueries({ queryKey: ["active-sessions"] });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const endSession = useMutation({
    mutationFn: () => api.sessions.end(currentSessionId!),
    onSuccess: () => {
      setCurrentSessionId(null);
      toast({ title: "Сессия завершена" });
      qc.invalidateQueries({ queryKey: ["active-sessions"] });
    },
  });

  const spotsQ = useQuery<{ spots: SpotDTO[] }>({ queryKey: ["spots"], queryFn: api.spots.list });
  const spot = spotsQ.data?.spots.find((s) => s.id === currentSpotId) ?? null;

  // Forecast with overrides
  const forecastQ = useQuery<ForecastResponse>({
    queryKey: ["forecast", currentSpotId, targetSpecies, overrideWaterTemp, overrideWindDir, overrideWindSpeed, overridePressure],
    queryFn: () =>
      api.forecast({
        spotId: currentSpotId!,
        targetSpecies,
        waterTempOverride: overrideWaterTemp,
        windDirOverride: overrideWindDir,
        windSpeedOverride: overrideWindSpeed,
        pressureOverride: overridePressure,
      }),
    enabled: !!currentSpotId,
  });

  if (spotsQ.data && spotsQ.data.spots.length === 0) {
    return <EmptyState title="Нет мест" description="Добавьте место в настройках" />;
  }
  if (!currentSpotId || !spot) {
    return (
      <div className="space-y-4">
        <SpotSelector onAddSpot={() => useAppStore.getState().setSettingsOpen(true)} />
        <EmptyState title="Выберите место" />
      </div>
    );
  }

  // Get current hour + next 6 hours.
  // Forecast hours use spot's local time strings, but server's Date.now() is UTC.
  // Compute spot-local "now" using the utcOffsetSeconds from the API response.
  const offsetMs = (forecastQ.data?.utcOffsetSeconds ?? 0) * 1000;
  const nowHourStr = new Date(Date.now() + offsetMs).toISOString().slice(0, 13);
  const allHours = forecastQ.data?.hours ?? [];
  const currentIdx = allHours.findIndex((h) => h.time.slice(0, 13) === nowHourStr);
  const nextHours = currentIdx >= 0 ? allHours.slice(currentIdx, currentIdx + 7) : [];
  const currentHour = nextHours[0];

  return (
    <div className="space-y-4">
      <SpotSelector onAddSpot={() => useAppStore.getState().setSettingsOpen(true)} />

      {/* Spot + live clock */}
      <Card className="border-border">
        <CardContent className="flex items-center justify-between py-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase">Место</span>
            <span className="font-semibold">{spot.name}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-muted-foreground uppercase">Сейчас</span>
            <span className="font-semibold tabular-nums flex items-center gap-1">
              <Clock className="h-4 w-4 text-secondary" />
              {format(now, "HH:mm")}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" /> Корректировка на месте
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="water">Температура воды (°C)</Label>
            <Input
              id="water"
              inputMode="decimal"
              value={localWater}
              onChange={(e) => setLocalWater(e.target.value)}
              placeholder="Измерьте термометром"
            />
            <p className="text-[10px] text-muted-foreground">Без ввода — оценка по температуре воздуха за 3 дня.</p>
          </div>

          <div className="space-y-1">
            <Label>Направление ветра</Label>
            <Select value={localWindDir} onValueChange={setLocalWindDir}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPASS.map((c) => (
                  <SelectItem key={c.val} value={c.val}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="wspeed">Скорость ветра (м/с)</Label>
              <Input id="wspeed" inputMode="decimal" value={localWindSpeed} onChange={(e) => setLocalWindSpeed(e.target.value)} placeholder="напр. 3" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="press">Давление (мм)</Label>
              <Input id="press" inputMode="decimal" value={localPressure} onChange={(e) => setLocalPressure(e.target.value)} placeholder="напр. 750" />
            </div>
          </div>

          <Button className="w-full h-11" onClick={() => applyOverrides(false)}>
            <Save className="h-4 w-4 mr-1" /> Пересчитать прогноз
          </Button>
          <p className="text-[10px] text-muted-foreground text-center -mt-1">
            Прогноз также пересчитывается автоматически при изменении полей.
          </p>

          {currentSessionId ? (
            <div className="space-y-2">
              <Alert className="bg-secondary/10 border-secondary/40">
                <Square className="h-4 w-4 text-secondary" />
                <AlertTitle className="text-sm">Сессия активна</AlertTitle>
                <AlertDescription className="text-xs">Коррективы сохраняются автоматически.</AlertDescription>
              </Alert>
              <Button variant="destructive" className="w-full h-11" onClick={() => endSession.mutate()} disabled={endSession.isPending}>
                Завершить сессию
              </Button>
              <Button variant="outline" className="w-full h-11" onClick={() => useAppStore.getState().setActiveTab("diary")}>
                Записать улов
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Button variant="secondary" className="w-full h-11" onClick={() => startSession.mutate()} disabled={startSession.isPending}>
                <Play className="h-4 w-4 mr-1" /> Начать сессию
              </Button>
              <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Что такое сессия"
                        className="shrink-0 mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px] text-left leading-snug">
                      {SESSION_HINT}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className="leading-snug">{SESSION_HINT}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recalculated score */}
      <div ref={resultRef}>
        {forecastQ.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : forecastQ.isError ? (
          <EmptyState title="Ошибка прогноза" description={(forecastQ.error as Error)?.message} />
        ) : currentHour ? (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" />
                Пересчитанная оценка — {SPECIES_LABELS[targetSpecies]}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 pt-0">
              {(() => {
                const si = currentHour.seasonStatus?.[targetSpecies];
                const score = currentHour.scores[targetSpecies];
                const seasonLabelForGauge =
                  si && score === 0 && (si.status === "off_season" || si.status === "spawning")
                    ? si.label
                    : undefined;
                return (
                  <>
                    <ScoreGauge
                      value={score}
                      size={180}
                      label="из 100"
                      sublabel={currentHour.isNight ? "ночь" : "день"}
                      seasonLabel={seasonLabelForGauge}
                    />
                    {si && si.status !== "active" && (
                      <div className="text-xs text-center text-muted-foreground">
                        {si.label} — {si.description}
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="w-full">
                <FishChips
                  scores={currentHour.scores}
                  seasonStatus={currentHour.seasonStatus}
                  target={targetSpecies}
                  onSelect={setTargetSpecies}
                  size="sm"
                />
              </div>
              <div className="w-full grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <ThermometerSun className="h-4 w-4 mx-auto text-accent" />
                  <div className="text-muted-foreground">
                    {forecastQ.data?.waterTempSource === "override"
                      ? "Температура воды"
                      : "Оценка t° воды"}
                  </div>
                  <div className="font-semibold">{Math.round(currentHour.waterTemp)}°C</div>
                  {forecastQ.data?.waterTempSST != null && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      SST залива: {forecastQ.data.waterTempSST.toFixed(1)}°C
                    </div>
                  )}
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <Wind className="h-4 w-4 mx-auto text-secondary" />
                  <div className="text-muted-foreground">Ветер</div>
                  <div className="font-semibold">{currentHour.windSpeed.toFixed(1)} {currentHour.windDirLabel}</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <Gauge className="h-4 w-4 mx-auto text-primary" />
                  <div className="text-muted-foreground">Давление</div>
                  <div className="font-semibold">{currentHour.pressure}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Next 6 hours preview */}
      {nextHours.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ближайшие часы</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-7 gap-1">
              {nextHours.map((h) => {
                const hr = parseInt(h.time.slice(11, 13), 10);
                const s = h.scores[targetSpecies];
                const color = s >= 70 ? "#2d5a3d" : s >= 40 ? "#d97706" : "#b91c1c";
                return (
                  <div key={h.time} className="flex flex-col items-center text-center">
                    <span className="text-[10px] text-muted-foreground">{String(hr).padStart(2, "0")}</span>
                    <div
                      className="w-full aspect-square rounded-md flex items-center justify-center text-white text-xs font-bold tabular-nums"
                      style={{ background: color }}
                    >
                      {Math.round(s)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
