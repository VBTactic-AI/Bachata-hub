import { describe, it, expect, vi, beforeEach } from "vitest";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const uniqueSlugMock = vi.fn();
vi.mock("@/lib/slug", () => ({ uniqueSlug: (...a: unknown[]) => uniqueSlugMock(...a) }));

const emitDomainEventMock = vi.fn();
vi.mock("@/server/notifications/emit-domain-event", () => ({
  emitDomainEvent: (...a: unknown[]) => emitDomainEventMock(...a),
}));

const auditCreate = vi.fn();
const competitionCreate = vi.fn();
const memberCreate = vi.fn();
const roleFindUniqueOrThrow = vi.fn();
const eventCreate = vi.fn();
const eventFindUnique = vi.fn();
const fakeTx = {
  competition: { create: competitionCreate },
  competitionMember: { create: memberCreate },
  auditLog: { create: auditCreate },
  event: { create: (...a: unknown[]) => eventCreate(...a), findUnique: (...a: unknown[]) => eventFindUnique(...a) },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    role: { findUniqueOrThrow: (...a: unknown[]) => roleFindUniqueOrThrow(...a), findFirstOrThrow: (...a: unknown[]) => roleFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { createCompetition } = await import("@/server/competition/create-competition");
const { PermissionDeniedError } = await import("@/server/errors");

beforeEach(() => {
  requirePermissionMock.mockReset();
  uniqueSlugMock.mockReset();
  competitionCreate.mockReset();
  memberCreate.mockReset();
  auditCreate.mockReset();
  roleFindUniqueOrThrow.mockReset();
  eventCreate.mockReset();
  eventFindUnique.mockReset();
  emitDomainEventMock.mockReset();
});

describe("createCompetition()", () => {
  it("требует глобальное право competition:create (03 §4 — только SUPER_ADMIN)", async () => {
    requirePermissionMock.mockResolvedValue({ userId: "u1", email: "a@b.by" });
    uniqueSlugMock.mockResolvedValue("test-comp");
    roleFindUniqueOrThrow.mockResolvedValue({ id: "role-event-admin" });
    competitionCreate.mockResolvedValue({ id: "comp1", slug: "test-comp", name: "Test", status: "DRAFT" });

    await createCompetition({ name: "Test", timezone: "Europe/Minsk" } as never);

    expect(requirePermissionMock).toHaveBeenCalledWith("competition:create");
  });

  it("создатель автоматически становится EVENT_ADMIN своего соревнования", async () => {
    requirePermissionMock.mockResolvedValue({ userId: "u1", email: "a@b.by" });
    uniqueSlugMock.mockResolvedValue("test-comp");
    roleFindUniqueOrThrow.mockResolvedValue({ id: "role-event-admin" });
    competitionCreate.mockResolvedValue({ id: "comp1", slug: "test-comp", name: "Test", status: "DRAFT" });

    await createCompetition({ name: "Test", timezone: "Europe/Minsk" } as never);

    expect(memberCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ competitionId: "comp1", userId: "u1", roleId: "role-event-admin" }),
      })
    );
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it("без права — ничего не создаёт в БД (отказ до транзакции)", async () => {
    requirePermissionMock.mockRejectedValue(new PermissionDeniedError("competition:create"));

    await expect(createCompetition({ name: "Test", timezone: "Europe/Minsk" } as never)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(competitionCreate).not.toHaveBeenCalled();
    expect(memberCreate).not.toHaveBeenCalled();
  });
});

// 2026-09-18, по прямому запросу пользователя — конкурс и его публичная
// карточка события (Event, format=CONTEST) теперь заводятся вместе, одним
// вызовом, вместо прежнего отдельного пути через Event Wizard.
describe("createCompetition() — публичная карточка события создаётся вместе с соревнованием", () => {
  const startAt = new Date("2026-11-01T18:00:00.000Z");

  it("без eventId, но с city/venue/startAt — создаёт Event формата CONTEST и линкует его в Competition.eventId", async () => {
    requirePermissionMock.mockResolvedValue({ userId: "u1", email: "a@b.by" });
    uniqueSlugMock.mockResolvedValueOnce("jj-open").mockResolvedValueOnce("jj-open-event");
    roleFindUniqueOrThrow.mockResolvedValue({ id: "role-event-admin" });
    eventCreate.mockResolvedValue({
      id: "event1",
      slug: "jj-open-event",
      title: "JJ Open",
      cityId: "city1",
      format: "CONTEST",
      startsAt: startAt,
      createdById: "u1",
    });
    competitionCreate.mockResolvedValue({ id: "comp1", slug: "jj-open", name: "JJ Open", status: "DRAFT" });

    const result = await createCompetition({
      name: "JJ Open",
      cityId: "city1",
      venue: "Дворец культуры",
      startAt,
      timezone: "Europe/Minsk",
    } as never);

    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "JJ Open",
          cityId: "city1",
          venueName: "Дворец культуры",
          format: "CONTEST",
          eventType: "CONTEST",
          level: "ALL_LEVELS", // дефолт, если не задано явно
          status: "PUBLISHED",
          moderationStatus: "APPROVED",
          createdById: "u1",
        }),
      })
    );
    expect(competitionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventId: "event1" }) }));
    expect(emitDomainEventMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({ type: "EVENT_PUBLISHED", payload: expect.objectContaining({ entityId: "event1", format: "CONTEST" }) })
    );
    expect(result).toMatchObject({ eventId: "event1", eventSlug: "jj-open-event" });
  });

  it("с явным eventId — НЕ создаёт новый Event, просто линкует уже существующий", async () => {
    requirePermissionMock.mockResolvedValue({ userId: "u1", email: "a@b.by" });
    uniqueSlugMock.mockResolvedValue("jj-open");
    roleFindUniqueOrThrow.mockResolvedValue({ id: "role-event-admin" });
    eventFindUnique.mockResolvedValue({ slug: "legacy-event" });
    competitionCreate.mockResolvedValue({ id: "comp1", slug: "jj-open", name: "JJ Open", status: "DRAFT" });

    const result = await createCompetition({ name: "JJ Open", eventId: "legacy-event-id", timezone: "Europe/Minsk" } as never);

    expect(eventCreate).not.toHaveBeenCalled();
    expect(emitDomainEventMock).not.toHaveBeenCalled();
    expect(competitionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventId: "legacy-event-id" }) }));
    expect(result).toMatchObject({ eventId: "legacy-event-id", eventSlug: "legacy-event" });
  });

  it("без eventId и без city/venue/startAt — не создаёт Event (остаётся соревнование без публичной карточки, как раньше)", async () => {
    requirePermissionMock.mockResolvedValue({ userId: "u1", email: "a@b.by" });
    uniqueSlugMock.mockResolvedValue("jj-open");
    roleFindUniqueOrThrow.mockResolvedValue({ id: "role-event-admin" });
    competitionCreate.mockResolvedValue({ id: "comp1", slug: "jj-open", name: "JJ Open", status: "DRAFT" });

    const result = await createCompetition({ name: "JJ Open", timezone: "Europe/Minsk" } as never);

    expect(eventCreate).not.toHaveBeenCalled();
    expect(result.eventId).toBeNull();
  });
});
