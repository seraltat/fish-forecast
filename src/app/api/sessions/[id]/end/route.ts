import { NextResponse } from "next/server";
import { db } from "@/lib/db";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await db.session.update({
    where: { id },
    data: { endedAt: new Date() },
    include: { spot: true },
  });
  return NextResponse.json({ session });
}
