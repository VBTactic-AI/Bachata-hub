import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

const schoolFindUnique = vi.fn();
const branchFindUnique = vi.fn();
const branchCreate = vi.fn();
const branchUpdate = vi.fn();
const branchDelete = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: { findUnique: (...a: unknown[]) => schoolFindUnique(...a) },
    schoolBranch: {
      findUnique: (...a: unknown[]) => branchFindUnique(...a),
      create: (...a: unknown[]) => branchCreate(...a),
      update: (...a: unknown[]) => branchUpdate(...a),
      delete: (...a: unknown[]) => branchDelete(...a),
    },
  },
}));

const { createSchoolBranch, updateSchoolBranch, deleteSchoolBranch, SchoolBranchValidationError } = await import(
  "@/server/schools/update-branches"
);
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
const baseBranch = { id: "branch1", schoolId: "school1", address: "ул. Октябрьская, 16", cityId: null, latitude: null, longitude: null };

beforeEach(() => {
  vi.clearAllMocks();
  schoolFindUnique.mockResolvedValue({ ...baseSchool });
  branchFindUnique.mockResolvedValue({ ...baseBranch, school: { ...baseSchool } });
  branchCreate.mockImplementation((args) => Promise.resolve({ ...baseBranch, ...args.data }));
  branchUpdate.mockImplementation((args) => Promise.resolve({ ...baseBranch, ...args.data }));
});

describe("createSchoolBranch()", () => {
  it("постороннему запрещено", async () => {
    await expect(createSchoolBranch("school1", stranger, { address: "Адрес" })).rejects.toBeInstanceOf(SchoolForbiddenError);
  });

  it("школа не найдена", async () => {
    schoolFindUnique.mockResolvedValue(null);
    await expect(createSchoolBranch("missing", owner, { address: "Адрес" })).rejects.toBeInstanceOf(SchoolNotFoundError);
  });

  it("требует и широту, и долготу одновременно", async () => {
    await expect(createSchoolBranch("school1", owner, { address: "Адрес", latitude: 53.9 })).rejects.toBeInstanceOf(
      SchoolBranchValidationError
    );
    await expect(createSchoolBranch("school1", owner, { address: "Адрес", longitude: 27.5 })).rejects.toBeInstanceOf(
      SchoolBranchValidationError
    );
  });

  it("создаёт филиал без координат", async () => {
    await createSchoolBranch("school1", owner, { address: "ул. Октябрьская, 16" });
    expect(branchCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ schoolId: "school1", address: "ул. Октябрьская, 16", latitude: null }) })
    );
  });

  it("создаёт филиал с координатами", async () => {
    await createSchoolBranch("school1", owner, { address: "ул. Октябрьская, 16", latitude: 53.9006, longitude: 27.559 });
    expect(branchCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ latitude: 53.9006, longitude: 27.559 }) })
    );
  });
});

describe("updateSchoolBranch() / deleteSchoolBranch()", () => {
  it("постороннему запрещено", async () => {
    await expect(updateSchoolBranch("branch1", stranger, { address: "Новый адрес" })).rejects.toBeInstanceOf(SchoolForbiddenError);
    await expect(deleteSchoolBranch("branch1", stranger)).rejects.toBeInstanceOf(SchoolForbiddenError);
  });

  it("владелец обновляет и удаляет", async () => {
    await updateSchoolBranch("branch1", owner, { address: "Новый адрес" });
    expect(branchUpdate).toHaveBeenCalledWith({ where: { id: "branch1" }, data: { address: "Новый адрес" } });

    await deleteSchoolBranch("branch1", owner);
    expect(branchDelete).toHaveBeenCalledWith({ where: { id: "branch1" } });
  });

  it("не разрешает частично очистить координаты, оставив только одну", async () => {
    branchFindUnique.mockResolvedValue({ ...baseBranch, latitude: 53.9, longitude: 27.5, school: { ...baseSchool } });
    await expect(updateSchoolBranch("branch1", owner, { latitude: null })).rejects.toBeInstanceOf(SchoolBranchValidationError);
  });
});
