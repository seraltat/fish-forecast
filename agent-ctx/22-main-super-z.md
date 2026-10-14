---
Task ID: 22
Agent: main (Super Z)
Task: Integrate Open-Meteo Marine API to fetch real sea surface temperature (SST) for coastal fishing spots

Work Log:
- Read worklog.md (tasks 1-21 prior history) and inspected current state: dev server running on port 3000, 4 spots in DB (Кучелиново, Канал, Кипарисовка, Уссури).
- Tested Open-Meteo Marine API directly via curl for all 4 existing spots:
  * Кучелиново (43.4727, 132.3335) — coastal → SST 16.4°C ✓
  * Кипарисовка (43.4583, 131.9025) — coastal → SST 16.6°C ✓
  * Канал (44.3898, 132.4176) — inland → null ✓
  * Уссури (47.2384, 134.1615) — inland → null ✓
- Added `fetchSeaSurfaceTemperature()` to `src/app/api/forecast/route.ts`:
  * Tries 13 offsets in parallel: exact coords + 5km N/S/E/W + 10km N/S/E/W + 14km corners
  * Returns first non-null SST, or null if all fail (genuinely inland spots stay null)
  * Uses `https://marine-api.open-meteo.com/v1/marine?...current=sea_surface_temperature`
- Integrated SST into forecast computation with priority: manual override > SST > estimate.
  The `waterTempSource` field now reports `"sst"` when SST is available and no override is set.
- Extended `ForecastResponse.waterTempSource` type in `src/lib/types.ts`:
  `"estimate" | "override"` → `"estimate" | "override" | "sst"`
- Bumped cache version in `src/lib/cache.ts`: `v5-moon` → `v6-sst` (invalidates stale forecasts
  so users see SST on next request).
- Updated `src/components/tabs/HomeTab.tsx` "Условия сейчас" water temperature Cond cell to use
  3-way label: "Температура воды (SST)" / "Введённая температура воды" / "Оценка температуры воды".
  Also added 3-way hint: "по спутниковым данным" / "ручной ввод" / "по воздуху 3 дня".
- Passed `waterTempSource={waterTempSource}` prop through to ScoreBreakdownDialog in HomeTab
  and ForecastTab (was previously absent).
- Updated `src/components/tabs/AdjustTab.tsx` result-card water temp tile to use 3-way label
  via an IIFE: "Температура воды (SST)" / "Температура воды (ввод)" / "Оценка температуры воды".
- Updated `src/components/fish/ScoreBreakdownDialog.tsx`:
  * Added optional `waterTempSource?: "estimate" | "override" | "sst"` prop (defaults to "estimate").
  * Threaded it through `buildFactorRows` → `explainFactor` for the waterTemp case.
  * waterTemp factor explanation now includes the source tag:
    - `Вода ${wt}°C (SST) → ...` for sst
    - `Вода ${wt}°C (ввод) → ...` for override
    - `Вода ${wt}°C (оценка по t° воздуха) → ...` for estimate
- Verified via curl on all 4 spots:
  * Кучелиново: waterTempSource=sst, waterTemp=16.4 ✓
  * Кипарисовка: waterTempSource=sst, waterTemp≈16.7 ✓ (one offset snapped to a different ocean grid cell, still ~16°C — acceptable)
  * Канал: waterTempSource=estimate, waterTemp=9.9 ✓ (SST null)
  * Уссури: waterTempSource=estimate, waterTemp=8 ✓ (SST null)
  * Override 25°C on Кучелиново: waterTempSource=override, waterTemp=25 ✓ (override wins over SST)
- Verified via agent-browser on Home tab:
  * Кучелиново (coastal): "ТЕМПЕРАТУРА ВОДЫ (SST)" + "16°C" + "по спутниковым данным" ✓
  * Канал (inland): "ОЦЕНКА ТЕМПЕРАТУРЫ ВОДЫ" + "10°C" + "по воздуху 3 дня" ✓
- Verified on Adjust tab:
  * Кучелиново (coastal): "Температура воды (SST)" + "16°C" ✓
  * Канал (inland, override=20 set): "Температура воды (ввод)" + "20°C" ✓
- Verified on ScoreBreakdownDialog:
  * Кучелиново (SST): "Вода 16.4°C (SST) → активность средняя (нужно 10-12°C)" ✓
  * Канал (estimate, no override): "Вода 9.9°C (оценка по t° воздуха) → комфортная температура" ✓
- Captured 5 screenshots for the worklog: home-coastal-sst, home-inland-estimate,
  adjust-coastal-sst, adjust-inland-estimate, breakdown-sst, breakdown-estimate.
- bun run lint: 0 errors.
- Dev log shows POST /api/forecast 200 in ~1000ms (acceptable — 13 parallel SST fetches add ~800ms
  on first call; subsequent calls within 10-min cache TTL are instant).

Stage Summary:
- Coastal fishing spots (Кучелиново, Кипарисовка — both near Ussuriysky/Amursky gulfs) now show
  REAL sea surface temperature from Open-Meteo Marine API instead of an air-temp-based estimate.
- Inland spots (Канал, Уссури — far from ocean) correctly fall back to the air-temp estimate
  because the Marine API returns null for land coordinates.
- Manual override still wins over both sources (priority: override > SST > estimate).
- UI clearly distinguishes the 3 sources in 3 places: Home tab "Условия сейчас", Adjust tab
  result card, and ScoreBreakdownDialog waterTemp factor description.

Caveats:
- SST lookup adds ~800ms latency on the first forecast call per spot (13 parallel HTTP requests
  to the Marine API). Cached weather still hits the 10-min TTL cache for subsequent calls,
  but the SST fetch itself is NOT cached (re-fetched every call). Could add caching for SST
  in a future task if this becomes noticeable — for now the 1s response time is acceptable.
- The Кипарисовка SST showed 16.7°C (one of the offsets snapped to a different ocean grid cell
  than the direct call which returned 16.6°C). Both values are equivalent (~16°C coastal water)
  — the small variance comes from different grid cells hitting slightly different SST readings.
- The "ввод" branch in the ScoreBreakdownDialog is reachable only if HomeTab/ForecastTab start
  passing the override state to the forecast query (currently only AdjustTab does). The code is
  correct and defensive — the label will appear correctly if/when HomeTab/ForecastTab are updated
  to include overrides in their forecastQ keys.
- Of the user's 7 mentioned spots, only 4 are currently in the DB (Уссури, Канал, Кипарисовка,
  and Кучелиново which replaces Артемовка in the test). The other 3 (Бикин, Раздольная, Илистая)
  were not in the DB at task start — they may have been added/removed in prior tasks. The SST
  integration will work for them the same way: coastal (Раздольная, Артемовка, Кипарисовка)
  return SST; inland (Уссури, Бикин, Илистая, Канал) return null and fall back to estimate.
