import { describe, expect, it } from "vitest";
import { shouldAutoApproveEvent } from "@/lib/events/moderation";
import type { School, User } from "@prisma/client";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "u@example.com",
    passwordHash: null,
    supabaseUserId: null,
    role: "SCHOOL_REP",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    isBlocked: false,
    ...overrides,
  };
}

function makeSchool(overrides: Partial<School> = {}): School {
  return {
    id: "school-1",
    slug: "school-1",
    name: "School",
    cityId: "city-1",
    description: null,
    directions: [],
    levels: [],
    contactPhone: null,
    contactEmail: null,
    socialLinks: null,
    verificationStatus: "VERIFIED",
    ownerUserId: "user-1",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Решение пользователя (2026-09-12, эта сессия): без модерации — школы со
// статусом VERIFIED и их владелец/представитель, плюс сайтовый ADMIN.
describe("shouldAutoApproveEvent", () => {
  it("bypasses moderation for the ADMIN role regardless of school", () => {
    expect(shouldAutoApproveEvent(makeUser({ role: "ADMIN" }), null)).toBe(true);
    expect(shouldAutoApproveEvent(makeUser({ role: "ADMIN" }), makeSchool({ verificationStatus: "COMMUNITY" }))).toBe(true);
  });

  it("bypasses moderation for the verified school's own owner", () => {
    const user = makeUser({ id: "owner-1" });
    const school = makeSchool({ ownerUserId: "owner-1", verificationStatus: "VERIFIED" });
    expect(shouldAutoApproveEvent(user, school)).toBe(true);
  });

  it("does NOT bypass moderation for a community (unverified) school, even for its owner", () => {
    const user = makeUser({ id: "owner-1" });
    const school = makeSchool({ ownerUserId: "owner-1", verificationStatus: "COMMUNITY" });
    expect(shouldAutoApproveEvent(user, school)).toBe(false);
  });

  it("does NOT bypass moderation for a verified school if the user is not its owner", () => {
    const user = makeUser({ id: "someone-else" });
    const school = makeSchool({ ownerUserId: "owner-1", verificationStatus: "VERIFIED" });
    expect(shouldAutoApproveEvent(user, school)).toBe(false);
  });

  it("does NOT bypass moderation for an organizer without a school", () => {
    const user = makeUser({ role: "ORGANIZER" });
    expect(shouldAutoApproveEvent(user, null)).toBe(false);
  });
});
