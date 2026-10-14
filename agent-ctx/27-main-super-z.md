# Task 27 — agent-ctx record

- Agent: main (Super Z)
- Task ID: 27
- Task: Apply 4 user-requested changes to the Fish Bite Forecast PWA:
  1. Quick batch entry for multiple fish in AddCatchDialog
  2. Daily fishing summary in Diary tab
  3. Analytics spot filter
  4. Spot-aware краснопёрка filtering (only Раздольная/Артемовка)
- Status: ✅ Completed
- Lint: 0 errors
- Dev log: all endpoints 200, no JS errors
- All UI in Russian, no blue/indigo colors

## Files changed
1. NEW: `src/app/api/catches/batch/route.ts` — POST handler creates N identical Catch rows via `createMany` in a `$transaction`
2. MODIFIED: `src/app/api/analytics/route.ts` — accepts `?spotId`, computes `relevantSpecies` (краснопёрка only for Раздольная/Артемовка), passes relevantSpecies to suggestions
3. MODIFIED: `src/lib/api.ts` — added `catches.batch()` helper, `analytics()` accepts optional spotId
4. MODIFIED: `src/components/fish/AddCatchDialog.tsx` — Tabs (Одна рыба / Несколько рыб) with batch form (Количество, Ср. вес, Ср. длина)
5. MODIFIED: `src/components/tabs/DiaryTab.tsx` — `buildDailySummary()` + summary card "Сводка за день"
6. MODIFIED: `src/components/tabs/AnalyticsTab.tsx` — SpotFilter dropdown + use `relevantSpecies` everywhere

## Test data added during verification
- 3 карась × 0.2 kg at Канал (curl batch test)
- 2 краснопёрка × 0.15 kg at Раздольная (curl batch test, needed to verify краснопёрка filtering)
- 3 карась × 0.25 kg at Артемовка (UI batch test via agent-browser)
- Total DB now has 16 catches. User can wipe via Settings sheet if they want.

## Key bug encountered
- Radix Select.Item doesn't allow empty-string value (used internally to clear selection). Initial `<SelectItem value="">Все места</SelectItem>` crashed AnalyticsTab with runtime error. Fix: use sentinel `"__all__"` internally and translate back to `""` on `onChange`.

## Verification
- curl tests all pass:
  * POST /api/catches/batch with count=3 → creates 3 catches
  * GET /api/analytics → краснопёрка in relevantSpecies (2 catches exist)
  * GET /api/analytics?spotId=Канал → краснопёрка NOT in relevantSpecies ✓
  * GET /api/analytics?spotId=Раздольная → краснопёрка IN relevantSpecies ✓
- agent-browser verified all 4 changes in UI

## Screenshots
- download/task27-diary-summary.png
- download/task27-add-catch-tabs.png
- download/task27-batch-form-filled.png
- download/task27-analytics-all-places.png
- download/task27-analytics-kanal-no-krasnoperka.png
- download/task27-analytics-razdolnaya-krasnoperka.png
