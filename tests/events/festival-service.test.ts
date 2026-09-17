import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// Festival Engine — сервисный слой (2026-09-17, Stage 1). Мокаем ровно то,
// что реально дергает festival-service.ts + то, что нужно транзитивно
// event-service.ts (decidePublishModeration — чистая функция, импортируется
// оттуда, не дублируется).

vi.mock("@/lib/slug", () => ({ uniqueSlug: vi.fn().mockResolvedValue("fest-slug") }));

const isAdminMock = vi.fn().mockReturnValue(false);
const isVerifiedFestivalOrganizerMock = vi.fn().mockReturnValue(true);
vi.mock("@/lib/auth", () => ({
  isAdmin: (...a: unknown[]) => isAdminMock(...a),
  isVerifiedFestivalOrganizer: (...a: unknown[]) => isVerifiedFestivalOrganizerMock(...a),
  canCreateEvents: vi.fn().mockReturnValue(true), // транзитивно нужен event-service.ts
}));

const shouldAutoApproveMock = vi.fn().mockReturnValue(false);
vi.mock("@/lib/events/moderation", () => ({ shouldAutoApproveEvent: (...a: unknown[]) => shouldAutoApproveMock(...a) }));

const festivalFindUnique = vi.fn();
const festivalFindUniqueOrThrow = vi.fn();
const festivalFindMany = vi.fn();
const festivalCreate = vi.fn();
const festivalUpdate = vi.fn();
const festivalDelete = vi.fn();
const eventUpdate = vi.fn();

// $transaction — в реальном Prisma принимает callback(tx); здесь tx = тот же
// набор моков, что и вне транзакции (для теста этого достаточно — важен сам
// факт вызова в правильном порядке, не изоляция соединений).
const txEventCreate = vi.fn();
const txEventDelete = vi.fn();
const txFestivalUpdateMany = vi.fn();
const txFestivalFindUniqueOrThrow = vi.fn();
const txPassCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    festival: {
      findUnique: (...a: unknown[]) => festivalFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => festivalFindUniqueOrThrow(...a),
      findMany: (...a: unknown[]) => festivalFindMany(...a),
      create: (...a: unknown[]) => festivalCreate(...a),
      update: (...a: unknown[]) => festivalUpdate(...a),
      delete: (...a: unknown[]) => festivalDelete(...a),
    },
    event: { update: (...a: unknown[]) => eventUpdate(...a) },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        event: { create: (...a: unknown[]) => txEventCreate(...a), delete: (...a: unknown[]) => txEventDelete(...a) },
        festival: {
          updateMany: (...a: unknown[]) => txFestivalUpdateMany(...a),
          findUniqueOrThrow: (...a: unknown[]) => txFestivalFindUniqueOrThrow(...a),
        },
        pass: { create: (...a: unknown[]) => txPassCreate(...a) },
      }),
  },
}));

const {
  computeFestivalStatus,
  createFestivalDraft,
  getFestivalForEdit,
  updateFestivalDraft,
  listFestivalsForUser,
  archiveFestival,
  deleteFestivalDraft,
  createFestivalPass,
  publishFestival,
  FestivalValidationError,
} = await import("@/server/events/festival-service");
const { RegistrationForbiddenError, RegistrationNotFoundError } = await import("@/server/events/registration-service");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user1",
    email: "user1@example.com",
    passwordHash: null,
    supabaseUserId: null,
    role: "ORGANIZER",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    isBlocked: false,
    isVerifiedEventOrganizer: false,
    isVerifiedFestivalOrganizer: false,
    ...overrides,
  } as User;
}

const owner = makeUser({ id: "owner1" });
const stranger = makeUser({ id: "stranger1" });
const admin = makeUser({ id: "admin1", role: "ADMIN" });

