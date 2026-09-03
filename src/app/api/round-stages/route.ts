import { NextRequest, NextResponse } from "next/server";
import { createRoundStage } from "@/server/competition/round-stage";
import { createRoundStageSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createRoundStageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const stage = await createRoundStage(parsed.data);
    return NextResponse.json({ ok: true, stage });
  } catch (e) {
    return respondToDomainError(e);
  }
}
