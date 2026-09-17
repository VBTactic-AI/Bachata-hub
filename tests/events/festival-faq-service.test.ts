import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

const festivalFindUnique = vi.fn();
const faqFindUnique = vi.fn();
const faqFindMany = vi.fn();
const faqCreate = vi.fn();
const faqUpdate = vi.fn();
const faqDelete = vi.fn();
const eventTeamMemberFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    festival: { findUnique: (...a: unknown[]) => festivalFindUnique(...a) },
    festivalFaqItem: {
      findUnique: (...a: unknown[]) => faqFindUnique(...a),
      findMany: (...a: unknown[]) => faqFindMany(...a),
      create: (...a: unknown[]) => faqCreate(...a),
      update: (...a: unknown[]) => faqUpdate(...a),
      delete: (...a: unknown[]) => faqDelete(...a),
    },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
  },
}));

const {
  createFestivalFaqItem,
  updateFestivalFaqItem,
  deleteFestivalFaqItem,
  listFestivalFaqItems,
  FestivalFaqItemValidationError,
} = await import("@/server/events/festival-faq-service");
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
const baseItem = { id: "faq1", festivalId: "fest1", question: "Где припарковаться?", answer: "Бесплатная парковка рядом.", sortOrder: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  festivalFindUnique.mockResolvedValue({ ...baseFestival });
  faqFindUnique.mockResolvedValue({ ...baseItem, festival: { ...baseFestival } });
  faqCreate.mockImplementation((args) => Promise.resolve({ ...baseItem, ...args.data }));
  faqUpdate.mockImplementation((args) => Promise.resolve({ ...baseItem, ...args.data }));
  eventTeamMemberFindUnique.mockResolvedValue(null);
});

describe("createFestivalFaqItem()", () => {
  it("постороннему запрещено", async () => {
    await expect(createFestivalFaqItem("fest1", stranger, { question: "Q", answer: "A" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("требует непустые вопрос и ответ", async () => {
    await expect(createFestivalFaqItem("fest1", owner, { question: " ", answer: "A" })).rejects.toBeInstanceOf(FestivalFaqItemValidationError);
    await expect(createFestivalFaqItem("fest1", owner, { question: "Q", answer: " " })).rejects.toBeInstanceOf(FestivalFaqItemValidationError);
  });

  it("создаёт вопрос", async () => {
    await createFestivalFaqItem("fest1", owner, { question: "Где припарковаться?", answer: "Бесплатная парковка рядом." });
    expect(faqCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ festivalId: "fest1", question: "Где припарковаться?" }) })
    );
  });
});

describe("updateFestivalFaqItem() / deleteFestivalFaqItem()", () => {
  it("постороннему запрещено", async () => {
    await expect(updateFestivalFaqItem("faq1", stranger, { answer: "Y" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
    await expect(deleteFestivalFaqItem("faq1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("владелец обновляет и удаляет", async () => {
    await updateFestivalFaqItem("faq1", owner, { answer: "Новый ответ" });
    expect(faqUpdate).toHaveBeenCalledWith({ where: { id: "faq1" }, data: { answer: "Новый ответ" } });

    await deleteFestivalFaqItem("faq1", owner);
    expect(faqDelete).toHaveBeenCalledWith({ where: { id: "faq1" } });
  });
});

describe("listFestivalFaqItems()", () => {
  it("сортирует по sortOrder", async () => {
    faqFindMany.mockResolvedValue([baseItem]);
    const result = await listFestivalFaqItems("fest1", owner);
    expect(faqFindMany).toHaveBeenCalledWith({ where: { festivalId: "fest1" }, orderBy: { sortOrder: "asc" } });
    expect(result).toHaveLength(1);
  });
});
