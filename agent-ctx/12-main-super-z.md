# Task 12 — main (Super Z)

## What was changed

Major UI overhaul of Fish Bite Forecast PWA per user feedback. All text in Russian, no blue/indigo colors.

### Files modified (8)
- `src/components/tabs/HomeTab.tsx` — date+day-of-week+clock (1-min refresh), removed water-temp alert, added "Почему такая оценка?" button.
- `src/components/tabs/ForecastTab.tsx` — complete rewrite: range-based day cards, 4-column weather grid with sky icons, pressure trend arrow, precipitation total, filtered hourly (species-specific fishing hours), "Показать все часы" toggle, astronomy header (sun/moon).
- `src/components/tabs/DiaryTab.tsx` — removed species + spot filters, removed "+Добавить" header button (replaced with smaller "+Добавить улов" only when non-empty).
- `src/components/fish/SettingsSheet.tsx` — removed "Сбросить все данные" section entirely, added "На карте" button per spot (opens MapModal read-only).
- `src/components/fish/AddSpotDialog.tsx` — added "Выбрать на карте" button → opens MapModal editable.
- `src/lib/types.ts` — added moonrises/moonsets/sunrises/sunsets arrays to ForecastResponse.
- `src/app/api/forecast/route.ts` — added fetchMoonEvents returning both moonrise/moonset; builds aligned astronomy arrays (skipping past_days=3 prefix); passes them through to ForecastResponse.

### New components (2)
- `src/components/fish/ScoreBreakdownDialog.tsx` — reusable detailed per-factor score breakdown (factor name, subscore, weight, contribution, mini bar, explanation, tempGate warning, top-2 factors, base→final calc).
- `src/components/fish/MapModal.tsx` — Leaflet + OSM + Nominatim map picker. Vanilla Leaflet via dynamic import (no SSR concerns). Read-only or editable. Default center 47N 134E zoom 8.

### Key features verified
- Home: "12 Октября 2026, Понедельник · 11:50" updates every minute ✓
- Score breakdown dialog opens with all 8 factors + subscores + explanations + tempGate + top-2 + base→final ✓
- Forecast day cards show range "51-77" + best hour "19:00 — 77%" + 4-col weather grid ✓
- Hourly filter changes per species:
  - карась: 04-09 + 17-22 (12h)
  - сазан: 04-10 + 16-22 (14h)
  - сом: 19-23 + 00-06 (12h)
  - щука: 04-10 + 16-22 (14h)
- "Показать все часы" toggle works ✓
- Diary: no filters, only "+Добавить улов" button ✓
- Settings: no reset section, "На карте" button per spot opens MapModal read-only ✓
- Add spot dialog: "Выбрать на карте" button → MapModal editable + Nominatim search → fills lat/lon ✓ (verified with "Владивосток" search → 43.1150678, 131.8855768)

### Caveats
- timeOfDaySubscore in ScoreBreakdownDialog uses heuristic (since minutesFromSunEvent isn't stored on ForecastHour) — single-factor discrepancy of ~5-15 points causes ~3-5 point base-score difference from API truth. All other 7 factors use exact same pure functions.
- Open-Meteo Astronomy API still DNS-unreachable in sandbox — moonrises/moonsets are null, UI shows "—". Should work on user's real phone.
- Lunar day on day card now uses hour 12 (noon) for consistency (was using hour 0 which gave different value than current hour on Home).

### Lint / QA
- `bun run lint` — 0 errors, 0 warnings.
- dev.log: all API calls 200, no JS errors.
- 13 screenshots in /home/z/my-project/download/task12-*.png.
- Test catch deleted to leave clean state.
