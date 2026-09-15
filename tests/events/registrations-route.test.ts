import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { User } from "@prisma/client";

// QA Test Gap #8 — "нет IDOR-теста на уровне HTTP-роута (route.ts) с двумя
// реальными организаторами — все текущие 'stranger'-тесты работают на
// уровне сервиса с мокнутым createdById, не на уровне HTTP-роута". Здесь НЕ
// мокается registration-service.ts/access.ts — реальный сервис выполняется
// целиком, мокается только самый нижний слой (@/lib/auth, @/lib/prisma),
// чтобы проверить весь путь запроса, а не только бизнес-логику в изоляции.

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const eventFindUnique = vi.fn();
const eventRegistrationFindMany = vi.fn();
const eventRegistrationCount = vi.fn();
const eventTeamMemberFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    eventRegistration: {
      findMany: (...a: unknown[]) => eventRegistrationFindMany(...a),
      count: (...a: unknown[]) => eventRegistrationCount(...a),
    },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
  },
}));

const { GET } = await import("@/app/api/events/[slug]/registrations/route");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "organizerB",
    email: "b@example.com",
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

function fakeRequest(url: string): NextRequest {
  return { url } as unknown as NextRequest;
}

const eventOwnedByOrganizerA = {
  id: "event-a",
  slug: "party-a",
  createdById: "organizerA",
  capacity: null,
};

beforeEach(() => {
  getCurrentUserMock.mockReset();
  eventFindUnique.mockReset().mockResolvedValue(eventOwnedByOrganizerA);
  eventRegistrationFindMany.mockReset().mockResolvedValue([]);
  eventRegistrationCount.mockReset().mockResolvedValue(0);
  eventTeamMemberFindUnique.mockReset().mockResolvedValue(null);
});

describe("GET /api/events/[slug]/registrations — IDOR на уровне HTTP-роута (QA Test Gap #8)", () => {
  it("Организатор B запрашивает список участников события Организатора A — 403, БД для чтения списка не трогается", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "organizerB" }));

    const res = await GET(fakeRequest("http://localhost/api/events/party-a/registrations"), {
      params: Promise.resolve({ slug: "party-a" }),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("forbidden");
    expect(eventRegistrationFindMany).not.toHaveBeenCalled();
  });

  it("сам Организатор A видит список своего события — 200", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "organizerA" }));
    eventRegistrationFindMany.mockResolvedValue([{ id: "reg1" }]);
    eventRegistrationCount.mockResolvedValue(1);

    const res = await GET(fakeRequest("http://localhost/api/events/party-a/registrations"), {
      params: Promise.resolve({ slug: "party-a" }),
    });

    expect(res.status).toBe(200);
  });

  it("не авторизован — 401, до события/сервиса дело не доходит", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const res = await GET(fakeRequest("http://localhost/api/events/party-a/registrations"), {
      params: Promise.resolve({ slug: "party-a" }),
    });

    expect(res.status).toBe(401);
    expect(eventFindUnique).not.toHaveBeenCalled();
  });

  it("ADMIN видит чужое событие — 200 (тот же роут, реальный сервис)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "admin1", role: "ADMIN" }));

    const res = await GET(fakeRequest("http://localhost/api/events/party-a/registrations"), {
      params: Promise.resolve({ slug: "party-a" }),
    });

    expect(res.status).toBe(200);
  });
});
