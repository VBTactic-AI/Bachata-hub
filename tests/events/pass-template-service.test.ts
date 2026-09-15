import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// PassTemplate (2026-09-16) — "полностью заведённый Pass, сохранённый как
// шаблон". Владелец — createdById (+ ADMIN bypass), без привязки к Event.

const passTemplateCreate = vi.fn();
const passTemplateFindMany = vi.fn();
const passTemplateFindUnique = vi.fn();
const passTemplateUpdate = vi.fn();
const passTemplateDelete = vi.fn();
const passFindUnique = vi.fn(); // requireOwnerOrAdminPass (pass-service.ts)

vi.mock("@/lib/prisma", () => ({
  prisma: {
    passTemplate: {
      create: (...a: unknown[]) => passTemplateCreate(...a),
      findMany: (...a: unknown[]) => passTemplateFindMany(...a),
      findUnique: (...a: unknown[]) => passTemplateFindUnique(...a),
      update: (...a: unknown[]) => passTemplateUpdate(...a),
      delete: (...a: unknown[]) => passTemplateDelete(...a),
    },
    pass: { findUnique: (...a: unknown[]) => passFindUnique(...a) },
  },
}));

const {
  createPassTemplate,
  createPassTemplateFromPass,
  listPassTemplatesForUser,
  updatePassTemplate,
  deletePassTemplate,
  PassTemplateValidationError,
} = await import("@/server/events/pass-template-service");
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
  };
}

const user = makeUser();

beforeEach(() => {
  passTemplateCreate.mockReset().mockImplementation((args) => Promise.resolve({ id: "tmpl1", ...args.data }));
  passTemplateFindMany.mockReset().mockResolvedValue([]);
  passTemplateFindUnique.mockReset();
  passTemplateUpdate.mockReset().mockImplementation((args) => Promise.resolve({ id: "tmpl1", ...args.data }));
  passTemplateDelete.mockReset().mockResolvedValue({});
  passFindUnique.mockReset();
});

describe("createPassTemplate()", () => {
  it("пустое имя — PassTemplateValidationError", async () => {
    await expect(createPassTemplate(user, { name: "  ", type: "FULL_PASS" })).rejects.toBeInstanceOf(PassTemplateValidationError);
  });

  it("отрицательная цена — PassTemplateValidationError", async () => {
    await expect(createPassTemplate(user, { name: "Full Pass", type: "FULL_PASS", price: -1 })).rejects.toBeInstanceOf(
      PassTemplateValidationError
    );
  });

  it("создаёт шаблон, владелец = текущий пользователь", async () => {
    await createPassTemplate(user, { name: "  Full Pass  ", type: "FULL_PASS", price: 120, currency: "BYN" });
    expect(passTemplateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ createdById: "user1", name: "Full Pass", price: 120, currency: "BYN" }),
    });
  });
});

describe("createPassTemplateFromPass() — «Сохранить как шаблон»", () => {
  it("копирует содержательные поля Pass, НЕ копирует даты/soldQuantity/status", async () => {
    passFindUnique.mockResolvedValue({
      id: "pass1",
      name: "VIP Pass",
      description: "Приоритетная рассадка",
      type: "VIP_PASS",
      price: 250,
      currency: "BYN",
      quantity: 20,
      imageUrl: "https://example.com/vip.jpg",
      allowMultipleEntry: false,
      soldQuantity: 15,
      status: "ACTIVE",
      salesStartAt: new Date(),
      event: { id: "event1", createdById: "user1" },
    });

    await createPassTemplateFromPass("pass1", user);

    expect(passTemplateCreate).toHaveBeenCalledWith({
      data: {
        createdById: "user1",
        name: "VIP Pass",
        description: "Приоритетная рассадка",
        type: "VIP_PASS",
        price: 250,
        currency: "BYN",
        quantity: 20,
        imageUrl: "https://example.com/vip.jpg",
        allowMultipleEntry: false,
      },
    });
  });

  it("чужой Pass (не владелец события) — RegistrationForbiddenError", async () => {
    passFindUnique.mockResolvedValue({ id: "pass1", event: { id: "event1", createdById: "someone-else" } });
    await expect(createPassTemplateFromPass("pass1", user)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(passTemplateCreate).not.toHaveBeenCalled();
  });

  it("необязательное имя переопределяет имя исходного Pass", async () => {
    passFindUnique.mockResolvedValue({
      id: "pass1",
      name: "VIP Pass",
      description: null,
      type: "VIP_PASS",
      price: 250,
      currency: "BYN",
      quantity: null,
      imageUrl: null,
      allowMultipleEntry: true,
      event: { id: "event1", createdById: "user1" },
    });

    await createPassTemplateFromPass("pass1", user, "Мой шаблон VIP");

    expect(passTemplateCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ name: "Мой шаблон VIP" }) });
  });
});

describe("listPassTemplatesForUser()", () => {
  it("обычный пользователь видит только свои шаблоны", async () => {
    await listPassTemplatesForUser(user);
    expect(passTemplateFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { createdById: "user1" } }));
  });

  it("ADMIN видит все шаблоны", async () => {
    await listPassTemplatesForUser(makeUser({ id: "admin1", role: "ADMIN" }));
    expect(passTemplateFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});

describe("updatePassTemplate() / deletePassTemplate()", () => {
  it("updatePassTemplate — чужой шаблон, не ADMIN — RegistrationForbiddenError", async () => {
    passTemplateFindUnique.mockResolvedValue({ id: "tmpl1", createdById: "someone-else" });
    await expect(updatePassTemplate("tmpl1", user, { name: "New" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(passTemplateUpdate).not.toHaveBeenCalled();
  });

  it("updatePassTemplate — шаблон не найден — RegistrationNotFoundError", async () => {
    passTemplateFindUnique.mockResolvedValue(null);
    await expect(updatePassTemplate("missing", user, { name: "New" })).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("updatePassTemplate — владелец — обновляет", async () => {
    passTemplateFindUnique.mockResolvedValue({ id: "tmpl1", createdById: "user1" });
    await updatePassTemplate("tmpl1", user, { name: "Новое имя" });
    expect(passTemplateUpdate).toHaveBeenCalledWith({ where: { id: "tmpl1" }, data: { name: "Новое имя" } });
  });

  it("updatePassTemplate — ADMIN может редактировать чужой шаблон", async () => {
    passTemplateFindUnique.mockResolvedValue({ id: "tmpl1", createdById: "someone-else" });
    await updatePassTemplate("tmpl1", makeUser({ id: "admin1", role: "ADMIN" }), { name: "Новое имя" });
    expect(passTemplateUpdate).toHaveBeenCalled();
  });

  it("deletePassTemplate — чужой шаблон — RegistrationForbiddenError, delete не вызывается", async () => {
    passTemplateFindUnique.mockResolvedValue({ id: "tmpl1", createdById: "someone-else" });
    await expect(deletePassTemplate("tmpl1", user)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(passTemplateDelete).not.toHaveBeenCalled();
  });

  it("deletePassTemplate — владелец — удаляет физически (не архивация, чистая конфигурация)", async () => {
    passTemplateFindUnique.mockResolvedValue({ id: "tmpl1", createdById: "user1" });
    await deletePassTemplate("tmpl1", user);
    expect(passTemplateDelete).toHaveBeenCalledWith({ where: { id: "tmpl1" } });
  });
});
