import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setDivisionCategoryActive } from "@/server/competition/division-category";
import { respondToDomainError } from "@/server/http";

const schema = z.object({ isActive: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    await setDivisionCategoryActive(id, parsed.data.isActive);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
