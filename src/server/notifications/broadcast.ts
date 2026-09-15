import type { NotificationChannel, NotificationPriority, Prisma, SubscriptionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EVENT_TYPE_REGISTRY } from "@/lib/events/event-type-registry";
import { buildNameFilter } from "@/server/competition/search-dancers";
import { TARGET_EXISTS } from "./subscriptions";
import { resolveTargetLabels } from "./control-center";
import { getPreferenceMap } from "./preferences";
import { retryDeliveryNow } from "./process-job";

// Broadcast — ручная рассылка админом (Control Center). НЕ через
// DomainEventRegistry/NotificationTemplate/NotificationJob: аудитория уже
// известна на входе (не резолвится позже job'ом), текст вводит админ вживую
// в момент отправки. Переиспользует существующий Delivery Engine
// (attemptDelivery через retryDeliveryNow) — новых путей доставки не заводит.

export type BroadcastAudience = { kind: "ALL_USERS" } | { kind: "SUBSCRIBERS"; type: SubscriptionType; targetId: string };

export class BroadcastTargetInvalidError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export class BroadcastValidationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 2000;

function validateContent(title: string, body: string): void {
  if (!title.trim()) throw new BroadcastValidationError("title_required");
  if (title.length > MAX_TITLE_LENGTH) throw new BroadcastValidationError("title_too_long");
  if (!body.trim()) throw new BroadcastValidationError("body_required");
  if (body.length > MAX_BODY_LENGTH) throw new BroadcastValidationError("body_too_long");
}

async function resolveAudience(audience: BroadcastAudience): Promise<{ userIds: string[]; label: string }> {
  if (audience.kind === "ALL_USERS") {
    const users = await prisma.user.findMany({ select: { id: true } });
    return { userIds: users.map((u) => u.id), label: "Все пользователи" };
  }

  const exists = await TARGET_EXISTS[audience.type](audience.targetId);
  if (!exists) throw new BroadcastTargetInvalidError("target_not_found");

  const [rows, labels] = await Promise.all([
    prisma.subscription.findMany({
      where: { type: audience.type, targetId: audience.targetId },
      select: { userId: true },
      distinct: ["userId"],
    }),
    resolveTargetLabels(audience.type, [audience.targetId]),
  ]);

  return { userIds: rows.map((r) => r.userId), label: labels.get(audience.targetId) ?? audience.targetId };
}

export async function previewBroadcastAudience(audience: BroadcastAudience): Promise<{ recipientCount: number; label: string }> {
  const { userIds, label } = await resolveAudience(audience);
  return { recipientCount: userIds.length, label };
}

export type BroadcastTargetOption = { targetId: string; label: string };

// Кандидаты для выбора конкретной цели рассылки. CITY/COUNTRY/EVENT_TYPE —
// короткие исчерпывающие списки (обычный <select>, query игнорируется).
// SCHOOL/EVENT/INSTRUCTOR — поиск по имени (тот же buildNameFilter, что и
// searchDancersByName/searchJudgeCandidatesByName), т.к. записей может быть
// много.
export async function listBroadcastTargetOptions(type: SubscriptionType, query?: string): Promise<BroadcastTargetOption[]> {
  if (type === "EVENT_TYPE") {
    return Object.values(EVENT_TYPE_REGISTRY).map((c) => ({ targetId: c.format, label: c.label }));
  }
  if (type === "CITY") {
    const rows = await prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } });
    return rows.map((r) => ({ targetId: r.id, label: r.nameRu }));
  }
  if (type === "COUNTRY") {
    const rows = await prisma.country.findMany({ orderBy: { nameRu: "asc" } });
    return rows.map((r) => ({ targetId: r.id, label: r.nameRu }));
  }

  const trimmed = (query ?? "").trim();
  if (trimmed.length < 2) return [];
  const filter = buildNameFilter(trimmed);

  if (type === "SCHOOL") {
    const rows = await prisma.school.findMany({ where: { name: filter }, orderBy: { name: "asc" }, take: 10 });
    return rows.map((r) => ({ targetId: r.id, label: r.name }));
  }
  if (type === "EVENT") {
    const rows = await prisma.event.findMany({ where: { title: filter }, orderBy: { title: "asc" }, take: 10 });
    return rows.map((r) => ({ targetId: r.id, label: r.title }));
  }
  if (type === "INSTRUCTOR") {
    const rows = await prisma.teacher.findMany({ where: { name: filter }, orderBy: { name: "asc" }, take: 10 });
    return rows.map((r) => ({ targetId: r.id, label: r.name }));
  }
  if (type === "ORGANIZER") {
    // NOTIF-001 — организатор ищется по email (гарантированно есть у любого
    // User) или по displayName связанного Dancer (если есть) — сам
    // организатор как сущность не заведён, targetId = User.id.
    const rows = await prisma.user.findMany({
      where: {
        OR: [{ role: { in: ["SCHOOL_REP", "ORGANIZER", "MODERATOR", "ADMIN"] } }, { isVerifiedEventOrganizer: true }],
        AND: { OR: [{ email: filter }, { dancer: { displayName: filter } }] },
      },
      include: { dancer: { select: { displayName: true } } },
      orderBy: { email: "asc" },
      take: 10,
    });
    return rows.map((r) => ({ targetId: r.id, label: r.dancer ? `${r.dancer.displayName} (${r.email})` : r.email }));
  }

  return [];
}