const baseFestival = {
  id: "fest1",
  slug: "fest-slug",
  name: "Bachata Sensation Fest",
  description: null,
  cityId: "city1",
  venueName: null,
  startsAt: new Date("2027-03-12T00:00:00Z"),
  endsAt: new Date("2027-03-15T00:00:00Z"),
  createdById: "owner1",
  eventId: null as string | null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  isAdminMock.mockImplementation((u: User) => u?.role === "ADMIN");
  isVerifiedFestivalOrganizerMock.mockReturnValue(true);
  shouldAutoApproveMock.mockReturnValue(false);
  festivalFindUnique.mockResolvedValue({ ...baseFestival });
  festivalCreate.mockImplementation((args) => Promise.resolve({ ...baseFestival, ...args.data }));
  festivalUpdate.mockImplementation((args) => Promise.resolve({ ...baseFestival, ...args.data }));
  festivalFindUniqueOrThrow.mockResolvedValue({ ...baseFestival, event: { id: "event1", status: "ARCHIVED" } });
  eventUpdate.mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data }));
  txFestivalUpdateMany.mockResolvedValue({ count: 1 }); // по умолчанию — выиграли гонку за bridge
});

describe("computeFestivalStatus()", () => {
  it("DRAFT — eventId ещё нет", () => {
    expect(computeFestivalStatus({ eventId: null })).toBe("DRAFT");
  });

  it("LINKED — eventId есть, но bridge не опубликован/не одобрен", () => {
    expect(computeFestivalStatus({ eventId: "event1", event: { status: "DRAFT", moderationStatus: "PENDING" } })).toBe("LINKED");
    expect(computeFestivalStatus({ eventId: "event1", event: { status: "PUBLISHED", moderationStatus: "PENDING" } })).toBe("LINKED");
  });

  it("PUBLISHED — bridge опубликован И одобрен", () => {
    expect(computeFestivalStatus({ eventId: "event1", event: { status: "PUBLISHED", moderationStatus: "APPROVED" } })).toBe("PUBLISHED");
  });
});

describe("createFestivalDraft()", () => {
  it("отказывает без isVerifiedFestivalOrganizer/ADMIN", async () => {
    isVerifiedFestivalOrganizerMock.mockReturnValue(false);
    await expect(
      createFestivalDraft(stranger, { name: "X", cityId: "city1", startsAt: new Date() })
    ).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(festivalCreate).not.toHaveBeenCalled();
  });

  it("ADMIN может создать, даже без isVerifiedFestivalOrganizer", async () => {
    isVerifiedFestivalOrganizerMock.mockReturnValue(false);
    await createFestivalDraft(admin, { name: "X", cityId: "city1", startsAt: new Date() });
    expect(festivalCreate).toHaveBeenCalled();
  });

  it("требует непустое название", async () => {
    await expect(createFestivalDraft(owner, { name: "  ", cityId: "city1", startsAt: new Date() })).rejects.toBeInstanceOf(
      FestivalValidationError
    );
  });

  it("дата начала не может быть позже даты окончания", async () => {
    await expect(
      createFestivalDraft(owner, {
        name: "X",
        cityId: "city1",
        startsAt: new Date("2027-03-15"),
        endsAt: new Date("2027-03-12"),
      })
    ).rejects.toBeInstanceOf(FestivalValidationError);
  });

  it("создаёт с сгенерированным slug, createdById = user.id", async () => {
    const result = await createFestivalDraft(owner, { name: "Bachata Sensation Fest", cityId: "city1", startsAt: new Date() });
    expect(festivalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "fest-slug", createdById: "owner1" }) })
    );
    expect(result.slug).toBe("fest-slug");
  });
});

