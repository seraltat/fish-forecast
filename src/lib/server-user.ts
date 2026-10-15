// Server-side helper for extracting the per-browser anonymous user ID from
// the `x-user-id` request header. Routes that touch Spot/Catch/Session data
// call this to scope queries to the current user.
//
// The header is sent by the `apiFetch` wrapper in src/lib/user-id.ts.
// If the header is missing (e.g. server-side fetch during SSR, or a stale
// client that hasn't reloaded), we fall back to "default" — the legacy
// bucket that contains pre-isolation data.

const DEFAULT_USER_ID = "default";

export function getUserIdFromRequest(req: Request): string {
  const id = req.headers.get("x-user-id");
  if (!id) return DEFAULT_USER_ID;
  // Basic sanity check — UUID v4 is 36 chars, but we accept anything
  // non-empty and reasonably short. Reject obviously bad values to avoid
  // accidental cross-user leakage via crafted headers.
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 128) return DEFAULT_USER_ID;
  return trimmed;
}
