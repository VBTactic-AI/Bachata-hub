import { NextRequest, NextResponse } from "next/server";
import { createJudgingCriterionCatalog } from "@/server/competition/judging-criteria-catalog";
import { createJudgingCriterionCatalogSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createJudgingCriterionCatalogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const criterion = await createJudgingCriterionCatalog(parsed.data);
    return NextResponse.json({ ok: true, criterion });
  } catch (e) {
    return respondToDomainError(e);
  }
}
