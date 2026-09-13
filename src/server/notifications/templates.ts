import { prisma } from "@/lib/prisma";

// Notification & Subscription Engine — шаблоны (Phase 4, ТЗ §16). Тексты не
// зашиты в бизнес-логику — рендерятся простой {{var}}-подстановкой поверх
// строк NotificationTemplate (заполняются prisma/seed-notification-templates.ts,
// редактируемы админом в будущем без деплоя).

export class TemplateNotFoundError extends Error {}

// Пустая строка вместо undefined/null — по образцу существующих шаблонов
// проекта; отсутствующий плейсхолдер не должен ломать всю строку.
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = data[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export async function getActiveTemplate(key: string) {
  const template = await prisma.notificationTemplate.findUnique({ where: { key } });
  if (!template || !template.isActive) throw new TemplateNotFoundError(key);
  return template;
}
