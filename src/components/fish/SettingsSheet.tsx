"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type SpotDTO } from "@/lib/api";
import { apiFetch } from "@/lib/user-id";
import { useAppStore } from "@/store/app-store";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Edit, Plus, Trash2, Settings, MapPin, Fish, Download, Upload } from "lucide-react";
import { AddSpotDialog } from "@/components/fish/AddSpotDialog";
import { MapModal } from "@/components/fish/MapModal";
import { ALL_SPECIES, SPECIES_LABELS } from "@/lib/species";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export function SettingsSheet() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { settingsOpen, setSettingsOpen } = useAppStore();
  const [addSpotOpen, setAddSpotOpen] = useState(false);
  const [editSpot, setEditSpot] = useState<SpotDTO | null>(null);
  // Map modal state — supports both read-only "view spot" and "pick coords" modes.
  const [mapViewSpot, setMapViewSpot] = useState<SpotDTO | null>(null);

  const spotsQ = useQuery<{ spots: SpotDTO[] }>({
    queryKey: ["spots"],
    queryFn: api.spots.list,
    enabled: settingsOpen,
  });
  const spots = spotsQ.data?.spots ?? [];

  // FishConfig list — separate fetch since we don't have an API route. Use a quick fetch here.
  const fishQ = useQuery<{ configs: Array<{ id: string; species: string; enabled: boolean }> }>({
    queryKey: ["fish-config"],
    queryFn: async () => {
      const r = await apiFetch("/api/fish-config");
      if (!r.ok) return { configs: [] };
      return r.json() as Promise<{ configs: Array<{ id: string; species: string; enabled: boolean }> }>;
    },
    enabled: settingsOpen,
  });

  const deleteSpot = useMutation({
    mutationFn: (id: string) => api.spots.remove(id),
    onSuccess: () => {
      toast({ title: "Место удалено" });
      qc.invalidateQueries({ queryKey: ["spots"] });
    },
  });

  const toggleFish = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const r = await apiFetch(`/api/fish-config/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) throw new Error("Не удалось обновить");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fish-config"] }),
  });

  return (
    <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto nice-scroll">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" /> Настройки
          </SheetTitle>
          <SheetDescription>Места и целевые рыбы</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-4">
          {/* Spots */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary" /> Места
              </h3>
              <Button size="sm" variant="outline" onClick={() => { setEditSpot(null); setAddSpotOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Добавить
              </Button>
            </div>
            {spotsQ.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : spots.length === 0 ? (
              <p className="text-xs text-muted-foreground">Пока нет мест. Добавьте первое.</p>
            ) : (
              <ul className="space-y-1.5">
                {spots.map((s) => (
                  <li key={s.id} className="rounded-lg border border-border p-2.5 bg-card">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground mb-1.5">
                      {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)} · {
                        s.waterType === "river" ? "река" :
                        s.waterType === "lake" ? "озеро" :
                        s.waterType === "протока" ? "протока" :
                        s.waterType === "канал" ? "канал" : s.waterType
                      }
                    </div>
                    {/* Action buttons — Edit, Show on map, Delete */}
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1"
                        onClick={() => { setEditSpot(s); setAddSpotOpen(true); }}
                      >
                        <Edit className="h-3.5 w-3.5 mr-1" /> Изменить
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1"
                        onClick={() => setMapViewSpot(s)}
                      >
                        <MapPin className="h-3.5 w-3.5 mr-1" /> На карте
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive hover:text-destructive px-2"
                        onClick={() => deleteSpot.mutate(s.id)}
                        aria-label="Удалить"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Target fish */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Fish className="h-4 w-4 text-primary" /> Целевые рыбы
            </h3>
            {fishQ.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <ul className="space-y-1">
                {ALL_SPECIES.map((sp) => {
                  const cfg = fishQ.data?.configs.find((c) => c.species === sp);
                  const enabled = cfg?.enabled ?? true;
                  return (
                    <li key={sp} className="flex items-center justify-between rounded-lg border border-border p-2.5 bg-card">
                      <span className="text-sm font-medium">{SPECIES_LABELS[sp]}</span>
                      <Switch
                        checked={enabled}
                        disabled={!cfg || toggleFish.isPending}
                        onCheckedChange={(v) => cfg && toggleFish.mutate({ id: cfg.id, enabled: v })}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Экспорт / Импорт данных */}
          <section className="space-y-2 pt-2 border-t">
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={async () => {
                try {
                  const r = await apiFetch("/api/export");
                  if (!r.ok) throw new Error("Не удалось выгрузить");
                  const blob = await r.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `fish-forecast-export-${new Date().toISOString().slice(0, 10)}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  toast({ title: "Данные выгружены", description: "JSON-файл сохранён в загрузках" });
                } catch (e) {
                  toast({ title: "Ошибка", description: (e as Error).message, variant: "destructive" });
                }
              }}
            >
              <Download className="h-4 w-4 mr-1" /> Экспорт данных в JSON
            </Button>

            <Button
              variant="outline"
              className="w-full h-11"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".json,application/json";
                input.onchange = async () => {
                  if (!input.files?.[0]) return;
                  try {
                    const text = await input.files[0].text();
                    const data = JSON.parse(text);
                    const r = await apiFetch("/api/import", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(data),
                    });
                    if (!r.ok) throw new Error("Не удалось импортировать");
                    const result = await r.json();
                    toast({ title: "Импорт завершён", description: result.message });
                    qc.invalidateQueries({ queryKey: ["spots"] });
                    qc.invalidateQueries({ queryKey: ["catches"] });
                    qc.invalidateQueries({ queryKey: ["analytics"] });
                    qc.invalidateQueries({ queryKey: ["fish-config"] });
                    qc.invalidateQueries({ queryKey: ["forecast"] });
                  } catch (e) {
                    toast({ title: "Ошибка импорта", description: (e as Error).message, variant: "destructive" });
                  }
                };
                input.click();
              }}
            >
              <Upload className="h-4 w-4 mr-1" /> Импорт из JSON
            </Button>
          </section>
        </div>
      </SheetContent>

      <AddSpotDialog
        key={editSpot?.id ?? "new-spot"}
        open={addSpotOpen}
        onOpenChange={setAddSpotOpen}
        initial={editSpot ?? undefined}
      />

      {/* Read-only map view — opens when user taps "На карте" on a spot row. */}
      <MapModal
        open={!!mapViewSpot}
        onOpenChange={(v) => { if (!v) setMapViewSpot(null); }}
        initialLat={mapViewSpot?.latitude}
        initialLon={mapViewSpot?.longitude}
        editable={false}
      />
    </Sheet>
  );
}
