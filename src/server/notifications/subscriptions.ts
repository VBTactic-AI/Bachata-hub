import { prisma } from "@/lib/prisma";
import type { SubscriptionType } from "@prisma/client";
import { EVENT_TYPE_REGISTRY } from "@/lib/events/event-type-registry";

// Notification & Subscription Engine — Subscription Engine (Phase 3).
// Универсальная модель type+targetId (см. docs/00_DECISIONS.md-стиль
// обсуждения этой задачи): добавление нового SubscriptionType — новая
// запись в TARGET_EXISTS ниже, не переделка subscribe()/unsubscribe().
// Organizer как отдельная сущность не заведена — подписка "на организатора"
// это подписка type=SCHOOL (Event.organizerName без школы не участвует).
// Matching "кто должен получить уведомление по конкретному событию" — это
// отдельный Audience Resolver (Phase 4), сюда не относится.

export class SubscriptionTargetInvalidError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export class SubscriptionNotFoundError extends Error {}

// Registry, а не if/else (CLAUDE.md §49) — по образцу EVENT_TYPE_REGISTRY.
const TARGET_EXISTS: Record<SubscriptionType, (targetId: string) => Promise<boolean>> = {
  EVENT: async (id) => (await prisma.event.findUnique({ where: { id }, select: { id: true } })) !== null,
  SCHOOL: async (id) => (await prisma.school.findUnique({ where: { id }, select: { id: true } })) !== null,
  CITY: async (id) => (await prisma.city.findUnique({ where: { id }, select: { id: true } })) !== null,
  COUNTRY: async (id) => (await prisma.country.findUnique({ where: { id }, select: { id: true } })) !== null,
  INSTRUCTOR: async (id) => (await prisma.teacher.findUnique({ where: { id }, select: { id: true } })) !== null,
  // Значение — код EventFormat, не id строки в БД.
  EVENT_TYPE: async (id) => id in EVENT_TYPE_REGISTRY,
};

async function assertValidTarget(type: SubscriptionType, targetId: string) {
  if (!targetId) throw new SubscriptionTargetInvalidError("invalid_target");
  const exists = await TARGET_EXISTS[type](targetId);
  if (!exists) throw new SubscriptionTargetInvalidError("target_not_found");
}

// Идемпотентно — повторная подписка на то же самое не создаёт дубликат и
// не считается ошибкой (optimistic UI на клиенте, п.35 ТЗ).
export async function subscribe(userId: string, type: SubscriptionType, targetId: string) {
  await assertValidTarget(type, targetId);

  return prisma.subscription.upsert({
    where: { userId_type_targetId: { userId, type, targetId } },
    create: { userId, type, targetId, source: "USER" },
    update: {},
  });
}

// userId в where — ownership-проверка прямо в запросе (нельзя отписать
// чужую подписку, даже зная её id), не отдельным чтением+сравнением.
export async function unsubscribe(userId: string, subscriptionId: string) {
  const result = await prisma.subscription.deleteMany({
    where: { id: subscriptionId, userId },
  });
  if (result.count === 0) throw new SubscriptionNotFoundError();
}

export async function listSubscriptions(userId: string, type?: SubscriptionType) {
  return prisma.subscription.findMany({
    where: { userId, ...(type ? { type } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

// Батч-проверка "на что из этого списка я уже подписан" — для follow-кнопок
// в списках карточек (школы/города/...), без запроса на каждую карточку.
export async function getSubscribedTargetIds(
  userId: string,
  type: SubscriptionType,
  targetIds: string[]
): Promise<Set<string>> {
  if (targetIds.length === 0) return new Set();
  const rows = await prisma.subscription.findMany({
    where: { userId, type, targetId: { in: targetIds } },
    select: { targetId: true },
  });
  return new Set(rows.map((r) => r.targetId));
}
