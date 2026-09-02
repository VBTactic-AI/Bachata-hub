import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { logModeration } from "@/lib/moderation";

const schema = z.object({ action: z.enum(["block", "unblock"]) });

// Блокировка учётки — единственное действие над пользователями на layer 1
// (смены роли здесь намеренно нет: роли назначаются при регистрации/сидом,
// UI для их смены — отдельная, более рискованная фича вне текущего ТЗ).
// Доступно только ADMIN.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { id } = await params;
  if (id === user.id) {
    return NextResponse.json({ error: "cannot_block_self" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isBlocked = parsed.data.action === "block";
  await prisma.user.update({ where: { id }, data: { isBlocked } });
  await logModeration(user, "USER", id, parsed.data.action, undefined);

  return NextResponse.json({ ok: true });
}
