"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type SpotDTO } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/fish/EmptyState";
import { cn } from "@/lib/utils";

interface SpotSelectorProps {
  onAddSpot?: () => void;
  className?: string;
  showAddButton?: boolean;
}

export function SpotSelector({ onAddSpot, className, showAddButton = true }: SpotSelectorProps) {
  const { currentSpotId, setCurrentSpotId } = useAppStore();
  const { data } = useQuery<{ spots: SpotDTO[] }>({
    queryKey: ["spots"],
    queryFn: api.spots.list,
  });

  const spots = data?.spots ?? [];

  if (spots.length === 0) {
    return (
      <div className={className}>
        <EmptyState
          title="Пока нет мест"
          description="Добавьте первое рыболовное место с координатами"
          action={
            showAddButton ? (
              <Button onClick={onAddSpot}>
                <Plus className="h-4 w-4 mr-1" /> Добавить место
              </Button>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select
        value={currentSpotId ?? undefined}
        onValueChange={(v) => setCurrentSpotId(v)}
      >
        <SelectTrigger className="flex-1 h-11">
          <SelectValue placeholder="Выберите место…" />
        </SelectTrigger>
        <SelectContent>
          {spots.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}{s.description ? ` (${s.description})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showAddButton && (
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={onAddSpot}>
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
