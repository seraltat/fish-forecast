"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MapModal } from "@/components/fish/MapModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MapPin } from "lucide-react";

interface AddSpotDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: { id: string; name: string; latitude: number; longitude: number; description: string | null; waterType: string };
}

const PRESETS = [
  { name: "Уссури", lat: 47.238419, lon: 134.161460, type: "river" },
  { name: "Бикин", lat: 46.730005, lon: 134.349558, type: "river" },
  { name: "Раздольная", lat: 43.554783, lon: 131.889262, type: "river" },
  { name: "Артемовка", lat: 43.349914, lon: 132.309550, type: "river" },
  { name: "Кипарисовка", lat: 43.458300, lon: 131.902458, type: "river" },
  { name: "Илистая", lat: 44.388419, lon: 132.429022, type: "river" },
  { name: "Канал", lat: 44.389803, lon: 132.417586, type: "river" },
];

export function AddSpotDialog({ open, onOpenChange, initial }: AddSpotDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [lat, setLat] = useState<string>(initial ? String(initial.latitude) : "");
  const [lon, setLon] = useState<string>(initial ? String(initial.longitude) : "");
  const [waterType, setWaterType] = useState<string>(initial?.waterType ?? "lake");
  const [description, setDescription] = useState<string>(initial?.description ?? "");
  const [mapOpen, setMapOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);
      if (!name.trim() || Number.isNaN(latNum) || Number.isNaN(lonNum)) {
        throw new Error("Заполните название и корректные координаты");
      }
      if (initial) {
        return api.spots.update(initial.id, {
          name: name.trim(),
          latitude: latNum,
          longitude: lonNum,
          description: description.trim() || null,
          waterType,
        });
      }
      return api.spots.create({
        name: name.trim(),
        latitude: latNum,
        longitude: lonNum,
        description: description.trim() || undefined,
        waterType,
      });
    },
    onSuccess: () => {
      toast({ title: initial ? "Место обновлено" : "Место добавлено" });
      qc.invalidateQueries({ queryKey: ["spots"] });
      onOpenChange(false);
      setName(""); setLat(""); setLon(""); setDescription(""); setWaterType("lake");
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto nice-scroll">
        <DialogHeader>
          <DialogTitle>{initial ? "Изменить место" : "Новое место"}</DialogTitle>
          <DialogDescription>
            Введите координаты вручную, выберите пресет или укажите точку на карте.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="spot-name">Название</Label>
            <Input
              id="spot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Уссури"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="spot-lat">Широта (°)</Label>
              <Input
                id="spot-lat"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="47.238"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="spot-lon">Долгота (°)</Label>
              <Input
                id="spot-lon"
                inputMode="decimal"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                placeholder="134.161"
              />
            </div>
          </div>

          {/* "Выбрать на карте" button — opens MapModal in editable mode */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={() => setMapOpen(true)}
          >
            <MapPin className="h-4 w-4 mr-1.5" /> Выбрать на карте
          </Button>

          <div className="space-y-1">
            <Label>Тип воды</Label>
            <Select value={waterType} onValueChange={setWaterType}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lake">Озеро</SelectItem>
                <SelectItem value="river">Река</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="spot-desc">Описание (необязательно)</Label>
            <Textarea
              id="spot-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Подъезд, глубины, ориентиры…"
              rows={2}
            />
          </div>

          {!initial && (
            <div className="space-y-1">
              <Label>Быстрый выбор</Label>
              <div className="grid grid-cols-1 gap-1.5">
                {PRESETS.map((p) => (
                  <Button
                    key={p.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-start text-left h-auto py-2"
                    onClick={() => {
                      setName(p.name);
                      setLat(String(p.lat));
                      setLon(String(p.lon));
                      setWaterType(p.type);
                    }}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {initial ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Map picker modal — when user confirms, fills lat/lon fields. */}
      <MapModal
        open={mapOpen}
        onOpenChange={setMapOpen}
        initialLat={lat ? parseFloat(lat) : undefined}
        initialLon={lon ? parseFloat(lon) : undefined}
        editable={true}
        onPick={(la, lo) => {
          setLat(String(la));
          setLon(String(lo));
        }}
      />
    </Dialog>
  );
}
