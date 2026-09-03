import { NextRequest, NextResponse } from "next/server";
import { setCompetitionRules } from "@/server/competition/set-rules";
import { setRulesSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = setRulesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const rules = await setCompetitionRules(id, parsed.data.rules);
    return NextResponse.json({ ok: true, rules });
  } catch (e) {
    return respondToDomainError(e);
  }
}
