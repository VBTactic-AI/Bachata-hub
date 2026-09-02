import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  description: z.string().min(3).max(300),
  achievedAt: z.string(),
  eventId: z.string().optional(),
});

// Достижения сегодня заполняются вручную самим танцором (source: MANUAL).
// Поле source уже сейчас умеет CONTEST_RESULT — слой 3 будет писать сюда же,
// не создавая новую сущность и не мигрируя старые записи.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dancer = await prisma.dancer.findUnique({ where: { userId: user.id } });
  if (!dancer) return NextResponse.json({ error: "no_dancer_profile" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // Разрешаем привязку только к событию, на котором сам танцор отмечал
  // "был" — иначе можно было бы приписать себе достижение на чужом событии.
  let eventId: string | undefined;
  if (parsed.data.eventId) {
    const attendance = await prisma.attendance.findUnique({
      where: { dancerId_eventId: { dancerId: dancer.id, eventId: parsed.data.eventId } },
    });
    if (attendance?.status === "WENT") {
      eventId = parsed.data.eventId;
    }
  }

  const achievement = await prisma.achievement.create({
    data: {
      dancerId: dancer.id,
      description: parsed.data.description,
      achievedAt: new Date(parsed.data.achievedAt),
      eventId,
      source: "MANUAL",
    },
  });

  return NextResponse.json({ ok: true, achievement });
}
