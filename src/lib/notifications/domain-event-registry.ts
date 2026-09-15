import type { EventFormat, NotificationPriority } from "@prisma/client";

// Notification & Subscription Engine — Domain Event Registry (Phase 4).
// По образцу src/lib/events/event-type-registry.ts: конфигурация, а не
// if/else в движке (CLAUDE.md §49). Добавление нового доменного события —
// новая запись в DomainEventPayloadMap + DOMAIN_EVENT_REGISTRY (+ строка
// NotificationTemplate, см. prisma/seed-notification-templates.ts), не
// правка emitDomainEvent()/processNotificationJob().
//
// audienceKind:
//   RESOLVE — получателей ищет Audience Resolver по подпискам (город/школа/
//             тип события/...), см. src/server/notifications/audience-resolver.ts
//   DIRECT  — уведомление персональное, получатель уже известен в payload
//             (payload.directUserId) — Audience Resolver не вызывается,
//             общие NotificationPreference-фильтры (eventFormatsEnabled/
//             notifyChanges/notifyCancellations) тоже не применяются, это
//             транзакционное уведомление о собственном действии
//             пользователя, а не рассылка (см. JNJ_REGISTERED/SCHOOL_VERIFIED).
//
// Это НЕ дублирует Event Engine/JNJ Competition Engine — только описывает,
// какое уведомление создать в ответ на факт, уже произошедший там. Сами
// точки вызова emitDomainEvent() появятся в Phase 6 (Event Engine) и
// Phase 7 (JNJ), в их собственных сервисах.

export type DomainEventPayloadMap = {
  EVENT_PUBLISHED: {
    entityId: string; // Event.id — для Subscription targetId=EVENT и entityId уведомления
    eventSlug: string; // Event.slug — для deep link /events/{{eventSlug}}
    title: string;
    date: string; // уже отформатированная строка ("20 сентября"), форматирование — на вызывающей стороне
    cityId: string;
    format: EventFormat;
    schoolId?: string | null;
    createdById?: string; // NOTIF-001: Event.createdById — для Subscription targetId=ORGANIZER
  };
  EVENT_UPDATED: {
    entityId: string;
    eventSlug: string;
    title: string;
    cityId: string;
    format: EventFormat;
    schoolId?: string | null;
    createdById?: string;
    changedFields: string[]; // напр. ["startsAt", "venueName"] — не используется в шаблоне, но пригодится для аналитики/аудита
  };
  EVENT_CANCELLED: {
    entityId: string;
    eventSlug: string;
    title: string;
    cityId: string;
    format: EventFormat;
    schoolId?: string | null;
    createdById?: string;
  };
  // NOTIF-001 — напоминание T-минус-N до начала события. RESOLVE, тот же
  // eventMatches()/audience-resolver.ts, что и у EVENT_PUBLISHED (подписчики
  // на EVENT/CITY/EVENT_TYPE/SCHOOL/ORGANIZER) — реминдер адресован тем же
  // подписчикам, не отдельной аудитории. hoursBefore — конкретное значение
  // "за сколько часов", по которому process-job.ts сверяет
  // NotificationPreference.reminderHoursBefore КАЖДОГО кандидата (список
  // произвольный и настраивается пользователем, не фиксированный набор).
  EVENT_REMINDER: {
    entityId: string;
    eventSlug: string;
    title: string;
    date: string;
    cityId: string;
    format: EventFormat;
    schoolId?: string | null;
    createdById?: string;
    hoursBefore: number;
  };
  SCHOOL_VERIFIED: {
    entityId: string; // School.id
    schoolSlug: string;
    schoolName: string;
    directUserId: string; // заявитель, чья заявка AccessRequest(SCHOOL_HEAD) одобрена
  };
  JNJ_REGISTRATION_OPENED: {
    entityId: string; // Competition.id
    competitionName: string;
    cityId?: string | null;
  };
  JNJ_RESULTS_PUBLISHED: {
    entityId: string;
    competitionName: string;
    cityId?: string | null;
  };
  JNJ_REGISTERED: {
    entityId: string;
    competitionName: string;
    directUserId: string; // сам зарегистрировавшийся участник
  };
  // Events Engine — уведомления об изменении СВОЕЙ EventRegistration (не
  // путать с EVENT_PUBLISHED/EVENT_UPDATED/EVENT_CANCELLED, это про само
  // событие для всех подписчиков). Все — DIRECT, получатель уже известен
  // (registration-service.ts), organizer-инициированные решения по конкретному
  // участнику. Самостоятельная отмена участником (cancelMyRegistration) сюда
  // не относится — он и так знает, что сам отменил, и (2026-09-15) CANCELLED
  // теперь вообще зарезервирован только за самим участником: организатор не
  // может ни назначить его напрямую, ни изменить статус уже CANCELLED-строки
  // (см. updateEventRegistration) — поэтому отдельного EVENT_REGISTRATION_
  // CANCELLED для "организатор отменил" больше не существует, этот путь
  // недостижим по построению.
  EVENT_REGISTRATION_CONFIRMED: {
    entityId: string; // Event.id
    eventSlug: string;
    title: string;
    directUserId: string; // User.id зарегистрировавшегося (dancer.userId)
  };
  EVENT_REGISTRATION_REJECTED: {
    entityId: string;
    eventSlug: string;
    title: string;
    directUserId: string;
  };
  // Организатор вручную вернул уже активного (или отклонённого) участника в
  // лист ожидания — этот переход одновременно освобождает место и запускает
  // promoteNextWaitlisted() для кого-то другого, так что демотированный
  // человек должен явно об этом узнать, а не просто "молча пропасть".
  EVENT_REGISTRATION_WAITLISTED: {
    entityId: string;
    eventSlug: string;
    title: string;
    directUserId: string;
  };
  // §7 ТЗ (Event Suggestions) — решение админа по предложению события от
  // обычного пользователя. DIRECT, получатель — сам предложивший
  // (EventSuggestion.suggestedById). Нет eventSlug/deepLink на само событие —
  // approve не создаёт Event автоматически (см. review.ts), деплинк ведёт на
  // /profile, где заявитель видит статус своих предложений.
  EVENT_SUGGESTION_APPROVED: {
    entityId: string; // EventSuggestion.id
    title: string;
    directUserId: string;
  };
  EVENT_SUGGESTION_REJECTED: {
    entityId: string;
    title: string;
    directUserId: string;
  };
};