export type SendBroadcastParams = {
  sentById: string;
  audience: BroadcastAudience;
  title: string;
  body: string;
  deepLink?: string | null;
  priority?: NotificationPriority;
  clientRequestId: string;
};

export type SendBroadcastResult = { broadcastId: string; recipientCount: number; alreadySent: boolean };

// Идемпотентность — уникальный clientRequestId, сгенерированный клиентом при
// открытии формы отправки (не на каждый клик "Отправить"): повторный клик от
// двойного тапа или сетевой ретрай того же запроса не создаёт вторую рассылку
// (тот же принцип, что clientSubmissionId у оценок судьи, A16 в
// 00_DECISIONS.md) — конфликт по уникальному индексу ловится явно, не
// предварительной проверкой (устраняет гонку между "проверили — нет" и
// "создали").
export async function sendBroadcast(params: SendBroadcastParams): Promise<SendBroadcastResult> {
  validateContent(params.title, params.body);
  const title = params.title.trim();
  const body = params.body.trim();
  const deepLink = params.deepLink?.trim() || null;
  const priority = params.priority ?? "IMPORTANT";

  const { userIds, label } = await resolveAudience(params.audience);

  let broadcast;
  let alreadySent = false;
  try {
    broadcast = await prisma.broadcast.create({
      data: {
        title,
        body,
        deepLink,
        targetType: params.audience.kind === "SUBSCRIBERS" ? params.audience.type : null,
        targetId: params.audience.kind === "SUBSCRIBERS" ? params.audience.targetId : null,
        targetLabel: label,
        recipientCount: userIds.length,
        sentById: params.sentById,
        clientRequestId: params.clientRequestId,
      },
    });
  } catch (err) {
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
      const existing = await prisma.broadcast.findUniqueOrThrow({ where: { clientRequestId: params.clientRequestId } });
      return { broadcastId: existing.id, recipientCount: existing.recipientCount, alreadySent: true };
    }
    throw err;
  }

  if (userIds.length === 0) {
    return { broadcastId: broadcast.id, recipientCount: 0, alreadySent };
  }

  const notificationsData = userIds.map((userId) => ({
    userId,
    type: "BROADCAST",
    priority,
    title,
    body,
    entityType: "BROADCAST",
    entityId: broadcast.id,
    deepLink,
    broadcastId: broadcast.id,
    idempotencyKey: `BROADCAST:${broadcast.id}:${userId}`,
  }));
  await prisma.notification.createMany({ data: notificationsData, skipDuplicates: true });

  const created = await prisma.notification.findMany({
    where: { idempotencyKey: { in: notificationsData.map((n) => n.idempotencyKey) } },
    select: { id: true, userId: true },
  });

  // Канал доставки — по личным настройкам получателя (channelsEnabled), как
  // и у обычных доменных событий, а не выбор админа: рассылка не должна
  // обходить то, что пользователь сам выключил.
  const prefs = await getPreferenceMap(created.map((n) => n.userId));
  const deliveriesData = created.flatMap((n) => {
    const channels = prefs.get(n.userId)?.channelsEnabled ?? (["IN_APP"] as NotificationChannel[]);
    return channels.map((channel) => ({ notificationId: n.id, channel }));
  });

  if (deliveriesData.length > 0) {
    await prisma.notificationDelivery.createMany({ data: deliveriesData, skipDuplicates: true });

    const createdDeliveries = await prisma.notificationDelivery.findMany({
      where: { notificationId: { in: created.map((n) => n.id) }, status: "PENDING" },
      select: { id: true },
    });

    // Best-effort сразу же, тем же переиспользуемым attemptDelivery, что и у
    // обычных уведомлений/ручного "Повторить сейчас" (Phase 9) — ни один
    // сбой отдельной доставки не должен прервать остальные.
    await Promise.all(createdDeliveries.map((d) => retryDeliveryNow(d.id).catch(() => {})));
  }

  return { broadcastId: broadcast.id, recipientCount: userIds.length, alreadySent };
}

export type BroadcastHistoryRow = {
  id: string;
  title: string;
  body: string;
  targetType: SubscriptionType | null;
  targetLabel: string;
  recipientCount: number;
  sentByEmail: string;
  createdAt: Date;
};

export async function listBroadcastHistory(limit = 20): Promise<BroadcastHistoryRow[]> {
  const rows = await prisma.broadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { sentBy: { select: { email: true } } },
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    targetType: r.targetType,
    targetLabel: r.targetLabel,
    recipientCount: r.recipientCount,
    sentByEmail: r.sentBy.email,
    createdAt: r.createdAt,
  }));
}
