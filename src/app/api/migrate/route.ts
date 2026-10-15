import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/server-user";

// POST /api/migrate — one-time claim of legacy data.
//
// Before per-user isolation was added, all Spot/Catch/Session rows were
// shared (no userId column). After adding the column with a default of
// "default", those rows are inaccessible to new users (since each user's
// queries filter by their own UUID).
//
// This endpoint lets the FIRST visitor claim the legacy bucket: all rows
// with userId="default" are re-assigned to the current user's x-user-id.
// Returns { claimed: { spots, catches, sessions } } so the client can
// show a toast. Safe to call multiple times — once the default bucket is
// empty, subsequent calls are a no-op.
//
// If a different browser tries to call migrate after the legacy data is
// already claimed, they'll get zeros back (their own ID gets nothing).
// This preserves the "first user keeps their data" semantics.
export async function POST(req: Request) {
  const userId = getUserIdFromRequest(req);
  // Don't allow claiming "default" → "default" (no-op identity migration).
  if (userId === "default") {
    return NextResponse.json(
      { error: "Невозможно мигрировать: x-user-id отсутствует" },
      { status: 400 }
    );
  }

  // Use a transaction so the claim is atomic.
  const [spots, catches, sessions] = await db.$transaction([
    db.spot.updateMany({ where: { userId: "default" }, data: { userId } }),
    db.catch.updateMany({ where: { userId: "default" }, data: { userId } }),
    db.session.updateMany({ where: { userId: "default" }, data: { userId } }),
  ]);

  return NextResponse.json({
    claimed: {
      spots: spots.count,
      catches: catches.count,
      sessions: sessions.count,
    },
    userId,
  });
}
