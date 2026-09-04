import { NextRequest, NextResponse } from "next/server";
import { checkFinalReadiness, startFinal } from "@/server/competition/start-final";
import { respondToDomainError } from "@/server/http";

// GET — список проблем готовности (пустой массив = можно начинать, промт
// пользователя п.50). POST — собственно "Начать финал" (идемпотентно).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const issues = await checkFinalReadiness(id);
    return NextResponse.json({ issues });
  } catch (e) {
    return respondToDomainError(e);
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await startFinal(id);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return respondToDomainError(e);
  }
}
