import { NextRequest, NextResponse } from "next/server";
import { createRound } from "@/server/competition/create-round";
import { createRoundSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createRoundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const round = await createRound(id, parsed.data);
    return NextResponse.json({ ok: true, round });
  } catch (e) {
    return respondToDomainError(e);
  }
}
