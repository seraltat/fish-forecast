"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, type CatchDTO, type SpotDTO } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/fish/EmptyState";
import { AddCatchDialog } from "@/components/fish/AddCatchDialog";
import { Fish, Plus, Trash2, MapPin } from "lucide-react";
import { format } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";
import { SPECIES_COLORS, SPECIES_LABELS, type Species } from "@/lib/species";

// Иллюстрации рыб (сгенерированы AI) — настоящие изображения, не иконка.
const FISH_IMAGES: Record<Species, string> = {
  карась: "/fish/karas.png",
  сазан: "/fish/sazan.png",
  сом: "/fish/som.png",
  щука: "/fish/shchuka.png",
  краснопёрка: "/fish/krasnopyorka.png",
};
import { useToast } from "@/hooks/use-toast";

// Russian plural for "рыба" / "рыбы" / "рыб"
function pluralizeFish(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "рыба";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "рыбы";
  return "рыб";
}

// Daily summary text. Returns null if 1 or fewer catches (no need to summarize).
function buildDailySummary(items: CatchDTO[]): string | null {
  if (items.length <= 1) return null;
  const perSpecies = new Map<Species, { count: number; totalKg: number }>();
  for (const c of items) {
    const sp = c.species as Species;
    const e = perSpecies.get(sp) ?? { count: 0, totalKg: 0 };
    e.count += 1;
    e.totalKg += c.weightKg;
    perSpecies.set(sp, e);
  }
  const parts = Array.from(perSpecies.entries()).map(([sp, e]) => {
    return `${SPECIES_LABELS[sp]} ×${e.count} (${e.totalKg.toFixed(1)} кг)`;
  });
  const totalCount = items.length;
  const totalKg = items.reduce((s, c) => s + c.weightKg, 0);
  return `${parts.join(", ")} — Итого: ${totalCount} ${pluralizeFish(totalCount)}, ${totalKg.toFixed(1)} кг`;
}

export function DiaryTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { currentSpotId } = useAppStore();
  const [addOpen, setAddOpen] = useState(false);

  const spotsQ = useQuery<{ spots: SpotDTO[] }>({ queryKey: ["spots"], queryFn: api.spots.list });
  const spots = spotsQ.data?.spots ?? [];

  // No filters — show all catches across all spots and species.
  const catchesQ = useQuery<{ catches: CatchDTO[] }>({
    queryKey: ["catches"],
    queryFn: () => api.catches.list({}),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => api.catches.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catches"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      toast({ title: "Удалено" });
    },
  });

  // Group by date (descending)
  const groups = useMemo(() => {
    if (!catchesQ.data) return [];
    const map = new Map<string, CatchDTO[]>();
    for (const c of catchesQ.data.catches) {
      const d = new Date(c.caughtAt);
      const dayKey = format(d, "yyyy-MM-dd");
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey)!.push(c);
    }
    const out = Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    return out.map(([day, items]) => ({
      day,
      label: format(new Date(day + "T12:00:00Z"), "d MMMM yyyy, EEEE", { locale: ruLocale }),
      items: items.sort((a, b) => (a.caughtAt < b.caughtAt ? 1 : -1)),
    }));
  }, [catchesQ.data]);

  const hasCatches = !!catchesQ.data && catchesQ.data.catches.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Дневник улова</h2>
        {/* Only show inline "+ Добавить улов" button when list is non-empty.
            Empty state shows its own "+ Добавить улов" button. */}
        {hasCatches && (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} disabled={spots.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Добавить улов
          </Button>
        )}
      </div>

      {spots.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Нет мест"
          description="Добавьте рыболовное место, чтобы записывать уловы"
          action={<Button onClick={() => useAppStore.getState().setSettingsOpen(true)}>Открыть настройки</Button>}
        />
      ) : catchesQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !hasCatches ? (
        <EmptyState
          icon={Fish}
          title="Пока пусто"
          description="Запишите свой первый улов — он появится здесь и попадёт в аналитику"
          action={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Добавить улов</Button>}
        />
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const summary = buildDailySummary(g.items);
            return (
              <div key={g.day} className="space-y-1.5">
                <div className="text-xs text-muted-foreground font-medium px-1 capitalize">{g.label}</div>
                {summary && (
                  <div className="rounded-lg bg-muted/50 border border-border/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Сводка за день</div>
                    <div className="text-sm text-foreground leading-snug">{summary}</div>
                  </div>
                )}
                <div className="space-y-1.5">
                  {g.items.map((c) => {
                    const sp = c.species as Species;
                    const color = SPECIES_COLORS[sp];
                    return (
                      <Card key={c.id} className="border-border">
                        <CardContent className="flex items-center gap-3 py-2.5">
                          <div
                            className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center shrink-0 bg-muted border border-border"
                          >
                            <img
                              src={FISH_IMAGES[sp] ?? "/fish/karas.png"}
                              alt={SPECIES_LABELS[sp]}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">{SPECIES_LABELS[sp]}</span>
                              <Badge variant="secondary" className="text-xs">{c.weightKg.toFixed(2)} кг</Badge>
                              {c.lengthCm && <Badge variant="outline" className="text-xs">{c.lengthCm} см</Badge>}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {format(new Date(c.caughtAt), "HH:mm")}
                              {c.spot ? ` · ${c.spot.name}` : ""}
                              {c.bait ? ` · ${c.bait}` : ""}
                            </div>
                            {c.notes && (
                              <div className="text-[11px] text-muted-foreground mt-0.5 italic line-clamp-2">{c.notes}</div>
                            )}
                            {c.predictedScore != null && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Прогноз был: {Math.round(c.predictedScore)}%
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => deleteM.mutate(c.id)}
                            aria-label="Удалить"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddCatchDialog open={addOpen} onOpenChange={setAddOpen} spots={spots} />
    </div>
  );
}
