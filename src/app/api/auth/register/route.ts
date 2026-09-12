import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1).max(80),
  role: z.enum(["DANCER", "SCHOOL_REP", "ORGANIZER"]),
  cityId: z.string().optional(),
});

// Регистрация через email/пароль по-прежнему собирает роль/имя/город сразу
// (это отдельный выбор от Google/Apple, где такой формы нет и роль всегда
// DANCER по умолчанию — см. src/app/auth/callback/route.ts) — сама личность
// теперь создаётся в Supabase Auth (signUp), а не в виде bcrypt-хэша здесь.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { password, displayName, role, cityId } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) {
    // Supabase сам отклоняет уже существующий в auth.users email — тот же
    // код ответа, что и для дубликата в public.User чуть выше.
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  await prisma.user.create({
    data: {
      email,
      supabaseUserId: data.user.id,
      role,
      lastLoginAt: new Date(),
      dancer: {
        create: {
          displayName,
          cityId: cityId || undefined,
        },
      },
    },
  });

  // Если в проекте включено подтверждение email — сессии на этот момент ещё
  // нет (data.session === null, пользователь должен перейти по ссылке из
  // письма, прежде чем сможет войти). Если подтверждение выключено — сессия
  // уже пришла в signUp() и cookie уже выставлена клиентом Supabase, фронт
  // может сразу считать пользователя вошедшим.
  return NextResponse.json({ ok: true, emailConfirmationRequired: data.session === null });
}
