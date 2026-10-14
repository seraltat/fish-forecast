import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ALL_SPECIES } from "@/lib/species";
import { DEFAULT_WEIGHTS } from "@/lib/forecast";

// POST /api/seed — idempotent seed of FishConfig rows with default weights.
// Always overwrites `weightsJson` with the current DEFAULT_WEIGHTS so that
// algorithm rebalances land in existing installs. Preserves `enabled` flag.
export async function POST() {
  let created = 0;
  let updated = 0;
  for (const sp of ALL_SPECIES) {
    const existing = await db.fishConfig.findUnique({ where: { species: sp } });
    if (existing) {
      await db.fishConfig.update({
        where: { id: existing.id },
        data: {
          weightsJson: JSON.stringify(DEFAULT_WEIGHTS[sp]),
          // keep enabled flag as-is
        },
      });
      updated += 1;
    } else {
      await db.fishConfig.create({
        data: {
          species: sp,
          weightsJson: JSON.stringify(DEFAULT_WEIGHTS[sp]),
          enabled: true,
        },
      });
      created += 1;
    }
  }
  return NextResponse.json({ created, updated, total: ALL_SPECIES.length });
}

// GET to ensure seeded for first run
export async function GET() {
  return POST();
}
