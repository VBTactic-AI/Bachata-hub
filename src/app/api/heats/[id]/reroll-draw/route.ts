import { NextRequest, NextResponse } from "next/server";
import { rerollHeatDraw } from "@/server/competition/draw-engine";
import { rerollDrawSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = rerollDrawSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const draw = await rerollHeatDraw(id, parsed.data.reason);
    return NextResponse.json({ ok: true, draw });
  } catch (e) {
    return respondToDomainError(e);
  }
}
