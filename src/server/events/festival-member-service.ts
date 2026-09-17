import { prisma } from "@/lib/prisma";
import { isProgramItemAccessibleByGrants } from "./ticket-service";

// Festival Engine — Stage 6 (2026-09-17, docs/FESTIVAL_SERVICE_LAYER_PLAN.md).
// Личный кабинет участника — НЕ новый домен данных, только чтение уже
// существующих Festival/Ticket/Pass/PassAccessGrant под конкретного
// танцора. Переиспользует ту же логику доступа, что и
// findFestivalPassForEvent/issueFestivalPassEntry (isProgramItemAccessibleByGrants,
// вынесена в ticket-service.ts), но применяет её к ВСЕЙ программе фестиваля
// сразу, не к одному дочернему событию — состав экрана "Мой Pass +
// расписание", не проверка входа на конкретное событие.

export async function getMyFestivalAccess(slug: string, dancerId: string) {
  const festival = await prisma.festival.findUnique({
    where: { slug },
    include: {
      event: true,
      programItems: { orderBy: { startTime: "asc" }, include: { teacher: true, linkedEvent: { select: { slug: true, title: true } } } },
    },
  });
  if (!festival) return null;

  // Черновик без bridge-Event ещё никому не мог продать Pass — ни билета,
  // ни доступной программы быть не может (см. FESTIVAL_ENGINE_ER.md).
  if (!festival.eventId) {
    return { festival, ticket: null, accessibleProgramItems: [] as typeof festival.programItems };
  }

  // Держатель Pass ФЕСТИВАЛЯ — реальная покупка на bridge-Event (price не
  // null для настоящего Ticket, в отличие от производных "входов" на
  // дочерние события, см. комментарий у модели Ticket в schema.prisma).
  // Самый свежий, если по какой-то причине их несколько (не должно — но не
  // валимся, а показываем последний оплаченный).
  const ticket = await prisma.ticket.findFirst({
    where: { eventId: festival.eventId, dancerId, passId: { not: null }, status: "ISSUED", isPaid: true },
    include: { pass: { include: { accessGrants: { select: { programItemId: true } } } } },
    orderBy: { issuedAt: "desc" },
  });

  if (!ticket || !ticket.pass) {
    return { festival, ticket: null, accessibleProgramItems: [] as typeof festival.programItems };
  }

  const accessibleProgramItems = festival.programItems.filter((item) =>
    isProgramItemAccessibleByGrants(ticket.pass!.accessGrants, item.id)
  );

  return {
    festival,
    ticket: { id: ticket.id, passId: ticket.pass.id, passName: ticket.pass.name, issuedAt: ticket.issuedAt },
    accessibleProgramItems,
  };
}

export type MyFestivalAccess = NonNullable<Awaited<ReturnType<typeof getMyFestivalAccess>>>;
