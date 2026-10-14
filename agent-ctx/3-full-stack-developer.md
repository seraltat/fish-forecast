# Task 3 — full-stack-developer

## What was built

A single-page PWA at `/` ("Прогноз клёва") for a Russian freshwater fisherman, with:
- 5-tab bottom navigation: Главная, Прогноз, Корректировка, Дневник, Аналитика
- Sticky header (app name + current spot + settings gear)
- Settings Sheet (manage spots CRUD, toggle target fish, reset all data with confirm)

## File structure of new code

```
src/
  app/
    layout.tsx                  ← ru lang, manifest link, theme-color, theme+query providers, PWARegister
    page.tsx                    ← single-page shell, tab switch, SettingsSheet mounted
    globals.css                 ← nature palette + dark mode + custom scrollbar + safe-area
    api/
      route.ts                  ← health
      weather/route.ts          ← Open-Meteo proxy + 10-min cache (wind_speed_unit=ms)
      forecast/route.ts         ← combines weather + overrides → 168 hourly records
      spots/route.ts            ← GET, POST
      spots/[id]/route.ts       ← GET, PATCH, DELETE
      sessions/route.ts         ← GET, POST
      sessions/[id]/route.ts    ← GET, PATCH
      sessions/[id]/end/route.ts← POST
      catches/route.ts         ← GET, POST
      catches/[id]/route.ts    ← DELETE
      analytics/route.ts       ← GET (count, histogram, hit-rate, suggestions)
      fish-config/route.ts     ← GET, POST
      fish-config/[id]/route.ts← GET, PATCH (weights/enabled), DELETE
      seed/route.ts             ← GET, POST (idempotent seed of default weights)
      reset/route.ts            ← POST (guarded by confirm:"DELETE")
  lib/
    forecast.ts                 ← algorithm: moon phase, pressure trend, sub-scores, weighted average per species, top-2 factors, weather code lookup
    species.ts                  ← Species type, labels, nature-palette colors
    types.ts                    ← WeatherResponse, ForecastHour, ForecastResponse
    cache.ts                    ← in-memory weather cache (versioned key)
    api.ts                      ← typed fetch wrappers (relative URLs)
    db.ts                       ← (existing) Prisma client
  store/
    app-store.ts                ← Zustand+persist: spot, target species, session, overrides, tab, settings
  components/
    PWARegister.tsx             ← SW registration
    ThemeShell.tsx              ← next-themes provider
    QueryProvider.tsx           ← TanStack Query client
    fish/
      Header.tsx
      BottomNav.tsx
      ScoreGauge.tsx            ← circular SVG gauge
      FishChips.tsx             ← 4 fish mini-scores
      EmptyState.tsx
      SpotSelector.tsx
      AddSpotDialog.tsx         ← incl. Russian presets (Селигер, Ока, etc.)
      AddCatchDialog.tsx        ← auto-snapshots predictedScore + conditions
      SettingsSheet.tsx
    tabs/
      HomeTab.tsx               ← gauge, fish chips, conditions, top-3 hours, 24h recharts line chart
      ForecastTab.tsx           ← 7-day horizontal scroll + accordion hourly detail
      AdjustTab.tsx             ← on-site form, "Пересчитать", "Начать/Завершить сессию", gauge + next 6h
      DiaryTab.tsx              ← filters + grouped list + delete
      AnalyticsTab.tsx          ← bar chart, hit-rate, histogram, suggestions w/ "Применить"
prisma/schema.prisma           ← Spot, Session, Catch (with snapshot), FishConfig
public/
  manifest.json
  sw.js
  icon.svg  icon-192.png  icon-512.png
```

## What works (verified)

- `bun run lint` — 0 errors, 0 warnings.
- `bun run db:push` — schema applied; DB seeded with 4 FishConfig rows (default weights).
- Page `/` returns 200 with `<title>Прогноз клёва</title>`.
- `GET /api/weather?lat=56.05&lon=40.41` returns Open-Meteo JSON (m/s winds).
- `POST /api/forecast` returns 168 hourly entries with per-fish scores (0–100), moon phase, pressure trend, weather code labels — tested with `waterTempOverride=18` → scores update accordingly.
- `POST /api/sessions`, `PATCH`, `/end` all 200.
- `POST /api/catches`, `GET /api/catches`, `DELETE` all 200; predictedScore snapshot populated from forecast.
- `GET /api/analytics` returns total, countPerSpecies, histogram, hitRate, suggestions.
- `POST /api/reset` rejected without `confirm:"DELETE"`; works with it.
- `/manifest.json`, `/sw.js`, `/icon.svg`, `/icon-192.png`, `/icon-512.png` all 200.
- dev.log shows no errors after final compile.

## Caveats / honesty notes

1. **Wind direction override input** is a Select with the 8-point compass plus "Авто (по прогнозу)" — matches the spec ("8 options + Авто"). The actual degrees are integers (0/45/…/315). It is *not* a free-form degree input, but the 8-point labels are the spec's request ("N/NE/E/SE/S/SW/W/NW" → Russian С/СВ/…).
2. **Analytics "hit rate"** is computed from catch-level `predictedScore` (the only forecast-vs-actual data we persist). It buckets by distinct catch-day where `predictedScore>60` for that species — this is an approximation since we don't store the full forecast timeline. The exact denominator ("sessions where predicted >60%") would require storing a forecast snapshot per session start; for a personal single-device app this approximation is reasonable and the spec's wording ("в X из Y случаев") is still conveyed.
3. **"Применить" suggestion** only adjusts the single top-weighted factor by +0.05 (or shows an info note when forecast looks good). It does not normalize weights to sum to 1 — that's intentional (the algorithm divides by `weightSum` so unnormalized weights still produce 0–100 scores). After applying, the forecast query is invalidated and analytics re-fetch.
4. **Map-based coordinate picker** is *not* implemented (spec said optional). User enters lat/lon manually or picks one of the 4 Russian preset spots.
5. **No test code** per instructions.
6. **The first time the user opens the app** the spots list is empty. He should tap the gear icon → "Добавить" to create his first spot. After that, all tabs light up.
7. **PWA install** requires HTTPS or localhost. On the user's Android phone, opening the preview URL in Chrome and using "Add to Home screen" should install it as a standalone app with the green icon.
8. **The on-site overrides persist** in localStorage (zustand persist) so the user can reload the PWA mid-session and the form values stay.
9. **Open-Meteo `wind_speed_unit=ms`** is requested explicitly to avoid the km/h→m/s confusion.
10. The dev.log shows a stale "EADDRINUSE" error from a duplicate start attempt earlier — that was the sandbox trying to spawn a second dev server; the actual server is running fine (latest entries show 200 responses).
