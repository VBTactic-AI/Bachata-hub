import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { changeBibNumber } from "@/server/competition/check-in";
import { respondToDomainError } from "@/server/http";

const schema = z.object({ bibNumber: z.string().min(1) });

// Ручное изменение номера участника (2026-09-12) — отдельный от check-in
// эндпоинт: номер можно поправить и позже, не только в момент явки, и это
// не то же самое действие (checkin:manage — тот же гейт, что и у самого
// check-in/отмены, задача не просила отдельного права).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    await changeBibNumber(id, parsed.data.bibNumber);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
