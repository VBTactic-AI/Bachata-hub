import { NextRequest, NextResponse } from "next/server";
import { getRotationView } from "@/server/rotation/rotation-engine";
import { respondToDomainError } from "@/server/http";

// Опрос состояния таймера/ротации клиентом (раз в 2–3 сек) — сервер
// источник времени, docs/00_DECISIONS.md.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const view = await getRotationView(id);
    return NextResponse.json({ ok: true, ...view });
  } catch (e) {
    return respondToDomainError(e);
  }
}
