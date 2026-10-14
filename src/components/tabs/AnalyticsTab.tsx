"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SpotDTO } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/fish/EmptyState";
import { SPECIES_COLORS, SPECIES_LABELS, type Species } from "@/lib/species";
import type { FishWeights } from "@/lib/forecast";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Lightbulb, TrendingUp, Activity, MapPin, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AnalyticsData {
  totalCatches: number;
  spotId: string | null;
  relevantSpecies: Species[];
  countPerSpecies: Record<Species, number>;
  histogram: Record<Species, { bucket: string; count: number }[]>;
  hitRate: Record<Species, { hits: number; total: number; rate: number }>;
  suggestions: { species: Species; text: string; weightKey: keyof FishWeights; delta: number; current: number }[];
}

export function AnalyticsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [spotId, setSpotId] = useState<string>("");

  // Spots list for the filter dropdown.
  const spotsQ = useQuery<{ spots: SpotDTO[] }>({ queryKey: ["spots"], queryFn: api.spots.list });
  const spots = spotsQ.data?.spots ?? [];

  const q = useQuery<AnalyticsData>({
    queryKey: ["analytics", spotId || "all"],
    queryFn: () => api.analytics(spotId || undefined) as Promise<AnalyticsData>,
  });

  const selectedSpot = spotId ? spots.find((s) => s.id === spotId) : null;
  const headerLabel = selectedSpot ? `Аналитика — ${selectedSpot.name}` : "Аналитика — Все места";

  if (spotsQ.isLoading || q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return <EmptyState title="Ошибка" description={(q.error as Error)?.message} />;
  }

  if (q.data.totalCatches === 0) {
    return (
      <div className="space-y-4">
        <SpotFilter spots={spots} value={spotId} onChange={setSpotId} headerLabel={headerLabel} />
        <EmptyState
          icon={BarChart3}
          title="Нет данных для аналитики"
          description="Запишите хотя бы несколько уловов — и здесь появится сравнение прогноза с фактом"
        />
      </div>
    );
  }

  const { totalCatches, relevantSpecies, countPerSpecies, histogram, hitRate, suggestions } = q.data;

  const countData = relevantSpecies.map((s) => ({
    species: SPECIES_LABELS[s],
    count: countPerSpecies[s] ?? 0,
    color: SPECIES_COLORS[s],
  }));

  return (
    <div className="space-y-4">
      <SpotFilter spots={spots} value={spotId} onChange={setSpotId} headerLabel={headerLabel} />

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> Всего уловов</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-primary">{totalCatches}</div>
          <div className="text-xs text-muted-foreground">по {relevantSpecies.length} видам</div>
          <div className="h-44 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" opacity={0.4} />
                <XAxis dataKey="species" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {countData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Hit rate per species */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-5 w-5 text-secondary" /> Точность прогноза</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {relevantSpecies.map((sp) => {
            const hr = hitRate[sp];
            return (
              <div key={sp} className="rounded-lg bg-muted/40 p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{SPECIES_LABELS[sp]}</span>
                  <span className="text-sm font-semibold" style={{ color: SPECIES_COLORS[sp] }}>
                    {hr.total > 0 ? `${Math.round(hr.rate * 100)}%` : "—"}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {hr.total > 0
                    ? `Из ${hr.total} дн. с уловами — в ${hr.hits} прогноз был >60% (${hr.hits}/${hr.total})`
                    : "Недостаточно данных"}
                </div>
              </div>
            );
          })}
          {relevantSpecies.length === 0 && (
            <div className="text-sm text-muted-foreground">Нет данных по видам для выбранного места.</div>
          )}
        </CardContent>
      </Card>

      {/* Histogram per species */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Распределение уловов по прогнозу</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {relevantSpecies.map((sp) => {
            const h = histogram[sp];
            if (!h) return null;
            const total = h.reduce((s, b) => s + b.count, 0);
            if (total === 0) return null;
            return (
              <div key={sp} className="space-y-1">
                <div className="text-xs font-medium flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: SPECIES_COLORS[sp] }} />
                  {SPECIES_LABELS[sp]}
                </div>
                <div className="flex items-end gap-0.5 h-12">
                  {h.map((b) => (
                    <div key={b.bucket} className="flex-1 flex flex-col items-center justify-end">
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${(b.count / Math.max(1, Math.max(...h.map((x) => x.count)))) * 100}%`,
                          background: SPECIES_COLORS[sp],
                          minHeight: b.count > 0 ? 4 : 0,
                        }}
                        title={`${b.bucket}: ${b.count}`}
                      />
                      <div className="text-[8px] text-muted-foreground mt-0.5">{b.bucket}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {relevantSpecies.length === 0 && (
            <div className="text-sm text-muted-foreground">Нет данных для отображения.</div>
          )}
        </CardContent>
      </Card>

      {/* Suggestions */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Lightbulb className="h-5 w-5 text-accent" /> Рекомендации</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {suggestions.map((s, i) => (
            <div key={i} className="rounded-lg bg-accent/10 border border-accent/30 p-3 text-sm">
              <p className="text-foreground">{s.text}</p>
              {s.delta !== 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-8 text-xs"
                    >
                      Применить
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Применить корректировку веса?</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <span className="block">
                          Фактор «{factorNameRu(s.weightKey)}» для {SPECIES_LABELS[s.species]}:
                        </span>
                        <span className="block font-mono">
                          {s.current.toFixed(2)} → {(Math.max(0, Math.min(1, s.current + s.delta))).toFixed(2)}
                          {" "}
                          ({s.delta > 0 ? "+" : ""}{s.delta.toFixed(2)})
                        </span>
                        <span className="block text-muted-foreground text-xs">
                          ⚠️ Изменение необратимо. Применяйте только если ваши данные в Дневнике реальные,
                          а не тестовые. Для отмены используйте «Сбросить к стандартным весам» ниже.
                        </span>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            const r = await fetch("/api/fish-config");
                            const data = await r.json() as { configs: Array<{ id: string; species: string; weightsJson: string }> };
                            const cfg = data.configs.find((c) => c.species === s.species);
                            if (!cfg) throw new Error("Конфиг не найден");
                            const weights = JSON.parse(cfg.weightsJson) as FishWeights;
                            const key = s.weightKey;
                            const cur = (weights[key] as number | undefined) ?? 0;
                            const next = Math.max(0, Math.min(1, cur + s.delta));
                            weights[key] = next;
                            const r2 = await fetch(`/api/fish-config/${cfg.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ weightsJson: JSON.stringify(weights) }),
                            });
                            if (!r2.ok) throw new Error("Не удалось применить");
                            toast({
                              title: "Применено",
                              description: `Вес «${factorNameRu(key)}» для ${s.species}: ${cur.toFixed(2)} → ${next.toFixed(2)}`,
                            });
                            qc.invalidateQueries({ queryKey: ["analytics"] });
                            qc.invalidateQueries({ queryKey: ["fish-config"] });
                            qc.invalidateQueries({ queryKey: ["forecast"] });
                          } catch (e) {
                            toast({ title: "Ошибка", description: (e as Error).message, variant: "destructive" });
                          }
                        }}
                      >
                        Применить
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          ))}

          {/* Reset to defaults button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 h-8 text-xs text-muted-foreground"
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Сбросить к стандартным весам
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Сбросить все веса к стандартным?</AlertDialogTitle>
                <AlertDialogDescription>
                  Все корректировки, внесённые через «Применить», будут отменены.
                  Веса вернутся к исследованным значениям (по вашим данным о температуре,
                  давлении, ветре, фазе луны). Уловы в Дневнике не пострадают.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      const r = await fetch("/api/seed", { method: "POST" });
                      if (!r.ok) throw new Error("Не удалось сбросить");
                      toast({ title: "Сброшено", description: "Веса факторов вернулись к стандартным значениям" });
                      qc.invalidateQueries({ queryKey: ["analytics"] });
                      qc.invalidateQueries({ queryKey: ["fish-config"] });
                      qc.invalidateQueries({ queryKey: ["forecast"] });
                    } catch (e) {
                      toast({ title: "Ошибка", description: (e as Error).message, variant: "destructive" });
                    }
                  }}
                >
                  Сбросить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

interface SpotFilterProps {
  spots: SpotDTO[];
  value: string;
  onChange: (v: string) => void;
  headerLabel: string;
}

// Sentinel for "Все места" — Radix Select.Item can't have an empty-string value,
// so we use a non-empty placeholder internally and translate back to "" when
// talking to the API.
const ALL_VALUE = "__all__";

function SpotFilter({ spots, value, onChange, headerLabel }: SpotFilterProps) {
  const selectValue = value || ALL_VALUE;
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">{headerLabel}</h2>
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select
          value={selectValue}
          onValueChange={(v) => onChange(v === ALL_VALUE ? "" : v)}
        >
          <SelectTrigger className="flex-1 h-11">
            <SelectValue placeholder="Все места" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Все места</SelectItem>
            {spots.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
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
