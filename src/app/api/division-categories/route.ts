import { NextRequest, NextResponse } from "next/server";
import { createDivisionCategory } from "@/server/competition/division-category";
import { createDivisionCategorySchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createDivisionCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const category = await createDivisionCategory(parsed.data);
    return NextResponse.json({ ok: true, category });
  } catch (e) {
    return respondToDomainError(e);
  }
}
