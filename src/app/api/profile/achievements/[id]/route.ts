import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const patchSchema = z.object({
  description: z.string().min(3).max(300),
  achievedAt: z.string(),
  eventId: z.string().optional(),
});

// Редактировать/удалять можно только собственные достижения, и только те,
// что заполнены самим танцором вручную (source: MANUAL) — результаты
// будущего слоя 3 (CONTEST_RESULT) сюда не попадают, они источник правды
// из цифрового судейства и не должны переписываться руками из профиля.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dancer = await prisma.dancer.findUnique({ where: { userId: user.id } });
  if (!dancer) return NextResponse.json({ error: "no_dancer_profile" }, { status: 400 });

  const { id } = await params;
  const achievement = await prisma.achievement.findUnique({ where: { id } });
  if (!achievement || achievement.dancerId !== dancer.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (achievement.source !== "MANUAL") {
    return NextResponse.json({ error: "not_editable" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // Та же защита, что и при создании: привязать можно только к событию,
  // на котором сам танцор отмечал "был".
  let eventId: string | undefined;
  if (parsed.data.eventId) {
    const attendance = await prisma.attendance.findUnique({
      where: { dancerId_eventId: { dancerId: dancer.id, eventId: parsed.data.eventId } },
    });
    if (attendance?.status === "WENT") {
      eventId = parsed.data.eventId;
    }
  }

  const updated = await prisma.achievement.update({
    where: { id },
    data: {
      description: parsed.data.description,
      achievedAt: new Date(parsed.data.achievedAt),
      eventId: eventId ?? null,
    },
  });

  return NextResponse.json({ ok: true, achievement: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dancer = await prisma.dancer.findUnique({ where: { userId: user.id } });
  if (!dancer) return NextResponse.json({ error: "no_dancer_profile" }, { status: 400 });

  const { id } = await params;
  const achievement = await prisma.achievement.findUnique({ where: { id } });
  if (!achievement || achievement.dancerId !== dancer.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.achievement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
