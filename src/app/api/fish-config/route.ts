import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const configs = await db.fishConfig.findMany();
  return NextResponse.json({ configs });
}

// Re-seed missing defaults (idempotent)
export async function POST() {
  const existing = await db.fishConfig.findMany();
  return NextResponse.json({ configs: existing });
}
