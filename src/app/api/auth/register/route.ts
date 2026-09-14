import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession } from "@/lib/auth";

// Роль больше не выбирается при регистрации (по прямому решению
// пользователя, 2026-09-14) — все регистрируются как обычные танцоры
// (DANCER, дефолт схемы). Проверенный доступ (организатор событий/
// фестиваля, руководитель школы, организатор соревнований) выдаётся только
// через одобрение AccessRequest, см. /become-organizer.
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1).max(80),
  cityId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { password, displayName, cityId } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      dancer: {
        create: {
          displayName,
          cityId: cityId || undefined,
        },
      },
    },
  });

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
