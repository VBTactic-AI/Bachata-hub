import { NextRequest, NextResponse } from "next/server";
import { setJudgeCategories } from "@/server/judging/judge-assignment";
import { setJudgeCategoriesSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

// Сохранить набор категорий соревнования для ОДНОГО судьи разом (попап с
// галочками по клику на столбец "Категории" в общей таблице судей) — тот же
// приём диффом, что и PUT /api/divisions/[id]/judges, только диф по
// категориям одного судьи, а не по судьям одной категории.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; judgeUserId: string }> }) {
  const { id, judgeUserId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = setJudgeCategoriesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await setJudgeCategories(id, judgeUserId, parsed.data.divisionIds);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
