import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { logModeration } from "@/lib/moderation";
import { formatEventDate } from "@/lib/format";
import { emitDomainEvent } from "@/server/notifications/emit-domain-event";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { id } = await params;

  // QA BUG-010: без этой проверки несуществующий id падал в сыром
  // PrismaClientKnownRequestError (P2025) прямо до клиента (CLAUDE.md §46 —
  // технические детали в логи, пользователю — понятное сообщение).
  const exists = await prisma.event.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const event = await prisma.$transaction(async (tx) => {
    const existing = await tx.event.findUnique({ where: { id } });
    const row = await tx.event.update({
      where: { id },
      data: {
        moderationStatus: parsed.data.action === "approve" ? "APPROVED" : "REJECTED",
        moderatedById: user.id,
        moderatedAt: new Date(),
      },
    });

    // Событие становится РЕАЛЬНО видимым именно сейчас, если организатор уже
    // перевёл его в PUBLISHED, а модерация была последним узким местом (см.
    // Notification & Subscription Engine Phase 6 — второй возможный момент
    // публикации, помимо autoApprove=true внутри upsertEventDraft; тот же
    // idempotencyKey — если оба пути когда-либо совпадут, второй emit будет
    // no-op, не дублирующим уведомлением).
    const becamePublished =
      parsed.data.action === "approve" && row.status === "PUBLISHED" && existing?.moderationStatus !== "APPROVED";
    if (becamePublished) {
      await emitDomainEvent(tx, {
        type: "EVENT_PUBLISHED",
        payload: {
          entityId: row.id,
          eventSlug: row.slug,
          title: row.title,
          date: formatEventDate(row.startsAt),
          cityId: row.cityId,
          format: row.format,
          schoolId: row.schoolId,
        },
        idempotencyKey: `EVENT_PUBLISHED:${row.id}`,
      });
    }

    return row;
  });

  await logModeration(user, "EVENT", event.id, parsed.data.action, parsed.data.reason);

  return NextResponse.json({ ok: true, event });
}
