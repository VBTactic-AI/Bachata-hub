import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

const accessRequestCreate = vi.fn();
const fakeTx = { accessRequest: { create: (...a: unknown[]) => accessRequestCreate(...a) } };

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx) },
}));

const { submitAccessRequest } = await import("@/server/access-requests/submit");
const { AccessRequestValidationError } = await import("@/server/access-requests/errors");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
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

const commonFields = {
  brandName: "Warsaw Bachata Community",
  description: "Организуем регулярные вечеринки и мастер-классы.",
  cityId: "city1",
  countryId: "country1",
  links: [{ type: "INSTAGRAM" as const, url: "https://instagram.com/x" }],
  confirmedAccurate: true as const,
};

beforeEach(() => {
  accessRequestCreate.mockReset().mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data));
});

describe("submitAccessRequest", () => {
  it("создаёт по одной строке AccessRequest на каждый отмеченный тип", async () => {
    const created = await submitAccessRequest(makeUser(), {
      ...commonFields,
      types: ["EVENT_ORGANIZER", "SCHOOL_HEAD"],
      payloadByType: {
        EVENT_ORGANIZER: { eventTypes: ["PARTY"], experience: "1_3Y" },
        SCHOOL_HEAD: { schoolName: "Bachata Warsaw", teachingStyles: ["Bachata"], teachersCount: "2_5", hasRegularClasses: true },
      },
    });

    expect(accessRequestCreate).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(2);
    expect((created[0] as { type: string }).type).toBe("EVENT_ORGANIZER");
    expect((created[1] as { type: string }).type).toBe("SCHOOL_HEAD");
  });

  it("отклоняет заявку без обязательного согласия confirmedAccurate", async () => {
    await expect(
      submitAccessRequest(makeUser(), {
        ...commonFields,
        confirmedAccurate: false as unknown as true,
        types: ["EVENT_ORGANIZER"],
        payloadByType: { EVENT_ORGANIZER: { eventTypes: ["PARTY"], experience: "NEW" } },
      })
    ).rejects.toThrow(AccessRequestValidationError);
    expect(accessRequestCreate).not.toHaveBeenCalled();
  });

  it("отклоняет заявку, если payload конкретного типа не проходит валидацию (пустой teachingStyles у SCHOOL_HEAD)", async () => {
    await expect(
      submitAccessRequest(makeUser(), {
        ...commonFields,
        types: ["SCHOOL_HEAD"],
        payloadByType: { SCHOOL_HEAD: { schoolName: "X", teachingStyles: [], teachersCount: "1", hasRegularClasses: false } },
      })
    ).rejects.toThrow(AccessRequestValidationError);
    expect(accessRequestCreate).not.toHaveBeenCalled();
  });
});
