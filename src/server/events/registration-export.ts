import type { EventRegistration, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEventAccess } from "./access";
import { formatDateTime } from "@/lib/format";
import {
  RegistrationForbiddenError,
  RegistrationNotFoundError,
  buildRegistrationOrderBy,
  buildRegistrationWhere,
  type RegistrationFilter,
} from "./registration-service";

// §11 ТЗ (Event CRM) — экспорт списка участников. Уважает те же
// search/status/isPaid/sort, что и listEventRegistrations() (общий
// where/orderBy — см. registration-service.ts), но без пагинации: экспорт
// должен отдать ВСЁ, что подходит под фильтр, не только текущую страницу.

// Защита от неограниченной выгрузки одним запросом — типичное событие на
// порядки меньше; если когда-нибудь понадобится больше, это осознанный
// повод сделать постраничный экспорт, а не тихо отдавать миллион строк.
const MAX_EXPORT_ROWS = 5000;

const STATUS_LABELS: Record<EventRegistration["status"], string> = {
  REGISTERED: "Зарегистрирован",
  CONFIRMED: "Подтверждён",
  WAITLIST: "Лист ожидания",
  CANCELLED: "Отменил сам",
  REJECTED: "Отклонён",
  NO_SHOW: "Не пришёл",
};

// RFC 4180: поле в кавычках, если содержит запятую/кавычку/перенос строки;
// кавычка внутри — экранируется удвоением.
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export type RegistrationExportRow = {
  displayName: string;
  createdAt: Date;
  status: EventRegistration["status"];
  isPaid: boolean;
};

// Чистая функция — тестируется отдельно от БД/прав доступа.
export function buildRegistrationsCsv(rows: RegistrationExportRow[]): string {
  const header = ["Участник", "Дата регистрации", "Статус", "Оплата"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [csvField(r.displayName), csvField(formatDateTime(r.createdAt)), csvField(STATUS_LABELS[r.status]), csvField(r.isPaid ? "Да" : "Нет")].join(
        ","
      )
    );
  }
  // BOM — чтобы Excel корректно определил UTF-8 и не показал кириллицу
  // кракозябрами (стандартный приём для CSV с не-ASCII содержимым).
  return "﻿" + lines.join("\r\n");
}

export async function exportEventRegistrationsCsv(eventId: string, user: User, filter: RegistrationFilter): Promise<string> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");

  const rows = await prisma.eventRegistration.findMany({
    where: buildRegistrationWhere(eventId, filter),
    include: { dancer: { select: { displayName: true } } },
    orderBy: buildRegistrationOrderBy(filter.sortBy, filter.sortDir),
    take: MAX_EXPORT_ROWS,
  });

  return buildRegistrationsCsv(
    rows.map((r) => ({ displayName: r.dancer.displayName, createdAt: r.createdAt, status: r.status, isPaid: r.isPaid }))
  );
}
