// Anonymous per-browser user ID — stored in localStorage, sent as the
// `x-user-id` header with every API request to /api/*. Each browser/device
// gets its own UUID, so Spot/Catch/Session data is isolated per user.
// No login needed — ID is generated on first visit and reused.

const STORAGE_KEY = "fish-forecast-user-id";

// Server-side fallback when window/localStorage is unavailable
// (SSR, RSC, build time). Real value is always set in the browser.
const DEFAULT_USER_ID = "default";

/**
 * Returns the current browser's anonymous user ID. Generates a UUID v4 on
 * first call and persists it to localStorage. Returns "default" when called
 * outside the browser (SSR/Node) — server routes must read the value from
 * the `x-user-id` header instead.
 */
export function getUserId(): string {
  if (typeof window === "undefined") return DEFAULT_USER_ID;
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      // crypto.randomUUID is available in all modern browsers and in secure
      // contexts (https or localhost). Fall back to a UUIDv4 generated from
      // crypto.getRandomValues just in case.
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        id = crypto.randomUUID();
      } else {
        id = uuidV4Fallback();
      }
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // localStorage may be disabled (private mode in some browsers) — degrade
    // gracefully by returning the default. Data won't be isolated in this
    // case, but the app still works.
    return DEFAULT_USER_ID;
  }
}

/**
 * Wrapper around `fetch` that automatically attaches the `x-user-id` header
 * for the current browser. Use this instead of `fetch` for any request to
 * `/api/*` so the server can scope Spot/Catch/Session queries by user.
 */
export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const userId = getUserId();
  const headers = new Headers(options.headers || undefined);
  // Don't overwrite if caller already set it explicitly (rare).
  if (!headers.has("x-user-id")) {
    headers.set("x-user-id", userId);
  }
  return fetch(url, { ...options, headers });
}

// RFC4122 v4 UUID fallback — only used if crypto.randomUUID is missing.
function uuidV4Fallback(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    // Extremely rare path — Math.random fallback. Not cryptographic, but
    // collisions are astronomically unlikely for a single browser.
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Set version (4) and variant (10xx) bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
