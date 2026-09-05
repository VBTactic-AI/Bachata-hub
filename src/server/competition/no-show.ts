import type { CompetitionStatus, RegistrationStatus } from "@prisma/client";

// "Неявка" — не отдельный статус в БД (CheckIn создаётся только при реальном
// приходе участника, docs/05_STATUS_REFERENCE.md, Часть Г, п.5 — заводить
// CheckIn-строку для того, кто не пришёл, ломало бы этот инвариант и мешало
// бы организатору зачекинить опоздавшего позже, т.к. CheckIn.registrationId
// уникален). Вместо этого считается на лету: REGISTERED без CheckIn, но
// только после того, как окно check-in уже закрылось — до этого "не пришёл"
// не отличить от "ещё не подошла его очередь".
const CHECK_IN_PHASE_STATUSES: ReadonlySet<CompetitionStatus> = new Set([
  "DRAFT",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "CHECK_IN",
]);

export function isCheckInPhaseOver(competitionStatus: CompetitionStatus): boolean {
  return !CHECK_IN_PHASE_STATUSES.has(competitionStatus);
}

// SCRATCHED/DISQUALIFIED — отдельные, явно принятые организатором решения
// (не про явку) — неявкой не считаются, даже если check-in тоже нет.
export function isNoShow(params: {
  registrationStatus: RegistrationStatus;
  hasCheckIn: boolean;
  competitionStatus: CompetitionStatus;
}): boolean {
  return (
    params.registrationStatus === "REGISTERED" &&
    !params.hasCheckIn &&
    isCheckInPhaseOver(params.competitionStatus)
  );
}
