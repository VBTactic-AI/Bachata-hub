import type { EventRegistration, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEventAccess } from "./access";
import { formatDateTime } from "@/lib/format";
import { EVENT_REGISTRATION_STATUS_LABELS as STATUS_LABELS } from "@/lib/events/event-type-registry";
import {
  RegistrationForbiddenError,
  RegistrationNotFoundError,
  buildRegistrationOrderBy,
  buildRegistrationWhere,
  syncNoShowForEvent,
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

// Разделитель — ";", не запятая: Excel в русской локали (где запятая —
// десятичный разделитель) при обычном двойном клике по .csv ждёт именно ";"
// и иначе кладёт всю строку в одну колонку A (баг-репорт пользователя,
// 2026-09-15) — сама дата (formatDateTime) тоже содержит запятую, поэтому
// раньше это ломалось вдвойне.
const DELIMITER = ";";

// RFC 4180 (адаптировано под ";" как разделитель): поле в кавычках, если
// содержит разделитель/кавычку/перенос строки; кавычка внутри —
// экранируется удвоением. Обычная запятая внутри значения (даты вида
// "вт, 15 сентября") — больше не спецсимвол, экранировать не нужно.
function csvField(value: string): string {
  if (value.includes(DELIMITER) || value.includes('"') || /[\r\n]/.test(value)) {
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
  const lines = [header.join(DELIMITER)];
  for (const r of rows) {
    lines.push(
      [csvField(r.displayName), csvField(formatDateTime(r.createdAt)), csvField(STATUS_LABELS[r.status]), csvField(r.isPaid ? "Да" : "Нет")].join(
        DELIMITER
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
  await syncNoShowForEvent(event);

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
