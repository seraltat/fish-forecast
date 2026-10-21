// Client-side API helpers using relative URLs.
// All requests go through `apiFetch`, which attaches the per-browser
// `x-user-id` header so the server can scope Spot/Catch/Session data
// to the current anonymous user.
import type { ForecastResponse } from "./types";
import type { Species } from "./species";
import { apiFetch } from "./user-id";

const API = "/api";

export async function apiGet<T>(path: string): Promise<T> {
  const resp = await apiFetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || "Ошибка запроса");
  }
  return resp.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const resp = await apiFetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || "Ошибка запроса");
  }
  return resp.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const resp = await apiFetch(`${API}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || "Ошибка запроса");
  }
  return resp.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const resp = await apiFetch(`${API}${path}`, { method: "DELETE" });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || "Ошибка запроса");
  }
  return resp.json() as Promise<T>;
}

// ---- typed helpers ----

export interface SpotDTO {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  description: string | null;
  waterType: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatchDTO {
  id: string;
  spotId: string;
  species: string; // Species key or разнорыбица sub-type name (arbitrary string)
  weightKg: number;
  lengthCm: number | null;
  caughtAt: string;
  bait: string | null;
  notes: string | null;
  photo: string | null;
  sessionId: string | null;
  waterTemp: number | null;
  airTemp: number | null;
  windSpeed: number | null;
  windDir: number | null;
  pressure: number | null;
  moonPhase: number | null;
  predictedScore: number | null;
  createdAt: string;
  spot?: SpotDTO;
  session?: { id: string; startedAt: string; endedAt: string | null } | null;
}

export interface SessionDTO {
  id: string;
  spotId: string;
  startedAt: string;
  waterTemp: number | null;
  windDirOverride: number | null;
  windSpeedOverride: number | null;
  pressureOverride: number | null;
  notes: string | null;
  endedAt: string | null;
  createdAt: string;
  spot?: SpotDTO;
}

export const api = {
  spots: {
    list: () => apiGet<{ spots: SpotDTO[] }>("/spots"),
    create: (b: { name: string; latitude: number; longitude: number; description?: string; waterType: string }) =>
      apiPost<{ spot: SpotDTO }>("/spots", b),
    update: (id: string, b: Partial<{ name: string; latitude: number; longitude: number; description: string | null; waterType: string }>) =>
      apiPatch<{ spot: SpotDTO }>(`/spots/${id}`, b),
    remove: (id: string) => apiDelete<{ ok: boolean }>(`/spots/${id}`),
  },
  // Краснопёрка — отдельный прогноз (не привязан к месту). Возвращает SST по заливам
  // и статус миграции ("early" / "starting" / "ready" / "fading" / "winter" / "unknown").
  krasnoperka: () => apiGet<{
    bays: {
      name: string;
      latitude: number;
      longitude: number;
      sst: number | null;
      status: "early" | "starting" | "ready" | "fading" | "winter" | "unknown";
      label: string;
      description: string;
    }[];
    overall: "early" | "starting" | "ready" | "fading" | "winter" | "unknown";
    overallLabel: string;
    fetchedAt: string;
  }>("/krasnoperka"),
  weather: (lat: number, lon: number, days = 7) =>
    apiGet<unknown>(`/weather?lat=${lat}&lon=${lon}&days=${days}`),
  forecast: (b: {
    spotId: string;
    waterTempOverride?: number | null;
    windDirOverride?: number | null;
    windSpeedOverride?: number | null;
    pressureOverride?: number | null;
    targetSpecies?: Species | null;
  }) => apiPost<ForecastResponse>("/forecast", b),
  sessions: {
    list: (activeOnly = false) => apiGet<{ sessions: SessionDTO[] }>(`/sessions${activeOnly ? "?active=1" : ""}`),
    create: (b: {
      spotId: string;
      waterTemp?: number | null;
      windDirOverride?: number | null;
      windSpeedOverride?: number | null;
      pressureOverride?: number | null;
      notes?: string | null;
    }) => apiPost<{ session: SessionDTO }>("/sessions", b),
    update: (id: string, b: Partial<{ waterTemp: number | null; windDirOverride: number | null; windSpeedOverride: number | null; pressureOverride: number | null; notes: string | null }>) =>
      apiPatch<{ session: SessionDTO }>(`/sessions/${id}`, b),
    end: (id: string) => apiPost<{ session: SessionDTO }>(`/sessions/${id}/end`),
  },
  catches: {
    list: (filter?: { spotId?: string; species?: string }) => {
      const q = new URLSearchParams();
      if (filter?.spotId) q.set("spotId", filter.spotId);
      if (filter?.species) q.set("species", filter.species);
      const s = q.toString();
      return apiGet<{ catches: CatchDTO[] }>(`/catches${s ? "?" + s : ""}`);
    },
    create: (b: {
      spotId: string;
      species: string; // accepts Species key OR разнорыбица sub-type name
      weightKg: number;
      lengthCm?: number | null;
      caughtAt?: string;
      bait?: string | null;
      notes?: string | null;
      photo?: string | null;
      sessionId?: string | null;
      waterTemp?: number | null;
      airTemp?: number | null;
      windSpeed?: number | null;
      windDir?: number | null;
      pressure?: number | null;
      moonPhase?: number | null;
      predictedScore?: number | null;
    }) => apiPost<{ catch: CatchDTO }>("/catches", b),
    batch: (b: {
      count: number;
      spotId: string;
      species: string; // accepts Species key OR разнорыбица sub-type name
      weightKg: number;
      lengthCm?: number | null;
      caughtAt?: string;
      bait?: string | null;
      notes?: string | null;
      photo?: string | null;
      sessionId?: string | null;
      waterTemp?: number | null;
      airTemp?: number | null;
      windSpeed?: number | null;
      windDir?: number | null;
      pressure?: number | null;
      moonPhase?: number | null;
      predictedScore?: number | null;
    }) => apiPost<{ count: number; catches: CatchDTO[] }>("/catches/batch", b),
    remove: (id: string) => apiDelete<{ ok: boolean }>(`/catches/${id}`),
  },
  analytics: (spotId?: string) =>
    apiGet<unknown>(spotId ? `/analytics?spotId=${spotId}` : "/analytics"),
  seed: () => apiPost<{ created: number; updated: number; total: number }>("/seed"),
  reset: () => apiPost<{ ok: boolean }>("/reset", { confirm: "DELETE" }),
  // One-time claim of legacy pre-isolation data. Idempotent — no-op after
  // first call returns nonzero. See src/app/api/migrate/route.ts.
  migrate: () =>
    apiPost<{ claimed: { spots: number; catches: number; sessions: number }; userId: string }>("/migrate"),
};
