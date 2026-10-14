"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Species } from "@/lib/species";

export type TabId = "home" | "forecast" | "adjust" | "diary" | "analytics";

interface AppState {
  // UI
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;

  // Selected spot
  currentSpotId: string | null;
  setCurrentSpotId: (id: string | null) => void;

  // Target species (user's preferred fish for composite score)
  targetSpecies: Species;
  setTargetSpecies: (s: Species) => void;

  // Current session
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;

  // On-site overrides (live in store so all tabs share them)
  overrideWaterTemp: number | null;
  overrideWindDir: number | null; // null = auto, -1 = "auto" sentinel
  overrideWindSpeed: number | null;
  overridePressure: number | null;
  setOverrides: (o: {
    waterTemp?: number | null;
    windDir?: number | null;
    windSpeed?: number | null;
    pressure?: number | null;
  }) => void;
  clearOverrides: () => void;

  // Settings sheet
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeTab: "home",
      setActiveTab: (t) => set({ activeTab: t }),
      currentSpotId: null,
      setCurrentSpotId: (id) => set({ currentSpotId: id }),
      targetSpecies: "щука",
      setTargetSpecies: (s) => set({ targetSpecies: s }),
      currentSessionId: null,
      setCurrentSessionId: (id) => set({ currentSessionId: id }),
      overrideWaterTemp: null,
      overrideWindDir: null,
      overrideWindSpeed: null,
      overridePressure: null,
      setOverrides: (o) =>
        set((state) => ({
          overrideWaterTemp:
            o.waterTemp !== undefined ? o.waterTemp : state.overrideWaterTemp,
          overrideWindDir:
            o.windDir !== undefined ? o.windDir : state.overrideWindDir,
          overrideWindSpeed:
            o.windSpeed !== undefined ? o.windSpeed : state.overrideWindSpeed,
          overridePressure:
            o.pressure !== undefined ? o.pressure : state.overridePressure,
        })),
      clearOverrides: () =>
        set({
          overrideWaterTemp: null,
          overrideWindDir: null,
          overrideWindSpeed: null,
          overridePressure: null,
        }),
      settingsOpen: false,
      setSettingsOpen: (v) => set({ settingsOpen: v }),
    }),
    {
      name: "fish-bite-forecast-store",
      partialize: (s) => ({
        currentSpotId: s.currentSpotId,
        targetSpecies: s.targetSpecies,
        currentSessionId: s.currentSessionId,
        overrideWaterTemp: s.overrideWaterTemp,
        overrideWindDir: s.overrideWindDir,
        overrideWindSpeed: s.overrideWindSpeed,
        overridePressure: s.overridePressure,
      }),
    }
  )
);
