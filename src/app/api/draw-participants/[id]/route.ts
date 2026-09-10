import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removeDrawHelper, replaceDrawHelper } from "@/server/competition/draw-helper";
import { removeRealParticipant } from "@/server/competition/draw-manual";
import { replaceDrawHelperSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

// Один и тот же DELETE на DrawParticipant обслуживает и помощника, и
// реального участника (режим редактирования, 2026-09-10) — какое из двух
// действий выполнить, решает сама запись (helperSource): у помощника он
// заполнен, у реального участника — нет. Это лишний read, но держит REST-путь
// одним ("удалить участника захода по id"), а не двумя похожими роутами.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const participant = await prisma.drawParticipant.findFirstOrThrow({ where: { id }, select: { helperSource: true } });
    if (participant.helperSource) {
      await removeDrawHelper(id);
    } else {
      await removeRealParticipant(id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = replaceDrawHelperSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const participant = await replaceDrawHelper(id, parsed.data.registrationId);
    return NextResponse.json({ ok: true, participant });
  } catch (e) {
    return respondToDomainError(e);
  }
}
