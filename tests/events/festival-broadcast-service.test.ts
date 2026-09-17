import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// Festival Engine — Stage 5 (2026-09-17, docs/FESTIVAL_SERVICE_LAYER_PLAN.md).
// sendFestivalPassBroadcast — узкая точка входа для рассылки держателям Pass
// фестиваля, RBAC строго isOwnerOrAdminFestival (НЕ hasFestivalAccess/
// команда — более чувствительное действие, тот же гейт, что у
// archiveFestival/deleteFestivalDraft).

const festivalFindUnique = vi.fn();
const passFindUnique = vi.fn();
const programItemFindFirst = vi.fn();
const sendBroadcastMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    festival: { findUnique: (...a: unknown[]) => festivalFindUnique(...a) },
    pass: { findUnique: (...a: unknown[]) => passFindUnique(...a) },
    programItem: { findFirst: (...a: unknown[]) => programItemFindFirst(...a) },
  },
}));

vi.mock("@/server/notifications/broadcast", () => ({
  sendBroadcast: (...a: unknown[]) => sendBroadcastMock(...a),
}));

const { sendFestivalPassBroadcast, FestivalBroadcastValidationError } = await import("@/server/events/festival-broadcast-service");
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
const admin = makeUser({ id: "admin1", role: "ADMIN" });
const stranger = makeUser({ id: "stranger1" });
const baseFestival = { id: "fest1", createdById: "owner1", eventId: "bridge-event1" };
const input = { title: "Изменение расписания", body: "Party перенесена на час позже", clientRequestId: "req-1" };

beforeEach(() => {
  vi.clearAllMocks();
  festivalFindUnique.mockResolvedValue({ ...baseFestival });
  passFindUnique.mockResolvedValue({ eventId: "bridge-event1" });
  programItemFindFirst.mockResolvedValue(null);
  sendBroadcastMock.mockResolvedValue({ broadcastId: "bc1", recipientCount: 5, alreadySent: false });
});

describe("sendFestivalPassBroadcast()", () => {
  it("фестиваль не найден — RegistrationNotFoundError", async () => {
    festivalFindUnique.mockResolvedValue(null);
    await expect(sendFestivalPassBroadcast("missing", "pass1", owner, input)).rejects.toBeInstanceOf(RegistrationNotFoundError);
    expect(sendBroadcastMock).not.toHaveBeenCalled();
  });

  it("постороннему запрещено (не владелец, не ADMIN)", async () => {
    await expect(sendFestivalPassBroadcast("fest1", "pass1", stranger, input)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(sendBroadcastMock).not.toHaveBeenCalled();
  });

  it("члену команды bridge-Event (не владельцу) — тоже запрещено (строже, чем hasFestivalAccess)", async () => {
    // Намеренно НЕ мокаем eventTeamMember — sendFestivalPassBroadcast вообще
    // не должен на него смотреть, в отличие от requireFestivalAccess.
    const teamMember = makeUser({ id: "team1" });
    await expect(sendFestivalPassBroadcast("fest1", "pass1", teamMember, input)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("ADMIN может отправить рассылку по чужому фестивалю", async () => {
    await sendFestivalPassBroadcast("fest1", "pass1", admin, input);
    expect(sendBroadcastMock).toHaveBeenCalled();
  });

  it("Pass не найден — pass_not_in_festival", async () => {
    passFindUnique.mockResolvedValue(null);
    await expect(sendFestivalPassBroadcast("fest1", "missing-pass", owner, input)).rejects.toMatchObject({
      code: "pass_not_in_festival",
    });
    expect(sendBroadcastMock).not.toHaveBeenCalled();
  });

  it("Pass принадлежит чужому событию, не связанному с этим фестивалем — pass_not_in_festival", async () => {
    passFindUnique.mockResolvedValue({ eventId: "unrelated-event" });
    programItemFindFirst.mockResolvedValue(null);
    await expect(sendFestivalPassBroadcast("fest1", "pass1", owner, input)).rejects.toBeInstanceOf(FestivalBroadcastValidationError);
    expect(sendBroadcastMock).not.toHaveBeenCalled();
  });

  it("Pass на bridge-Event фестиваля — разрешено, вызывает sendBroadcast с audience PASS", async () => {
    passFindUnique.mockResolvedValue({ eventId: "bridge-event1" });

    const result = await sendFestivalPassBroadcast("fest1", "pass1", owner, input);

    expect(sendBroadcastMock).toHaveBeenCalledWith({
      sentById: "owner1",
      audience: { kind: "SUBSCRIBERS", type: "PASS", targetId: "pass1" },
      title: input.title,
      body: input.body,
      clientRequestId: "req-1",
    });
    expect(result).toEqual({ broadcastId: "bc1", recipientCount: 5, alreadySent: false });
  });

  it("Pass на дочернем событии программы (ProgramItem.linkedEvent) — тоже разрешено", async () => {
    passFindUnique.mockResolvedValue({ eventId: "child-event1" });
    programItemFindFirst.mockResolvedValue({ id: "item1" });

    await sendFestivalPassBroadcast("fest1", "pass1", owner, input);

    expect(programItemFindFirst).toHaveBeenCalledWith({
      where: { festivalId: "fest1", linkedEventId: "child-event1" },
      select: { id: true },
    });
    expect(sendBroadcastMock).toHaveBeenCalled();
  });

  it("у фестиваля ещё нет bridge-Event (eventId=null) — Pass не может ему принадлежать напрямую, но может через ProgramItem", async () => {
    festivalFindUnique.mockResolvedValue({ ...baseFestival, eventId: null });
    passFindUnique.mockResolvedValue({ eventId: "child-event1" });
    programItemFindFirst.mockResolvedValue({ id: "item1" });

    await sendFestivalPassBroadcast("fest1", "pass1", owner, input);

    expect(sendBroadcastMock).toHaveBeenCalled();
  });
});
