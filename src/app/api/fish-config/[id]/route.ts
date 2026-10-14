import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DEFAULT_WEIGHTS } from "@/lib/forecast";
import { isSpecies, ALL_SPECIES, type Species } from "@/lib/species";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: { enabled?: boolean; weightsJson?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const data: { enabled?: boolean; weightsJson?: string } = {};
  if (body.enabled !== undefined) data.enabled = body.enabled;
  if (typeof body.weightsJson === "string") data.weightsJson = body.weightsJson;
  const cfg = await db.fishConfig.update({ where: { id }, data });
  return NextResponse.json({ config: cfg });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.fishConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// POST /api/fish-config/[id] — reset weights to defaults for this species
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const cfg = await db.fishConfig.findUnique({ where: { id } });
  if (!cfg) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (isSpecies(cfg.species)) {
    const sp = cfg.species as Species;
    await db.fishConfig.update({
      where: { id },
      data: { weightsJson: JSON.stringify(DEFAULT_WEIGHTS[sp]) },
    });
  }
  return NextResponse.json({ ok: true });
}

// Helper export for re-seeding
export async function ensureSeeded() {
  for (const sp of ALL_SPECIES) {
    const existing = await db.fishConfig.findUnique({ where: { species: sp } });
    if (!existing) {
      await db.fishConfig.create({
        data: {
          species: sp,
          weightsJson: JSON.stringify(DEFAULT_WEIGHTS[sp]),
          enabled: true,
        },
      });
    }
  }
}
