import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

const schoolFindUnique = vi.fn();
const faqFindUnique = vi.fn();
const faqFindMany = vi.fn();
const faqCreate = vi.fn();
const faqUpdate = vi.fn();
const faqDelete = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: { findUnique: (...a: unknown[]) => schoolFindUnique(...a) },
    schoolFaqItem: {
      findUnique: (...a: unknown[]) => faqFindUnique(...a),
      findMany: (...a: unknown[]) => faqFindMany(...a),
      create: (...a: unknown[]) => faqCreate(...a),
      update: (...a: unknown[]) => faqUpdate(...a),
      delete: (...a: unknown[]) => faqDelete(...a),
    },
  },
}));

const {
  createSchoolFaqItem,
  updateSchoolFaqItem,
  deleteSchoolFaqItem,
  listSchoolFaqItems,
  listPublicSchoolFaqItems,
  SchoolFaqItemValidationError,
} = await import("@/server/schools/school-faq-service");
const { SchoolForbiddenError, SchoolNotFoundError } = await import("@/server/schools/update-school");

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
const baseSchool = { id: "school1", ownerUserId: "owner1" };
const baseItem = { id: "faq1", schoolId: "school1", question: "Нужна ли обувь?", answer: "Достаточно удобной закрытой обуви." };

beforeEach(() => {
  vi.clearAllMocks();
  schoolFindUnique.mockResolvedValue({ ...baseSchool });
  faqFindUnique.mockResolvedValue({ ...baseItem, school: { ...baseSchool } });
  faqCreate.mockImplementation((args) => Promise.resolve({ ...baseItem, ...args.data }));
  faqUpdate.mockImplementation((args) => Promise.resolve({ ...baseItem, ...args.data }));
});

describe("createSchoolFaqItem()", () => {
  it("постороннему запрещено", async () => {
    await expect(createSchoolFaqItem("school1", stranger, { question: "Q", answer: "A" })).rejects.toBeInstanceOf(SchoolForbiddenError);
  });

  it("школа не найдена", async () => {
    schoolFindUnique.mockResolvedValue(null);
    await expect(createSchoolFaqItem("missing", owner, { question: "Q", answer: "A" })).rejects.toBeInstanceOf(SchoolNotFoundError);
  });

  it("требует непустые вопрос и ответ", async () => {
    await expect(createSchoolFaqItem("school1", owner, { question: " ", answer: "A" })).rejects.toBeInstanceOf(SchoolFaqItemValidationError);
    await expect(createSchoolFaqItem("school1", owner, { question: "Q", answer: " " })).rejects.toBeInstanceOf(SchoolFaqItemValidationError);
  });

  it("создаёт вопрос", async () => {
    await createSchoolFaqItem("school1", owner, { question: "Нужна ли обувь?", answer: "Достаточно удобной закрытой обуви." });
    expect(faqCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ schoolId: "school1", question: "Нужна ли обувь?" }) })
    );
  });
});

describe("updateSchoolFaqItem() / deleteSchoolFaqItem()", () => {
  it("постороннему запрещено", async () => {
    await expect(updateSchoolFaqItem("faq1", stranger, { answer: "Y" })).rejects.toBeInstanceOf(SchoolForbiddenError);
    await expect(deleteSchoolFaqItem("faq1", stranger)).rejects.toBeInstanceOf(SchoolForbiddenError);
  });

  it("владелец обновляет и удаляет", async () => {
    await updateSchoolFaqItem("faq1", owner, { answer: "Новый ответ" });
    expect(faqUpdate).toHaveBeenCalledWith({ where: { id: "faq1" }, data: { answer: "Новый ответ" } });

    await deleteSchoolFaqItem("faq1", owner);
    expect(faqDelete).toHaveBeenCalledWith({ where: { id: "faq1" } });
  });
});

describe("listSchoolFaqItems()", () => {
  it("сортирует по sortOrder, постороннему запрещено", async () => {
    faqFindMany.mockResolvedValue([baseItem]);
    const result = await listSchoolFaqItems("school1", owner);
    expect(faqFindMany).toHaveBeenCalledWith({ where: { schoolId: "school1" }, orderBy: { sortOrder: "asc" } });
    expect(result).toHaveLength(1);

    await expect(listSchoolFaqItems("school1", stranger)).rejects.toBeInstanceOf(SchoolForbiddenError);
  });
});

describe("listPublicSchoolFaqItems() — без RBAC", () => {
  it("не требует пользователя, возвращает все вопросы школы", async () => {
    faqFindMany.mockResolvedValue([baseItem]);
    const result = await listPublicSchoolFaqItems("school1");
    expect(faqFindMany).toHaveBeenCalledWith({ where: { schoolId: "school1" }, orderBy: { sortOrder: "asc" } });
    expect(result).toHaveLength(1);
  });
});
