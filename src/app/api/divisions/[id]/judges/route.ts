import { NextRequest, NextResponse } from "next/server";
import { assignJudge, listDivisionJudges, setDivisionJudges } from "@/server/judging/judge-assignment";
import { assignJudgeSchema, setDivisionJudgesSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const judges = await listDivisionJudges(id);
    return NextResponse.json({ judges });
  } catch (e) {
    return respondToDomainError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = assignJudgeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await assignJudge(id, parsed.data.judgeEmail, parsed.data.role);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return respondToDomainError(e);
  }
}

// Сохранить всю судейскую сетку дивизиона разом (две таблички галочек —
// кто судит ведущих/ведомых), не по одному судье за клик.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = setDivisionJudgesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await setDivisionJudges(id, parsed.data.leaderJudgeUserIds, parsed.data.followerJudgeUserIds);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
