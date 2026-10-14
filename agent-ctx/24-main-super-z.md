# Task 24 — Restrict SST + add краснопёрка species

## Scope (from spec)
Two changes to the Fish Bite Forecast PWA at /home/z/my-project:

1. **Restrict SST to spots named "Раздольная" or "Артемовка" only.**
   - Кипарисовка is a tributary of Раздольная → SST of Раздольная applies there → don't show separate SST.
   - Other (inland) spots → null (already was).

2. **Add new fish species "краснопёрка" (semi-anadromous).**
   - Visible only for spots named Раздольная / Артемовка (other spots hide it in UI and don't score it).
   - Biology (per user's research):
     - October: sea → river migration when SST cools to 8-10°C.
     - March–mid April: rise from wintering holes to shallow bays for pre-spawn feeding (BEST spring fishing).
     - Spawning: rivers, water 18-20°C, shallow 15-35 cm, quiet wind-protected spots.
     - Post-spawn: adults roll back to sea (still catchable in transition).
     - Summer (Jun-Aug): only juveniles in river mouths (NOT interesting).
     - Autumn (Oct-Nov): mass migration BEST autumn fishing (only large individuals).
     - Winter (Dec-Feb): глухозимье (off-season, fish in holes, not feeding).

## Files touched

| File | Change |
|---|---|
| src/lib/species.ts | Add "краснопёрка" to Species type, ALL_SPECIES, SPECIES_LABELS ("Краснопёрка"), SPECIES_COLORS (#dc2626 red), isSpecies guard. |
| src/lib/forecast.ts | Add краснопёрка entries in WATER_TEMP_CURVES, PRESSURE_TREND_SCORES, DEFAULT_WEIGHTS; add краснопёрка branch in getSeasonStatus (8 conditions + fallback); add краснопёрка case in scoreForSpecies wind-speed block and time-of-day block; add краснопёрка branches in topFactors for wind-speed and time-of-day. |
| src/app/api/forecast/route.ts | Wrap SST call in name check (only Раздольная/Артемовка); add isKrasnoperSpot flag; skip краснопёрка in FishConfig enabled loop for non-Раздольная/Артемовка spots; skip краснопёрка in per-hour scoring loop with explicit score=0 + season label "Нет в этой реке"; add краснопёрка to scores/factors/seasonStatusMap Record initializers. |
| src/app/api/seed/route.ts | No code change — iterates ALL_SPECIES automatically; seeded via `curl -X POST /api/seed` → created:1, updated:4, total:5. |
| src/components/fish/FishChips.tsx | Filter chips to `enabledSpecies` only — disabled species are now HIDDEN entirely (was: rendered greyed-out). |
| src/components/fish/SettingsSheet.tsx | No code change — already maps ALL_SPECIES → краснопёрка toggle appears as 5th row. |

## Defaults chosen for краснопёрка
- Color: `#dc2626` (red — for its red fins)
- Water-temp curve (piecewise): peak 90 at 10°C, 80 at 8°C, 75 at 12°C, dip to 15 at 18°C (spawning), 25 at 20°C (post-spawn start), low 5 below 4°C and above 28°C.
- Pressure trend scores: stable=85, drop=70, rise=70, drop_sharp=30, rise_sharp=25 (similar to карась).
- DEFAULT_WEIGHTS (sum=1.00): waterTemp 0.40, pressureTrend 0.15, pressureValue 0.05, windSpeed 0.10, windDirection 0.05, timeOfDay 0.15, moonPhase 0.10.
- Wind speed: ideal 1-4 m/s (same as карась).
- Time-of-day: dawn/dusk peak, day 50, night 25 (same as карась/сазан).
- Moon: uses the uniform 28-day lunar table (no per-species preference).

## Verification (all pass)
- `bun run lint` → 0 errors
- DB: 5 FishConfig rows after `POST /api/seed`
- API:
  - Раздольная: SST 16.6 ✓, enabledSpecies has краснопёрка ✓
  - Канал: SST null ✓, enabledSpecies excludes краснопёрка ✓, score=0, season "Нет в этой реке" ✓
  - Артемовка: SST 16.3 ✓, enabledSpecies has краснопёрка ✓
  - Кипарисовка: SST null ✓ (Change 1 — previously had 16.6), enabledSpecies excludes краснопёрка ✓
- UI (agent-browser):
  - Раздольная Home: 5 chips including "9 Краснопёрка Не сезон", water-temp hint "по воздуху 3 дня · SST залива: 16.6°C"
  - Канал Home: 4 chips (no Краснопёрка), water-temp hint "по воздуху 3 дня" (no SST)
  - Кипарисовка Home: 4 chips (no Краснопёрка), water-temp hint "по воздуху 3 дня" (no SST — Change 1 working)
  - Артемовка Home: 5 chips, water-temp hint "по воздуху 3 дня · SST залива: 16.3°C"
  - Settings sheet: 5 toggle switches (Карась, Сазан, Сом, Щука, Краснопёрка) — all checked=true (global enable/disable)

## Caveats
- For Раздольная today (October, waterTemp estimate ~12.2°C), краснопёрка falls into the "Не сезон" fallback because the algorithm uses the air-temp estimate, not the SST. The spec's autumn migration window is 8-12°C (just under the 12.2 estimate). With actual SST 16.6°C, sea hasn't cooled enough — by design. User can manually override waterTemp on Корректировка tab to 10°C to see "Осенний ход!" trigger.
- The `краснопёрка` chip shows score 8-9 with label "Не сезон" on coastal spots in October — suppressed by the seasonModifier (×0.15 for off_season). This is the expected behavior given the algorithm uses the estimate (12.2°C) not SST (16.6°C).
- All previous features preserved. No DB schema change. No new dependencies.
