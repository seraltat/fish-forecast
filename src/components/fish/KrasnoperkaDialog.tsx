"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Waves, Fish, MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface KrasnoperkaDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const STATUS_COLORS: Record<string, string> = {
  ready: "text-emerald-600 bg-emerald-50 border-emerald-200",
  starting: "text-amber-600 bg-amber-50 border-amber-200",
  fading: "text-blue-600 bg-blue-50 border-blue-200",
  winter: "text-indigo-600 bg-indigo-50 border-indigo-200",
  early: "text-orange-600 bg-orange-50 border-orange-200",
  unknown: "text-muted-foreground bg-muted border-border",
};

const OVERALL_BANNER: Record<string, string> = {
  ready: "bg-emerald-600 text-white",
  starting: "bg-amber-500 text-white",
  fading: "bg-blue-600 text-white",
  winter: "bg-indigo-600 text-white",
  early: "bg-orange-500 text-white",
  unknown: "bg-muted text-muted-foreground",
};

// Описание краснопёрки — динамическое по сезону (по текущему месяцу).
// Время года определяет, какой текст показать в шапке диалога:
//   весна (март-май) — весенний жор перед нерестом
//   лето (июнь-август) — взрослая в море
//   осень (сентябрь-ноябрь) — миграция в реки на зимовку
//   зима (декабрь-февраль) — на зимовальных ямах
function getSeasonalDescription(): string {
  const month = new Date().getMonth() + 1; // 1-12
  if (month === 12 || month === 1 || month === 2) {
    return "Краснопёрка — полупроходная рыба. Зимой в зимовальных ямах в реках, не питается. Сезон откроется весной после ледохода.";
  }
  if (month >= 6 && month <= 8) {
    return "Краснопёрка — полупроходная рыба. Летом взрослая в море, в устьях только мелочь. Сезон откроется осенью при похолодании.";
  }
  if (month >= 3 && month <= 5) {
    return "Краснопёрка — полупроходная рыба. Зимой в реках на ямах. Весной поднялась и активно питается перед нерестом. Жор при прогреве воды до 4–16°C.";
  }
  // Sep-Nov (autumn)
  return "Краснопёрка — полупроходная рыба. Живёт в море, осенью заходит в реки на зимовку. Миграция начинается, когда температура воды в заливах остывает до 8–12°C.";
}

export function KrasnoperkaDialog({ open, onOpenChange }: KrasnoperkaDialogProps) {
  const q = useQuery({
    queryKey: ["krasnoperka"],
    queryFn: api.krasnoperka,
    enabled: open, // fetch only when dialog is open
    staleTime: 30 * 60 * 1000, // 30 min — same as forecast cache
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto nice-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fish className="h-5 w-5 text-red-600" />
            Краснопёрка — прогноз хода
          </DialogTitle>
          <DialogDescription>
            {getSeasonalDescription()}
          </DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : q.isError ? (
          <div className="text-sm text-destructive">
            Не удалось загрузить SST: {(q.error as Error)?.message}
          </div>
        ) : !q.data ? null : (
          <div className="space-y-3">
            {/* Overall status banner */}
            <div className={cn("rounded-lg p-4 text-center", OVERALL_BANNER[q.data.overall])}>
              <div className="text-lg font-bold">{q.data.overallLabel}</div>
              <div className="text-xs opacity-90 mt-1 flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(q.data.fetchedAt).toLocaleString("ru-RU")}
              </div>
            </div>

            {/* Per-bay cards */}
            {q.data.bays.map((bay) => (
              <div
                key={bay.name}
                className={cn(
                  "rounded-lg border p-3 space-y-2",
                  STATUS_COLORS[bay.status]
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Waves className="h-4 w-4" />
                    {bay.name}
                  </div>
                  <span className="text-2xl font-bold">
                    {bay.sst != null ? `${bay.sst}°C` : "—"}
                  </span>
                </div>
                <div className="text-sm font-medium">{bay.label}</div>
                <div className="text-xs opacity-90">{bay.description}</div>
                <div className="text-[10px] opacity-70 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {bay.latitude.toFixed(4)}, {bay.longitude.toFixed(4)}
                </div>
              </div>
            ))}

            {/* River mouths info */}
            <div className="rounded-lg border border-border bg-card p-3 space-y-1.5 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">Устья рек в заливах:</div>
              <div>• <b>Амурский залив</b> — Раздольная (Суйфун)</div>
              <div>• <b>Уссурийский залив</b> — Артемовка (Майхе)</div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
