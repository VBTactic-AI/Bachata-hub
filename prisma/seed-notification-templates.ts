// Notification & Subscription Engine — стартовые шаблоны (Phase 4).
//
// Идемпотентно (upsert по key) — можно запускать повторно на боевой базе.
// Ключи совпадают с DomainEventKey из src/lib/notifications/domain-event-registry.ts
// (этот файл намеренно не импортирует его — seed-скрипты проекта работают
// со своим PrismaClient, без зависимостей от @/lib, см. seed-layer3.ts).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEMPLATES = [
  {
    key: "EVENT_PUBLISHED",
    titleTemplate: "Новое событие",
    bodyTemplate: "{{title}} — {{date}}",
    deepLinkTemplate: "/events/{{eventSlug}}",
    defaultPriority: "INFO" as const,
    supportedChannels: ["IN_APP", "WEB_PUSH", "EMAIL"] as const,
  },
  {
    key: "EVENT_UPDATED",
    titleTemplate: "Событие изменилось",
    bodyTemplate: "{{title}}: организатор обновил детали",
    deepLinkTemplate: "/events/{{eventSlug}}",
    defaultPriority: "IMPORTANT" as const,
    supportedChannels: ["IN_APP", "WEB_PUSH", "EMAIL"] as const,
  },
  {
    key: "EVENT_CANCELLED",
    titleTemplate: "Событие отменено",
    bodyTemplate: "«{{title}}» больше не состоится",
    deepLinkTemplate: "/events/{{eventSlug}}",
    defaultPriority: "URGENT" as const,
    supportedChannels: ["IN_APP", "WEB_PUSH", "EMAIL"] as const,
  },
  {
    key: "SCHOOL_VERIFIED",
    titleTemplate: "Школа подтверждена",
    bodyTemplate: "Заявка на «{{schoolName}}» одобрена — теперь вы владелец профиля школы",
    deepLinkTemplate: "/schools/{{schoolSlug}}",
    defaultPriority: "INFO" as const,
    supportedChannels: ["IN_APP", "EMAIL"] as const,
  },
  {
    key: "JNJ_REGISTRATION_OPENED",
    titleTemplate: "Открыта регистрация",
    bodyTemplate: "Регистрация на «{{competitionName}}» открыта",
    deepLinkTemplate: "/compete/{{entityId}}",
    defaultPriority: "INFO" as const,
    supportedChannels: ["IN_APP", "WEB_PUSH", "EMAIL"] as const,
  },
  {
    key: "JNJ_RESULTS_PUBLISHED",
    titleTemplate: "Результаты опубликованы",
    bodyTemplate: "Результаты «{{competitionName}}» опубликованы",
    deepLinkTemplate: "/compete/{{entityId}}",
    defaultPriority: "IMPORTANT" as const,
    supportedChannels: ["IN_APP", "WEB_PUSH", "EMAIL"] as const,
  },
  {
    key: "JNJ_REGISTERED",
    titleTemplate: "Вы зарегистрированы",
    bodyTemplate: "Вы зарегистрированы на «{{competitionName}}»",
    deepLinkTemplate: "/compete/{{entityId}}",
    defaultPriority: "INFO" as const,
    supportedChannels: ["IN_APP", "EMAIL"] as const,
  },
];

async function main() {
  for (const t of TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { key: t.key },
      create: { ...t, supportedChannels: [...t.supportedChannels] },
      update: {
        titleTemplate: t.titleTemplate,
        bodyTemplate: t.bodyTemplate,
        deepLinkTemplate: t.deepLinkTemplate,
        defaultPriority: t.defaultPriority,
        supportedChannels: [...t.supportedChannels],
      },
    });
    console.log(`✓ ${t.key}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
