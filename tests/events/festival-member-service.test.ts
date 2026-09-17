import { describe, it, expect, vi, beforeEach } from "vitest";

// Festival Engine — Stage 6 (2026-09-17, docs/FESTIVAL_SERVICE_LAYER_PLAN.md).
// getMyFestivalAccess() — личный кабинет участника: свой Pass + расписание,
// доступное именно этому Pass. Никакой новой бизнес-логики доступа не
// вводится — переиспользуется isProgramItemAccessibleByGrants() из
// ticket-service.ts (та же проверка, что и у findFestivalPassForEvent).

const festivalFindUnique = vi.fn();
const ticketFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    festival: { findUnique: (...a: unknown[]) => festivalFindUnique(...a) },
    ticket: { findFirst: (...a: unknown[]) => ticketFindFirst(...a) },
  },
}));

const { getMyFestivalAccess } = await import("@/server/events/festival-member-service");

const programItems = [
  { id: "item1", title: "Открытие", type: "PARTY" as const, startTime: new Date("2027-06-01T18:00:00Z"), endTime: null, teacher: null, linkedEvent: null },
  { id: "item2", title: "Мастер-класс Bachata", type: "WORKSHOP" as const, startTime: new Date("2027-06-02T10:00:00Z"), endTime: null, teacher: { name: "Ana" }, linkedEvent: null },
];
const baseFestival = {
  id: "fest1",
  slug: "grodno-latina-fest",
  name: "Grodno Latina Fest",
  venueName: "Дворец культуры",
  startsAt: new Date("2027-06-01T00:00:00Z"),
  endsAt: new Date("2027-06-03T00:00:00Z"),
  eventId: "bridge-event1" as string | null,
  event: { id: "bridge-event1" },
  programItems,
};

beforeEach(() => {
  vi.clearAllMocks();
  festivalFindUnique.mockResolvedValue({ ...baseFestival });
  ticketFindFirst.mockResolvedValue(null);
});

describe("getMyFestivalAccess()", () => {
  it("фестиваль не найден по slug — null", async () => {
    festivalFindUnique.mockResolvedValue(null);
    const result = await getMyFestivalAccess("missing", "dancer1");
    expect(result).toBeNull();
    expect(ticketFindFirst).not.toHaveBeenCalled();
  });

  it("у фестиваля ещё нет bridge-Event (черновик) — ticket null, программа пустая, Ticket вообще не запрашивается", async () => {
    festivalFindUnique.mockResolvedValue({ ...baseFestival, eventId: null });
    const result = await getMyFestivalAccess("grodno-latina-fest", "dancer1");
    expect(result).toEqual({ festival: { ...baseFestival, eventId: null }, ticket: null, accessibleProgramItems: [] });
    expect(ticketFindFirst).not.toHaveBeenCalled();
  });

  it("у танцора нет оплаченного Ticket на bridge-Event — ticket null, программа пустая", async () => {
    ticketFindFirst.mockResolvedValue(null);
    const result = await getMyFestivalAccess("grodno-latina-fest", "dancer1");
    expect(result?.ticket).toBeNull();
    expect(result?.accessibleProgramItems).toEqual([]);
    expect(ticketFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: "bridge-event1", dancerId: "dancer1", passId: { not: null }, status: "ISSUED", isPaid: true } })
    );
  });

  it("Full Pass (пустые accessGrants) — доступна вся программа", async () => {
    ticketFindFirst.mockResolvedValue({
      id: "ticket1",
      issuedAt: new Date("2027-05-01"),
      pass: { id: "pass1", name: "Full Pass", accessGrants: [] },
    });

    const result = await getMyFestivalAccess("grodno-latina-fest", "dancer1");

    expect(result?.ticket).toEqual({ id: "ticket1", passId: "pass1", passName: "Full Pass", issuedAt: new Date("2027-05-01") });
    expect(result?.accessibleProgramItems).toEqual(programItems);
  });

  it("Party Pass с грантом только на item1 — виден только item1, не item2", async () => {
    ticketFindFirst.mockResolvedValue({
      id: "ticket1",
      issuedAt: new Date("2027-05-01"),
      pass: { id: "pass2", name: "Party Pass", accessGrants: [{ programItemId: "item1" }] },
    });

    const result = await getMyFestivalAccess("grodno-latina-fest", "dancer1");

    expect(result?.accessibleProgramItems.map((i) => i.id)).toEqual(["item1"]);
  });

  it("программа фестиваля отсортирована по startTime (уже в самом запросе, но проверяем итоговый порядок)", async () => {
    ticketFindFirst.mockResolvedValue({
      id: "ticket1",
      issuedAt: new Date("2027-05-01"),
      pass: { id: "pass1", name: "Full Pass", accessGrants: [] },
    });

    const result = await getMyFestivalAccess("grodno-latina-fest", "dancer1");

    expect(festivalFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ programItems: expect.objectContaining({ orderBy: { startTime: "asc" } }) }),
      })
    );
    expect(result?.accessibleProgramItems.map((i) => i.id)).toEqual(["item1", "item2"]);
  });
});
