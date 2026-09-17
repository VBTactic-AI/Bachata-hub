import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

const festivalFindUnique = vi.fn();
const sponsorFindUnique = vi.fn();
const sponsorFindMany = vi.fn();
const sponsorCreate = vi.fn();
const sponsorUpdate = vi.fn();
const sponsorDelete = vi.fn();
const eventTeamMemberFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    festival: { findUnique: (...a: unknown[]) => festivalFindUnique(...a) },
    festivalSponsor: {
      findUnique: (...a: unknown[]) => sponsorFindUnique(...a),
      findMany: (...a: unknown[]) => sponsorFindMany(...a),
      create: (...a: unknown[]) => sponsorCreate(...a),
      update: (...a: unknown[]) => sponsorUpdate(...a),
      delete: (...a: unknown[]) => sponsorDelete(...a),
    },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
  },
}));

const {
  createFestivalSponsor,
  updateFestivalSponsor,
  deleteFestivalSponsor,
  listFestivalSponsors,
  FestivalSponsorValidationError,
} = await import("@/server/events/festival-sponsor-service");
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
const baseSponsor = { id: "sponsor1", festivalId: "fest1", name: "DanceWear BY", tier: "Партнёр", logoUrl: null, websiteUrl: null, amount: null, currency: null, sortOrder: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  festivalFindUnique.mockResolvedValue({ ...baseFestival });
  sponsorFindUnique.mockResolvedValue({ ...baseSponsor, festival: { ...baseFestival } });
  sponsorCreate.mockImplementation((args) => Promise.resolve({ ...baseSponsor, ...args.data }));
  sponsorUpdate.mockImplementation((args) => Promise.resolve({ ...baseSponsor, ...args.data }));
  eventTeamMemberFindUnique.mockResolvedValue(null);
});

describe("createFestivalSponsor()", () => {
  it("постороннему запрещено", async () => {
    await expect(createFestivalSponsor("fest1", stranger, { name: "X", tier: "Партнёр" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("требует непустое имя и уровень", async () => {
    await expect(createFestivalSponsor("fest1", owner, { name: " ", tier: "Партнёр" })).rejects.toBeInstanceOf(FestivalSponsorValidationError);
    await expect(createFestivalSponsor("fest1", owner, { name: "X", tier: " " })).rejects.toBeInstanceOf(FestivalSponsorValidationError);
  });

  it("сумма взноса не может быть отрицательной", async () => {
    await expect(createFestivalSponsor("fest1", owner, { name: "X", tier: "Партнёр", amount: -1 })).rejects.toBeInstanceOf(
      FestivalSponsorValidationError
    );
  });

  it("создаёт спонсора с суммой взноса", async () => {
    await createFestivalSponsor("fest1", owner, { name: "DanceWear BY", tier: "Генеральный спонсор", amount: 500, currency: "BYN" });
    expect(sponsorCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ festivalId: "fest1", amount: 500, currency: "BYN" }) })
    );
  });
});

describe("updateFestivalSponsor() / deleteFestivalSponsor()", () => {
  it("NotFound", async () => {
    sponsorFindUnique.mockResolvedValue(null);
    await expect(updateFestivalSponsor("missing", owner, { name: "Y" })).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("постороннему запрещено", async () => {
    await expect(updateFestivalSponsor("sponsor1", stranger, { name: "Y" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
    await expect(deleteFestivalSponsor("sponsor1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("владелец обновляет и удаляет", async () => {
    await updateFestivalSponsor("sponsor1", owner, { amount: 700 });
    expect(sponsorUpdate).toHaveBeenCalledWith({ where: { id: "sponsor1" }, data: { amount: 700 } });

    await deleteFestivalSponsor("sponsor1", owner);
    expect(sponsorDelete).toHaveBeenCalledWith({ where: { id: "sponsor1" } });
  });
});

describe("listFestivalSponsors()", () => {
  it("сортирует по sortOrder", async () => {
    sponsorFindMany.mockResolvedValue([baseSponsor]);
    const result = await listFestivalSponsors("fest1", owner);
    expect(sponsorFindMany).toHaveBeenCalledWith({ where: { festivalId: "fest1" }, orderBy: { sortOrder: "asc" } });
    expect(result).toHaveLength(1);
  });
});
