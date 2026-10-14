"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type SpotDTO } from "@/lib/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/app-store";
import { ALL_SPECIES, SPECIES_LABELS, type Species } from "@/lib/species";

interface AddCatchDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  spots: SpotDTO[];
}

const BAITS = ["Червь", "Опарыш", "Кукуруза", "Бойл", "Блесна", "Воблер", "Силикон", "Тесто", "Живец", "Макуха", "Перловка", "Мотыль", "Ручейник", "Хлеб"];

function nowLocalInput(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function AddCatchDialog({ open, onOpenChange, spots }: AddCatchDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { currentSpotId, currentSessionId } = useAppStore();

  const [tab, setTab] = useState<"single" | "batch">("single");

  // ---- single mode state ----
  const [species, setSpecies] = useState<Species>("карась");
  const [weight, setWeight] = useState<string>("");
  const [length, setLength] = useState<string>("");
  const [bait, setBait] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [spotId, setSpotId] = useState<string>(currentSpotId ?? spots[0]?.id ?? "");
  const [caughtAt, setCaughtAt] = useState<string>(nowLocalInput);

  // ---- batch mode state ----
  const [bSpecies, setBSpecies] = useState<Species>("карась");
  const [bQuantity, setBQuantity] = useState<string>("1");
  const [bWeight, setBWeight] = useState<string>("");
  const [bLength, setBLength] = useState<string>("");
  const [bBait, setBBait] = useState<string>("");
  const [bNotes, setBNotes] = useState<string>("");
  const [bSpotId, setBSpotId] = useState<string>(currentSpotId ?? spots[0]?.id ?? "");
  const [bCaughtAt, setBCaughtAt] = useState<string>(nowLocalInput);

  const singleMutation = useMutation({
    mutationFn: async () => {
      const w = parseFloat(weight);
      const l = length ? parseFloat(length) : null;
      if (!spotId || Number.isNaN(w)) {
        throw new Error("Укажите место и вес");
      }
      // Fetch forecast to snapshot predictedScore & conditions for the chosen hour.
      let snapshot: {
        waterTemp?: number | null;
        airTemp?: number | null;
        windSpeed?: number | null;
        windDir?: number | null;
        pressure?: number | null;
        moonPhase?: number | null;
        predictedScore?: number | null;
      } = {};
      try {
        const f = await api.forecast({ spotId });
        const ct = new Date(caughtAt).getTime();
        const hour = f.hours.find((h) => {
          const ht = new Date(h.time + "Z").getTime();
          return Math.abs(ht - ct) < 60 * 60 * 1000;
        });
        if (hour) {
          snapshot = {
            waterTemp: hour.waterTemp,
            airTemp: hour.airTemp,
            windSpeed: hour.windSpeed,
            windDir: hour.windDir,
            pressure: hour.pressure,
            moonPhase: hour.moonPhase,
            predictedScore: hour.scores[species] ?? null,
          };
        }
      } catch {
        // network problem — proceed without snapshot
      }
      return api.catches.create({
        spotId,
        species,
        weightKg: w,
        lengthCm: l,
        caughtAt: new Date(caughtAt).toISOString(),
        bait: bait || undefined,
        notes: notes || undefined,
        sessionId: currentSessionId ?? undefined,
        ...snapshot,
      });
    },
    onSuccess: () => {
      toast({ title: "Улов записан" });
      qc.invalidateQueries({ queryKey: ["catches"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      onOpenChange(false);
      setWeight(""); setLength(""); setNotes("");
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    },
  });

  const batchMutation = useMutation({
    mutationFn: async () => {
      const count = Math.max(1, Math.min(50, Math.floor(Number(bQuantity) || 1)));
      const w = parseFloat(bWeight);
      const l = bLength ? parseFloat(bLength) : null;
      if (!bSpotId || Number.isNaN(w)) {
        throw new Error("Укажите место и средний вес");
      }
      if (count < 1 || count > 50) {
        throw new Error("Количество: от 1 до 50");
      }
      // Fetch forecast to snapshot predictedScore & conditions for the chosen hour.
      let snapshot: {
        waterTemp?: number | null;
        airTemp?: number | null;
        windSpeed?: number | null;
        windDir?: number | null;
        pressure?: number | null;
        moonPhase?: number | null;
        predictedScore?: number | null;
      } = {};
      try {
        const f = await api.forecast({ spotId: bSpotId });
        const ct = new Date(bCaughtAt).getTime();
        const hour = f.hours.find((h) => {
          const ht = new Date(h.time + "Z").getTime();
          return Math.abs(ht - ct) < 60 * 60 * 1000;
        });
        if (hour) {
          snapshot = {
            waterTemp: hour.waterTemp,
            airTemp: hour.airTemp,
            windSpeed: hour.windSpeed,
            windDir: hour.windDir,
            pressure: hour.pressure,
            moonPhase: hour.moonPhase,
            predictedScore: hour.scores[bSpecies] ?? null,
          };
        }
      } catch {
        // network problem — proceed without snapshot
      }
      return api.catches.batch({
        count,
        spotId: bSpotId,
        species: bSpecies,
        weightKg: w,
        lengthCm: l,
        caughtAt: new Date(bCaughtAt).toISOString(),
        bait: bBait || undefined,
        notes: bNotes || undefined,
        sessionId: currentSessionId ?? undefined,
        ...snapshot,
      });
    },
    onSuccess: (data) => {
      toast({ title: `Записано: ${data.count} ${pluralize(data.count)}` });
      qc.invalidateQueries({ queryKey: ["catches"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      onOpenChange(false);
      setBQuantity("1"); setBWeight(""); setBLength(""); setBNotes("");
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    },
  });

  const pending = singleMutation.isPending || batchMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto nice-scroll">
        <DialogHeader>
          <DialogTitle>Записать улов</DialogTitle>
          <DialogDescription>Лови рыбы — добавьте в дневник</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "single" | "batch")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single">Одна рыба</TabsTrigger>
            <TabsTrigger value="batch">Несколько рыб</TabsTrigger>
          </TabsList>

          {/* ---- Single mode ---- */}
          <TabsContent value="single" className="space-y-3 mt-3">
            <div className="space-y-1">
              <Label>Вид рыбы</Label>
              <Select value={species} onValueChange={(v) => setSpecies(v as Species)}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_SPECIES.map((s) => (
                    <SelectItem key={s} value={s}>{SPECIES_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="catch-weight">Вес (кг)</Label>
                <Input id="catch-weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.8" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="catch-length">Длина (см)</Label>
                <Input id="catch-length" inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} placeholder="32" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Место</Label>
              <Select value={spotId} onValueChange={setSpotId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Выберите место" />
                </SelectTrigger>
                <SelectContent>
                  {spots.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="catch-bait">Наживка</Label>
              <Input id="catch-bait" value={bait} onChange={(e) => setBait(e.target.value)} placeholder="Червь" list="bait-options" />
              <datalist id="bait-options">
                {BAITS.map((b) => <option key={b} value={b} />)}
              </datalist>
            </div>

            <div className="space-y-1">
              <Label htmlFor="catch-time">Дата и время</Label>
              <Input id="catch-time" type="datetime-local" value={caughtAt} onChange={(e) => setCaughtAt(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="catch-notes">Заметки</Label>
              <Textarea id="catch-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Глубина, течение, снасть…" rows={2} />
            </div>
          </TabsContent>

          {/* ---- Batch mode ---- */}
          <TabsContent value="batch" className="space-y-3 mt-3">
            <div className="space-y-1">
              <Label>Вид рыбы</Label>
              <Select value={bSpecies} onValueChange={(v) => setBSpecies(v as Species)}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_SPECIES.map((s) => (
                    <SelectItem key={s} value={s}>{SPECIES_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="batch-count">Количество</Label>
                <Input
                  id="batch-count"
                  inputMode="numeric"
                  type="number"
                  min={1}
                  max={50}
                  value={bQuantity}
                  onChange={(e) => setBQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="batch-weight">Ср. вес (кг)</Label>
                <Input
                  id="batch-weight"
                  inputMode="decimal"
                  value={bWeight}
                  onChange={(e) => setBWeight(e.target.value)}
                  placeholder="0.2"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="batch-length">Ср. длина</Label>
                <Input
                  id="batch-length"
                  inputMode="decimal"
                  value={bLength}
                  onChange={(e) => setBLength(e.target.value)}
                  placeholder="15"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Место</Label>
              <Select value={bSpotId} onValueChange={setBSpotId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Выберите место" />
                </SelectTrigger>
                <SelectContent>
                  {spots.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="batch-bait">Наживка</Label>
              <Input id="batch-bait" value={bBait} onChange={(e) => setBBait(e.target.value)} placeholder="Червь" list="bait-options" />
              <datalist id="bait-options">
                {BAITS.map((b) => <option key={b} value={b} />)}
              </datalist>
            </div>

            <div className="space-y-1">
              <Label htmlFor="batch-time">Дата и время</Label>
              <Input id="batch-time" type="datetime-local" value={bCaughtAt} onChange={(e) => setBCaughtAt(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="batch-notes">Заметки (ко всем рыбам)</Label>
              <Textarea id="batch-notes" value={bNotes} onChange={(e) => setBNotes(e.target.value)} placeholder="Глубина, течение, снасть…" rows={2} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            onClick={() => (tab === "single" ? singleMutation.mutate() : batchMutation.mutate())}
            disabled={pending}
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Russian plural helper: "рыба" (1) / "рыбы" (2-4) / "рыб" (5+)
function pluralize(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "рыба";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "рыбы";
  return "рыб";
}
