import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ensureBridgedUser } from "@/server/auth/bridge-user";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Email+пароль теперь проверяет Supabase Auth (signInWithPassword) — не
// сравнение с bcrypt-хэшем в public.User. Ответ сознательно не разделяет
// "нет такого email"/"неверный пароль" (как и раньше), чтобы не давать
// перечислять существующие адреса.
//
// signInWithPassword завершается сразу (без редиректа), в отличие от OAuth —
// поэтому связка с public.User (ensureBridgedUser) вызывается прямо здесь,
// а не только в src/app/auth/callback/route.ts.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error || !data.user) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  await ensureBridgedUser({ supabaseUserId: data.user.id, email: data.user.email ?? email });
  return NextResponse.json({ ok: true });
}
