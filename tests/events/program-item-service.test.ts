import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

const festivalFindUnique = vi.fn();
const programItemFindUnique = vi.fn();
const programItemFindMany = vi.fn();
const programItemCreate = vi.fn();
const programItemUpdate = vi.fn();
const programItemDelete = vi.fn();
const eventTeamMemberFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    festival: { findUnique: (...a: unknown[]) => festivalFindUnique(...a) },
    programItem: {
      findUnique: (...a: unknown[]) => programItemFindUnique(...a),
      findMany: (...a: unknown[]) => programItemFindMany(...a),
      create: (...a: unknown[]) => programItemCreate(...a),
      update: (...a: unknown[]) => programItemUpdate(...a),
      delete: (...a: unknown[]) => programItemDelete(...a),
    },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
  },
}));

const { createProgramItem, updateProgramItem, deleteProgramItem, listProgramItems, ProgramItemValidationError } = await import(
  "@/server/events/program-item-service"
);
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

const baseFestival = { id: "fest1", createdById: "owner1", eventId: null as string | null };

const baseItem = {
  id: "item1",
  festivalId: "fest1",
  title: "Bachata Sensual МК",
  type: "WORKSHOP" as const,
  startTime: new Date("2027-03-13T16:00:00Z"),
  endTime: null as Date | null,
  teacherId: null as string | null,
  linkedEventId: null as string | null,
  order: 0,
  capacity: null as number | null,
  showCapacityPublicly: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  festivalFindUnique.mockResolvedValue({ ...baseFestival });
  programItemFindUnique.mockResolvedValue({ ...baseItem, festival: { ...baseFestival } });
  programItemCreate.mockImplementation((args) => Promise.resolve({ ...baseItem, ...args.data }));
  programItemUpdate.mockImplementation((args) => Promise.resolve({ ...baseItem, ...args.data }));
  eventTeamMemberFindUnique.mockResolvedValue(null);
});

describe("createProgramItem()", () => {
  it("постороннему без доступа к фестивалю запрещено", async () => {
    await expect(
      createProgramItem("fest1", stranger, { title: "X", type: "WORKSHOP", startTime: new Date() })
    ).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(programItemCreate).not.toHaveBeenCalled();
  });

  it("NotFound, если фестиваля нет", async () => {
    festivalFindUnique.mockResolvedValue(null);
    await expect(createProgramItem("missing", owner, { title: "X", type: "WORKSHOP", startTime: new Date() })).rejects.toBeInstanceOf(
      RegistrationNotFoundError
    );
  });

  it("требует непустое название", async () => {
    await expect(createProgramItem("fest1", owner, { title: "  ", type: "WORKSHOP", startTime: new Date() })).rejects.toBeInstanceOf(
      ProgramItemValidationError
    );
  });

  it("начало не может быть позже окончания", async () => {
    await expect(
      createProgramItem("fest1", owner, {
        title: "X",
        type: "WORKSHOP",
        startTime: new Date("2027-03-13T18:00:00Z"),
        endTime: new Date("2027-03-13T16:00:00Z"),
      })
    ).rejects.toBeInstanceOf(ProgramItemValidationError);
  });

  it("вместимость должна быть положительным целым", async () => {
    await expect(
      createProgramItem("fest1", owner, { title: "X", type: "WORKSHOP", startTime: new Date(), capacity: -5 })
    ).rejects.toBeInstanceOf(ProgramItemValidationError);
    await expect(
      createProgramItem("fest1", owner, { title: "X", type: "WORKSHOP", startTime: new Date(), capacity: 1.5 })
    ).rejects.toBeInstanceOf(ProgramItemValidationError);
  });

  it("создаёт пункт программы с дефолтами (order=0, showCapacityPublicly=true)", async () => {
    const item = await createProgramItem("fest1", owner, { title: "Bachata Sensual МК", type: "WORKSHOP", startTime: new Date() });
    expect(programItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ festivalId: "fest1", title: "Bachata Sensual МК", order: 0, showCapacityPublicly: true, capacity: null }),
      })
    );
    expect(item.festivalId).toBe("fest1");
  });

  it("сохраняет явный capacity и showCapacityPublicly=false", async () => {
    await createProgramItem("fest1", owner, { title: "X", type: "WORKSHOP", startTime: new Date(), capacity: 40, showCapacityPublicly: false });
    expect(programItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ capacity: 40, showCapacityPublicly: false }) })
    );
  });

  it("член команды bridge-Event тоже может создавать пункты программы", async () => {
    festivalFindUnique.mockResolvedValue({ ...baseFestival, eventId: "event1" });
    eventTeamMemberFindUnique.mockResolvedValue({ eventId: "event1", userId: "stranger1" });
    await createProgramItem("fest1", stranger, { title: "X", type: "WORKSHOP", startTime: new Date() });
    expect(programItemCreate).toHaveBeenCalled();
  });
});

describe("updateProgramItem() / deleteProgramItem()", () => {
  it("NotFound, если пункта нет", async () => {
    programItemFindUnique.mockResolvedValue(null);
    await expect(updateProgramItem("missing", owner, { title: "Y" })).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("постороннему запрещено редактировать", async () => {
    await expect(updateProgramItem("item1", stranger, { title: "Y" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("владелец обновляет только переданные поля", async () => {
    await updateProgramItem("item1", owner, { capacity: 25 });
    expect(programItemUpdate).toHaveBeenCalledWith({ where: { id: "item1" }, data: { capacity: 25 } });
  });

  it("удаляет пункт программы", async () => {
    await deleteProgramItem("item1", owner);
    expect(programItemDelete).toHaveBeenCalledWith({ where: { id: "item1" } });
  });

  it("постороннему запрещено удалять", async () => {
    await expect(deleteProgramItem("item1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(programItemDelete).not.toHaveBeenCalled();
  });
});

describe("listProgramItems()", () => {
  it("постороннему запрещено", async () => {
    await expect(listProgramItems("fest1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("возвращает пункты по festivalId, отсортированные по order", async () => {
    programItemFindMany.mockResolvedValue([baseItem]);
    const items = await listProgramItems("fest1", owner);
    expect(programItemFindMany).toHaveBeenCalledWith({ where: { festivalId: "fest1" }, orderBy: { order: "asc" } });
    expect(items).toHaveLength(1);
  });
});
