import { NextRequest, NextResponse } from "next/server";
import { setFinalCriteria } from "@/server/competition/final-settings";
import { setFinalCriteriaSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

// Полный список критериев дивизиона одним "Сохранить" — реконсиляция диффом
// (final-settings.ts, setFinalCriteria), не добавление по одному.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = setFinalCriteriaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await setFinalCriteria(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
