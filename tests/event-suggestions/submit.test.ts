import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// §7 ТЗ (Event Suggestions) — подача предложения. Мокается только
// @/lib/prisma, по образцу tests/access-requests/*.

const eventSuggestionCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    eventSuggestion: { create: (...a: unknown[]) => eventSuggestionCreate(...a) },
  },
}));

const { suggestEvent } = await import("@/server/event-suggestions/submit");
const { EventSuggestionValidationError } = await import("@/server/event-suggestions/errors");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user1",
    email: "u@example.com",
    passwordHash: null,
    supabaseUserId: null,
    role: "DANCER",
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
  eventSuggestionCreate.mockReset().mockResolvedValue({ id: "suggestion1" });
});

describe("suggestEvent()", () => {
  it("создаёт предложение с обязательными полями", async () => {
    await suggestEvent(user, { title: "Bachata Party", description: "Где-то в Минске, слышал от друзей" });

    expect(eventSuggestionCreate).toHaveBeenCalledWith({
      data: {
        suggestedById: "user1",
        title: "Bachata Party",
        description: "Где-то в Минске, слышал от друзей",
        cityId: null,
        proposedDate: null,
        link: null,
      },
    });
  });

  it("передаёт необязательные поля, если заполнены", async () => {
    await suggestEvent(user, {
      title: "Bachata Party",
      description: "Где-то в Минске, слышал от друзей",
      cityId: "city1",
      proposedDate: "2026-10-01",
      link: "https://instagram.com/post",
    });

    expect(eventSuggestionCreate).toHaveBeenCalledWith({
      data: {
        suggestedById: "user1",
        title: "Bachata Party",
        description: "Где-то в Минске, слышал от друзей",
        cityId: "city1",
        proposedDate: new Date("2026-10-01"),
        link: "https://instagram.com/post",
      },
    });
  });

  it("слишком короткое название — EventSuggestionValidationError, ничего не создаётся", async () => {
    await expect(suggestEvent(user, { title: "ab", description: "Где-то в Минске, слышал от друзей" })).rejects.toBeInstanceOf(
      EventSuggestionValidationError
    );
    expect(eventSuggestionCreate).not.toHaveBeenCalled();
  });

  it("слишком короткое описание — EventSuggestionValidationError", async () => {
    await expect(suggestEvent(user, { title: "Bachata Party", description: "коротко" })).rejects.toBeInstanceOf(
      EventSuggestionValidationError
    );
  });

  it("невалидная ссылка — EventSuggestionValidationError", async () => {
    await expect(
      suggestEvent(user, { title: "Bachata Party", description: "Где-то в Минске, слышал от друзей", link: "не ссылка" })
    ).rejects.toBeInstanceOf(EventSuggestionValidationError);
  });

  it("пустая строка вместо ссылки — валидна, трактуется как отсутствие ссылки", async () => {
    await suggestEvent(user, { title: "Bachata Party", description: "Где-то в Минске, слышал от друзей", link: "" });
    expect(eventSuggestionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ link: null }) }));
  });
});
