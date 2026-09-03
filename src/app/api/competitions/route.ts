import { NextRequest, NextResponse } from "next/server";
import { createCompetition } from "@/server/competition/create-competition";
import { createCompetitionSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createCompetitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const competition = await createCompetition(parsed.data);
    return NextResponse.json({ ok: true, competition });
  } catch (e) {
    return respondToDomainError(e);
  }
}
