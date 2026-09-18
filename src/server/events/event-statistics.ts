import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEventAccess } from "./access";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// "Распределение по билетам" (2026-09-18, вкладка "Статистика", по прямому
// запросу пользователя — донат-чарт вместо голого текста). Тот же уровень
// доступа, что и у остальной статистики (hasEventAccess) — это не деньги, а
// операционная сводка "чего сколько выдано", нужная любому члену команды.
// Источники — ISSUED Ticket (обычная выдача) и DoorSale ("продажа на
// входе", 2026-09-18) — оба физически являются "билетом" для этого
// графика, группируются по одному и тому же названию продукта.

export type TicketDistributionItem = { name: string; count: number };

export async function getTicketDistributionForEvent(eventId: string, user: User): Promise<TicketDistributionItem[]> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");

  const [tickets, doorSales] = await Promise.all([
    prisma.ticket.findMany({
      where: { eventId, status: "ISSUED" },
      select: { pass: { select: { name: true } }, ticketType: { select: { name: true } } },
    }),
    prisma.doorSale.findMany({ where: { eventId }, select: { nameSnapshot: true } }),
  ]);

  const counts = new Map<string, number>();
  for (const t of tickets) {
    const name = t.pass?.name ?? t.ticketType?.name ?? "Входной билет";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  for (const s of doorSales) {
    counts.set(s.nameSnapshot, (counts.get(s.nameSnapshot) ?? 0) + 1);
  }

  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
