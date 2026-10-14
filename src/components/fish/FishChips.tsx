"use client";

import { SPECIES_COLORS, SPECIES_LABELS, ALL_SPECIES, type Species } from "@/lib/species";
import { biteLabel, type SeasonInfo } from "@/lib/forecast";
import { cn } from "@/lib/utils";

interface FishChipsProps {
  scores: Record<Species, number>;
  seasonStatus?: Record<Species, SeasonInfo>;
  enabledSpecies?: Species[];
  target?: Species;
  onSelect?: (s: Species) => void;
  size?: "sm" | "md";
}

export function FishChips({ scores, seasonStatus, enabledSpecies = ALL_SPECIES, target, onSelect, size = "md" }: FishChipsProps) {
  // Show only species enabled for the current spot (enabledSpecies comes from API route).
  // For spots where краснопёрка doesn't live (не Раздольная/Артемовка), it's excluded
  // from enabledSpecies → chip is hidden entirely (not just greyed out).
  const visible = ALL_SPECIES.filter((sp) => enabledSpecies.includes(sp));
  return (
    <div className="grid grid-cols-2 gap-2 w-full">
      {visible.map((sp) => {
        const score = scores[sp] ?? 0;
        const color = SPECIES_COLORS[sp];
        const enabled = enabledSpecies.includes(sp);
        const isTarget = target === sp;
        const seasonInfo = seasonStatus?.[sp];
        const showSeasonLabel =
          seasonInfo &&
          (seasonInfo.status === "off_season" || seasonInfo.status === "spawning");
        return (
          <button
            key={sp}
            type="button"
            disabled={!enabled || !onSelect}
            onClick={() => onSelect?.(sp)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition",
              size === "sm" ? "min-h-10" : "min-h-12",
              isTarget ? "border-primary ring-2 ring-primary/30" : "border-border",
              !enabled && "opacity-40",
              onSelect && enabled ? "hover:bg-muted/60" : ""
            )}
            style={isTarget ? { borderColor: color } : undefined}
          >
            <span
              className="inline-flex items-center justify-center rounded-full font-bold text-white tabular-nums"
              style={{
                background: color,
                width: size === "sm" ? 28 : 32,
                height: size === "sm" ? 28 : 32,
                fontSize: size === "sm" ? 11 : 12,
              }}
            >
              {Math.round(score)}
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-tight">{SPECIES_LABELS[sp]}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                {showSeasonLabel ? seasonInfo!.label : biteLabel(score)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
