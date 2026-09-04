import { NextRequest, NextResponse } from "next/server";
import { checkCompetitionResultsReadiness, publishCompetitionResults } from "@/server/results/results";
import { respondToDomainError } from "@/server/http";

// GET — список проблем готовности всего соревнования (пустой массив = можно
// публиковать), по образцу /api/rounds/[id]/start-final. POST — собственно
// публикация всех дивизионов разом (уточнено пользователем, 2026-09-04).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const issues = await checkCompetitionResultsReadiness(id);
    return NextResponse.json({ issues });
  } catch (e) {
    return respondToDomainError(e);
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await publishCompetitionResults(id);
    return NextResponse.json(result);
  } catch (e) {
    return respondToDomainError(e);
  }
}
