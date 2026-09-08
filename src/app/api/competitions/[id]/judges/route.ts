import { NextRequest, NextResponse } from "next/server";
import { addCompetitionJudge } from "@/server/judging/judge-assignment";
import { addCompetitionJudgeSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

// Добавление человека в общий ростер судей соревнования (см. "Общий список
// судей", вкладка "Судьи") — без привязки к категории, отдельно от
// назначения на конкретный дивизион (POST /api/divisions/[id]/judges).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = addCompetitionJudgeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await addCompetitionJudge(id, parsed.data.judgeUserId);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return respondToDomainError(e);
  }
}
