import type { SubscriptionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { DomainEventKey, DomainEventPayloadMap } from "@/lib/notifications/domain-event-registry";

// Notification & Subscription Engine — Audience Resolver (Phase 4, ТЗ §14).
// Получает доменное событие (RESOLVE-события реестра, см.
// domain-event-registry.ts) и определяет, КАКИЕ подписки на него отвечают —
// сама дедупликация по userId делает Postgres (DISTINCT ON через
// prisma `distinct`), не код: если пользователь подходит сразу по трём
// подпискам, из findMany вернётся одна строка на него.
//
// Registry, не if/else (CLAUDE.md §49) — новое RESOLVE-событие добавляется
// сюда одной записью, matcher описывает только "какие (type, targetId)
// совпадения считать релевантными", а не разбор аудитории целиком.
type TargetMatch = { type: SubscriptionType; targetId: string };

type AudienceMatcher<K extends DomainEventKey> = (payload: DomainEventPayloadMap[K]) => TargetMatch[];

function eventMatches(payload: {
  entityId: string;
  cityId: string;
  format: string;
  schoolId?: string | null;
}): TargetMatch[] {
  const matches: TargetMatch[] = [
    { type: "EVENT", targetId: payload.entityId }, // те, кто следит конкретно за этим событием
    { type: "CITY", targetId: payload.cityId },
    { type: "EVENT_TYPE", targetId: payload.format },
  ];
  if (payload.schoolId) matches.push({ type: "SCHOOL", targetId: payload.schoolId });
  return matches;
}

function competitionMatches(payload: { cityId?: string | null }): TargetMatch[] {
  const matches: TargetMatch[] = [];
  if (payload.cityId) matches.push({ type: "CITY", targetId: payload.cityId });
  // JNJ-соревнования — Event.format = CONTEST (см. docs/00_DECISIONS.md D3):
  // подписка "на конкурсы" (EVENT_TYPE=CONTEST) тоже должна их ловить.
  matches.push({ type: "EVENT_TYPE", targetId: "CONTEST" });
  return matches;
}

const AUDIENCE_MATCHERS: Partial<{ [K in DomainEventKey]: AudienceMatcher<K> }> = {
  EVENT_PUBLISHED: eventMatches,
  EVENT_UPDATED: eventMatches,
  EVENT_CANCELLED: eventMatches,
  JNJ_REGISTRATION_OPENED: competitionMatches,
  JNJ_RESULTS_PUBLISHED: competitionMatches,
};

// Возвращает id пользователей-кандидатов — БЕЗ учёта NotificationPreference
// (это отдельный, более узкий фильтр, применяется после — см. preferences.ts
// и process-job.ts). DIRECT-события (см. реестр) сюда не попадают вообще —
// их получатель уже известен в payload.
export async function resolveAudienceUserIds<K extends DomainEventKey>(
  type: K,
  payload: DomainEventPayloadMap[K]
): Promise<string[]> {
  const matcher = AUDIENCE_MATCHERS[type] as AudienceMatcher<K> | undefined;
  if (!matcher) return [];

  const matches = matcher(payload).filter((m) => Boolean(m.targetId));
  if (matches.length === 0) return [];

  const rows = await prisma.subscription.findMany({
    where: { OR: matches.map((m) => ({ type: m.type, targetId: m.targetId })) },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.map((r) => r.userId);
}
