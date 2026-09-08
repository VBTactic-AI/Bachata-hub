import { NextRequest, NextResponse } from "next/server";
import { updateJudgingCriterionCatalog } from "@/server/competition/judging-criteria-catalog";
import { updateJudgingCriterionCatalogSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateJudgingCriterionCatalogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await updateJudgingCriterionCatalog(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
