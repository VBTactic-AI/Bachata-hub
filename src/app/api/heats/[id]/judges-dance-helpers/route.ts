import { NextRequest, NextResponse } from "next/server";
import { addJudgesDanceHelper } from "@/server/judging/final-judges-dance";
import { addJudgesDanceHelperSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = addJudgesDanceHelperSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const participant = await addJudgesDanceHelper(id, parsed.data.registrationId);
    return NextResponse.json({ ok: true, participant });
  } catch (e) {
    return respondToDomainError(e);
  }
}
