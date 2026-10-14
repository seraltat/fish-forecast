import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  let body: { confirm?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: "Требуется confirm='DELETE' в теле запроса" },
      { status: 400 }
    );
  }
  // Delete in order to respect FKs
  await db.catch.deleteMany();
  await db.session.deleteMany();
  await db.spot.deleteMany();
  await db.fishConfig.deleteMany();
  return NextResponse.json({ ok: true });
}