export type DomainEventKey = keyof DomainEventPayloadMap;

export type AudienceKind = "RESOLVE" | "DIRECT";

export type DomainEventConfig = {
  templateKey: string; // совпадает с NotificationTemplate.key
  defaultPriority: NotificationPriority;
  audienceKind: AudienceKind;
  entityType: string; // для deep link/группировки в Notification Center
};

export const DOMAIN_EVENT_REGISTRY: Record<DomainEventKey, DomainEventConfig> = {
  EVENT_PUBLISHED: { templateKey: "EVENT_PUBLISHED", defaultPriority: "INFO", audienceKind: "RESOLVE", entityType: "EVENT" },
  EVENT_UPDATED: { templateKey: "EVENT_UPDATED", defaultPriority: "IMPORTANT", audienceKind: "RESOLVE", entityType: "EVENT" },
  EVENT_CANCELLED: { templateKey: "EVENT_CANCELLED", defaultPriority: "URGENT", audienceKind: "RESOLVE", entityType: "EVENT" },
  EVENT_REMINDER: { templateKey: "EVENT_REMINDER", defaultPriority: "INFO", audienceKind: "RESOLVE", entityType: "EVENT" },
  SCHOOL_VERIFIED: { templateKey: "SCHOOL_VERIFIED", defaultPriority: "INFO", audienceKind: "DIRECT", entityType: "SCHOOL" },
  JNJ_REGISTRATION_OPENED: {
    templateKey: "JNJ_REGISTRATION_OPENED",
    defaultPriority: "INFO",
    audienceKind: "RESOLVE",
    entityType: "COMPETITION",
  },
  JNJ_RESULTS_PUBLISHED: {
    templateKey: "JNJ_RESULTS_PUBLISHED",
    defaultPriority: "IMPORTANT",
    audienceKind: "RESOLVE",
    entityType: "COMPETITION",
  },
  JNJ_REGISTERED: { templateKey: "JNJ_REGISTERED", defaultPriority: "INFO", audienceKind: "DIRECT", entityType: "COMPETITION" },
  EVENT_REGISTRATION_CONFIRMED: {
    templateKey: "EVENT_REGISTRATION_CONFIRMED",
    defaultPriority: "INFO",
    audienceKind: "DIRECT",
    entityType: "EVENT",
  },
  EVENT_REGISTRATION_REJECTED: {
    templateKey: "EVENT_REGISTRATION_REJECTED",
    defaultPriority: "IMPORTANT",
    audienceKind: "DIRECT",
    entityType: "EVENT",
  },
  EVENT_REGISTRATION_WAITLISTED: {
    templateKey: "EVENT_REGISTRATION_WAITLISTED",
    defaultPriority: "IMPORTANT",
    audienceKind: "DIRECT",
    entityType: "EVENT",
  },
  EVENT_SUGGESTION_APPROVED: {
    templateKey: "EVENT_SUGGESTION_APPROVED",
    defaultPriority: "INFO",
    audienceKind: "DIRECT",
    entityType: "EVENT_SUGGESTION",
  },
  EVENT_SUGGESTION_REJECTED: {
    templateKey: "EVENT_SUGGESTION_REJECTED",
    defaultPriority: "INFO",
    audienceKind: "DIRECT",
    entityType: "EVENT_SUGGESTION",
  },
};