describe("getFestivalForEdit() / updateFestivalDraft()", () => {
  it("бросает NotFound, если фестиваля нет", async () => {
    festivalFindUnique.mockResolvedValue(null);
    await expect(getFestivalForEdit("missing", owner)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("бросает Forbidden постороннему без bridge-Event (до появления команды)", async () => {
    await expect(getFestivalForEdit("fest1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("владелец видит свой черновик", async () => {
    const festival = await getFestivalForEdit("fest1", owner);
    expect(festival.id).toBe("fest1");
  });

  it("updateFestivalDraft — постороннему запрещено", async () => {
    await expect(updateFestivalDraft("fest1", stranger, { name: "Y" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("updateFestivalDraft — владелец меняет только переданные поля", async () => {
    await updateFestivalDraft("fest1", owner, { venueName: "Дворец культуры" });
    expect(festivalUpdate).toHaveBeenCalledWith({
      where: { id: "fest1" },
      data: { venueName: "Дворец культуры" },
    });
  });
});

describe("listFestivalsForUser()", () => {
  it("ADMIN видит все фестивали (пустой where)", async () => {
    await listFestivalsForUser(admin);
    expect(festivalFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("обычный пользователь видит только свои", async () => {
    await listFestivalsForUser(owner);
    expect(festivalFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { createdById: "owner1" } }));
  });
});

describe("archiveFestival()", () => {
  it("нечего архивировать без bridge-Event", async () => {
    await expect(archiveFestival("fest1", owner)).rejects.toBeInstanceOf(FestivalValidationError);
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("постороннему запрещено", async () => {
    festivalFindUnique.mockResolvedValue({ ...baseFestival, eventId: "event1" });
    await expect(archiveFestival("fest1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("архивирует bridge-Event, когда он есть", async () => {
    festivalFindUnique.mockResolvedValue({ ...baseFestival, eventId: "event1" });
    await archiveFestival("fest1", owner);
    expect(eventUpdate).toHaveBeenCalledWith({ where: { id: "event1" }, data: { status: "ARCHIVED" } });
  });
});

describe("deleteFestivalDraft()", () => {
  it("удаляет чистый черновик без bridge-Event", async () => {
    await deleteFestivalDraft("fest1", owner);
    expect(festivalDelete).toHaveBeenCalledWith({ where: { id: "fest1" } });
  });

  it("отказывает удалять, если bridge-Event уже есть", async () => {
    festivalFindUnique.mockResolvedValue({ ...baseFestival, eventId: "event1" });
    await expect(deleteFestivalDraft("fest1", owner)).rejects.toBeInstanceOf(FestivalValidationError);
    expect(festivalDelete).not.toHaveBeenCalled();
  });

  it("постороннему запрещено", async () => {
    await expect(deleteFestivalDraft("fest1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });
});

describe("createFestivalPass() — ленивое создание bridge-Event", () => {
  const passInput = { name: "Full Pass", type: "FULL_PASS" as const };

  it("постороннему запрещено", async () => {
    await expect(createFestivalPass("fest1", stranger, passInput)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(txEventCreate).not.toHaveBeenCalled();
  });

  it("валидирует вход (переиспользует validateCommon из pass-service.ts)", async () => {
    await expect(createFestivalPass("fest1", owner, { name: "  ", type: "FULL_PASS" })).rejects.toThrow();
    expect(txPassCreate).not.toHaveBeenCalled();
  });

  it("нет eventId — создаёт bridge-Event внутри транзакции, пишет festival.eventId, потом создаёт Pass", async () => {
    txEventCreate.mockResolvedValue({ id: "new-event-1" });
    txPassCreate.mockResolvedValue({ id: "pass1" });

    await createFestivalPass("fest1", owner, passInput);

    expect(txEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          format: "FESTIVAL",
          status: "DRAFT",
          createdById: "owner1",
          title: "Bachata Sensation Fest",
          // Без этого гость не смог бы зарегистрироваться на bridge-Event
          // публично — issueTicket() требует существующую регистрацию до
          // выдачи Pass (найдено при переносе UI, Stage UI-5).
          registrationEnabled: true,
        }),
      })
    );
    expect(txFestivalUpdateMany).toHaveBeenCalledWith({
      where: { id: "fest1", eventId: null },
      data: { eventId: "new-event-1" },
    });
    expect(txPassCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventId: "new-event-1", name: "Full Pass" }) }));
  });

  it("eventId уже есть — bridge-Event НЕ пересоздаётся, Pass создаётся сразу на нём", async () => {
    festivalFindUnique.mockResolvedValue({ ...baseFestival, eventId: "existing-event" });
    txPassCreate.mockResolvedValue({ id: "pass2" });

    await createFestivalPass("fest1", owner, passInput);

    expect(txEventCreate).not.toHaveBeenCalled();
    expect(txFestivalUpdateMany).not.toHaveBeenCalled();
    expect(txPassCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventId: "existing-event" }) }));
  });

  it("проигранная гонка за bridge — использует чужой eventId, удаляет свой лишний Event", async () => {
    // Найдено при ревью (2026-09-17): festival.eventId читается ДО транзакции,
    // поэтому два параллельных вызова для одного ещё безбриджевого фестиваля
    // могли бы оба создать свой bridge. Атомарный updateMany(eventId: null)
    // ловит проигравшего — count=0 означает "кто-то другой уже записал своё
    // значение первым".
    txEventCreate.mockResolvedValue({ id: "my-event" });
    txFestivalUpdateMany.mockResolvedValue({ count: 0 });
    txFestivalFindUniqueOrThrow.mockResolvedValue({ ...baseFestival, eventId: "winner-event" });
    txPassCreate.mockResolvedValue({ id: "pass3" });

    await createFestivalPass("fest1", owner, passInput);

    expect(txEventDelete).toHaveBeenCalledWith({ where: { id: "my-event" } });
    expect(txPassCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventId: "winner-event" }) }));
  });
});

describe("publishFestival()", () => {
  it("нет bridge-Event — валидационная ошибка с понятным сообщением", async () => {
    festivalFindUnique.mockResolvedValue({ ...baseFestival, eventId: null, event: null });
    await expect(publishFestival("fest1", owner)).rejects.toBeInstanceOf(FestivalValidationError);
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("постороннему запрещено", async () => {
    festivalFindUnique.mockResolvedValue({ ...baseFestival, eventId: "event1", event: { id: "event1", status: "DRAFT", moderationStatus: "PENDING" } });
    await expect(publishFestival("fest1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("идемпотентно — уже PUBLISHED, update не вызывается", async () => {
    festivalFindUnique.mockResolvedValue({
      ...baseFestival,
      eventId: "event1",
      event: { id: "event1", status: "PUBLISHED", moderationStatus: "APPROVED" },
    });
    const result = await publishFestival("fest1", owner);
    expect(eventUpdate).not.toHaveBeenCalled();
    expect(result.status).toBe("PUBLISHED");
  });

  it("публикует и переиспользует decidePublishModeration (auto-approve = false → PENDING)", async () => {
    festivalFindUnique.mockResolvedValue({
      ...baseFestival,
      eventId: "event1",
      event: { id: "event1", status: "DRAFT", moderationStatus: "PENDING" },
    });
    shouldAutoApproveMock.mockReturnValue(false);

    await publishFestival("fest1", owner);

    expect(eventUpdate).toHaveBeenCalledWith({
      where: { id: "event1" },
      data: { status: "PUBLISHED", moderationStatus: "PENDING" },
    });
  });

  it("публикует и авто-одобряет, когда shouldAutoApproveEvent = true", async () => {
    festivalFindUnique.mockResolvedValue({
      ...baseFestival,
      eventId: "event1",
      event: { id: "event1", status: "DRAFT", moderationStatus: "PENDING" },
    });
    shouldAutoApproveMock.mockReturnValue(true);

    await publishFestival("fest1", owner);

    expect(eventUpdate).toHaveBeenCalledWith({
      where: { id: "event1" },
      data: expect.objectContaining({ status: "PUBLISHED", moderationStatus: "APPROVED" }),
    });
  });
});
