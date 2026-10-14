"use client";

import { useAppStore } from "@/store/app-store";
import { useQuery } from "@tanstack/react-query";
import { api, type SpotDTO } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Settings, Fish, MapPin } from "lucide-react";

export function Header() {
  const { setSettingsOpen, currentSpotId } = useAppStore();
  const spotsQ = useQuery<{ spots: SpotDTO[] }>({ queryKey: ["spots"], queryFn: api.spots.list });
  const spot = spotsQ.data?.spots.find((s) => s.id === currentSpotId) ?? null;

  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-2xl mx-auto flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Fish className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold leading-tight">Прогноз клёва</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 truncate">
              <MapPin className="h-3 w-3" />
              {spot?.name ?? "Не выбрано место"}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setSettingsOpen(true)} aria-label="Настройки">
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
