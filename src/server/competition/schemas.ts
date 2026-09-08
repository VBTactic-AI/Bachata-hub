import { z } from "zod";
import { registrationRoleSchema } from "./registration-schemas";

export const createCompetitionSchema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  organizerName: z.string().max(200).optional(),
  venue: z.string().max(200).optional(),
  cityId: z.string().optional(),
  timezone: z.string().min(1).default("Europe/Minsk"),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  eventId: z.string().optional(),
});
export type CreateCompetitionInput = z.infer<typeof createCompetitionSchema>;

// Режим ротации партнёров дивизиона по умолчанию (Этап 6, docs/00_DECISIONS.md,
// A12) — два независимых сценария, не переключатели одного: TRACK_AUTO_SHIFT
// (смены внутри трека по таймеру) и SEGMENT_MANUAL_SHIFT (DJ вручную
// останавливает отрезок, затем выбирается число партнёров для перехода).
export const rotationModeSchema = z.enum(["TRACK_AUTO_SHIFT", "SEGMENT_MANUAL_SHIFT"]);

// Сколько пар участвует в каждом этапе — задаётся ОДИН РАЗ при создании
// дивизиона, до начала соревнования, дальше не меняется (docs/00_DECISIONS.md,
// A14): это исходные данные для расчёта cutoff в Advancement Engine.
export const divisionStagePlanEntrySchema = z.object({
  stageId: z.string().min(1),
  participantCount: z.coerce.number().int().positive(),
});

// Метод оценки раундов ДО финала (1 = "Да/Нет", 2 = "0/1/2" с квотой по
// числу проходящих) — задаётся при создании дивизиона (addDivisionSchema).
// Можно поменять и позже, но только до старта соревнования (competition.status
// раньше LIVE) — см. updateDivisionSettings() и вкладку "Судьи" → "Настройки
// судейства" (по запросу пользователя, 2026-09-09). У уже созданных раундов
// свой снимок значения (Round.judgingMaxScore) — задним числом не меняется
// (CLAUDE.md §50-51).
export const judgingMaxScoreSchema = z.coerce.number().int().refine((v) => v === 1 || v === 2, {
  message: 'Метод оценки должен быть "Да/Нет" (1) или "0/1/2" (2).',
});

export const addDivisionSchema = z.object({
  categoryId: z.string().min(1),
  minAge: z.coerce.number().int().positive().optional(),
  maxAge: z.coerce.number().int().positive().optional(),
  maxParticipants: z.coerce.number().int().positive().optional(),
  // Вместимость заезда (пар одновременно на паркете) — используется при
  // авто-генерации раундов/заездов. Необязательно — если не задать, в базе
  // используется значение по умолчанию (docs/00_DECISIONS.md, A7).
  heatCapacity: z.coerce.number().int().positive().optional(),
  rotationMode: rotationModeSchema.optional(),
  rotationIntervalSec: z.coerce.number().int().positive().optional(),
  rotationShiftMin: z.coerce.number().int().positive().optional(),
  rotationShiftMax: z.coerce.number().int().positive().optional(),
  judgingMaxScore: judgingMaxScoreSchema.default(1),
  stagePlan: z.array(divisionStagePlanEntrySchema).default([]),
  rules: z.record(z.unknown()).default({}),
});
export type AddDivisionInput = z.infer<typeof addDivisionSchema>;

// Изменение вместимости/ротации уже созданного дивизиона — отдельно от
// создания (по запросу пользователя, 2026-09-04): категория не меняется
// здесь (для этого — смена дивизиона у конкретной регистрации,
// change-registration-division.ts, другой смысл).
export const updateDivisionSettingsSchema = z.object({
  // Необязательное — присылается только панелью категории (вкладка
  // "Категории"), не панелью ротации (вкладка "Раунды", временное
  // расположение, 2026-09-09). updateDivisionSettings() дополнительно
  // проверяет, что для категории ещё не сгенерированы раунды.
  heatCapacity: z.coerce.number().int().positive().optional(),
  rotationMode: rotationModeSchema,
  rotationIntervalSec: z.coerce.number().int().positive(),
  rotationShiftMin: z.coerce.number().int().positive(),
  rotationShiftMax: z.coerce.number().int().positive(),
  // Необязательное — присылается только формой "Настройки судейства"
  // (вкладка "Судьи"), обычная DivisionSettingsPanel его не трогает.
  // updateDivisionSettings() дополнительно проверяет, что соревнование ещё
  // не началось (см. там же).
  judgingMaxScore: judgingMaxScoreSchema.optional(),
  // Необязательное — присылается только панелью категории (вкладка
  // "Категории", 2026-09-09), не при создании (там — addDivisionSchema).
  // Разворот A14: план по этапам стал редактируемым, но ТОЛЬКО пока для
  // категории не сгенерированы раунды (см. updateDivisionSettings()) —
  // после генерации план уже "зафиксирован" в Round.finalistsCount, дальше
  // менять его без пересборки раундов не имеет смысла.
  stagePlan: z.array(divisionStagePlanEntrySchema).optional(),
});
export type UpdateDivisionSettingsInput = z.infer<typeof updateDivisionSettingsSchema>;

export const createDivisionCategorySchema = z.object({
  name: z.string().min(1).max(100),
});
export type CreateDivisionCategoryInput = z.infer<typeof createDivisionCategorySchema>;

// Все поля необязательны по отдельности (можно поменять только порядок,
// только название, или только видимость) — но хотя бы одно обязано
// присутствовать. До этого порядок вообще нельзя было поменять после
// создания (2026-09-04).
export const updateDivisionCategorySchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    order: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.order !== undefined || v.isActive !== undefined, {
    message: "Нужно указать хотя бы одно поле для изменения.",
  });
export type UpdateDivisionCategoryInput = z.infer<typeof updateDivisionCategorySchema>;

export const createJudgingCriterionCatalogSchema = z
  .object({
    name: z.string().min(1).max(100),
    minScore: z.coerce.number().int(),
    maxScore: z.coerce.number().int(),
    step: z.coerce.number().int().positive().default(1),
  })
  .refine((v) => v.maxScore > v.minScore, { message: "Максимум должен быть больше минимума.", path: ["maxScore"] });
export type CreateJudgingCriterionCatalogInput = z.infer<typeof createJudgingCriterionCatalogSchema>;

// Все поля необязательны по отдельности (как updateDivisionCategorySchema) —
// но хотя бы одно обязано присутствовать.
export const updateJudgingCriterionCatalogSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    minScore: z.coerce.number().int().optional(),
    maxScore: z.coerce.number().int().optional(),
    step: z.coerce.number().int().positive().optional(),
    order: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.minScore !== undefined || v.maxScore !== undefined || v.step !== undefined || v.order !== undefined || v.isActive !== undefined,
    { message: "Нужно указать хотя бы одно поле для изменения." }
  );
export type UpdateJudgingCriterionCatalogInput = z.infer<typeof updateJudgingCriterionCatalogSchema>;

export const createRoundStageSchema = z.object({
  name: z.string().min(1).max(100),
  defaultAdvanceCount: z.coerce.number().int().positive(),
});
export type CreateRoundStageInput = z.infer<typeof createRoundStageSchema>;

// Все поля необязательны по отдельности (можно поменять только isActive,
// только название, только порядок, или всё сразу) — но хотя бы одно обязано
// присутствовать. order — та же ручная сортировка перетаскиванием, что уже
// есть у DivisionCategory (updateDivisionCategorySchema), по запросу
// пользователя добавлена и сюда (2026-09-09).
export const updateRoundStageSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    defaultAdvanceCount: z.coerce.number().int().positive().optional(),
    order: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.defaultAdvanceCount !== undefined || v.order !== undefined || v.isActive !== undefined,
    { message: "Нужно указать хотя бы одно поле для изменения." }
  );
export type UpdateRoundStageInput = z.infer<typeof updateRoundStageSchema>;

export const changeRegistrationDivisionSchema = z.object({
  divisionId: z.string().min(1),
  reason: z.string().max(500).optional(),
});
export type ChangeRegistrationDivisionInput = z.infer<typeof changeRegistrationDivisionSchema>;

export const setRulesSchema = z.object({
  rules: z.record(z.unknown()),
});
export type SetRulesInput = z.infer<typeof setRulesSchema>;

// --- Публичная страница (Этап 12) — чисто информационные поля ---

// Форма всегда отправляет все три поля разом (не частичный патч) — пустая
// строка означает явное намерение "очистить", а не "не менять" (сервис
// сохраняет её как null, не как undefined/пропуск).
const optionalUrlOrEmpty = z
  .string()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), { message: "Ссылка должна начинаться с http:// или https://" });

export const updateCompetitionPublicInfoSchema = z.object({
  rulesText: z.string().max(5000),
  rulesUrl: optionalUrlOrEmpty,
  mediaUrl: optionalUrlOrEmpty,
});
export type UpdateCompetitionPublicInfoInput = z.infer<typeof updateCompetitionPublicInfoSchema>;

export const competitionStatusSchema = z.enum([
  "DRAFT",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "CHECK_IN",
  "READY",
  "LIVE",
  "SCORING",
  "REVIEW",
  "PUBLISHED",
  "ARCHIVED",
]);

export const transitionCompetitionSchema = z.object({
  to: competitionStatusSchema,
  reason: z.string().max(500).optional(),
});
export type TransitionCompetitionInput = z.infer<typeof transitionCompetitionSchema>;

export const generateRoundsSchema = z.object({}).default({});
export type GenerateRoundsInput = z.infer<typeof generateRoundsSchema>;

// PAUSED намеренно отсутствует — пауза раунда как отдельная кнопка убрана
// (по запросу пользователя, 2026-09-04): она путалась с паузой захода и
// вызвала реальный баг (раунд застревал, docs/00_DECISIONS.md A17), а
// единственный её эффект (не дать стартовать следующий заход) и так
// достигается тем, что "Запустить" просто не нажимают. Пауза остаётся у
// захода и у ротации партнёров — это разные, самостоятельные вещи.
export const roundStatusSchema = z.enum(["DRAFT", "READY", "DRAWING", "DRAW_LOCKED", "RUNNING", "FINISHED", "SCORING", "COMPLETED"]);

export const transitionRoundSchema = z.object({
  to: roundStatusSchema,
  reason: z.string().max(500).optional(),
});
export type TransitionRoundInput = z.infer<typeof transitionRoundSchema>;

export const heatStatusSchema = z.enum(["PENDING", "RUNNING", "PAUSED", "FINISHED"]);

export const transitionHeatSchema = z.object({
  to: heatStatusSchema,
  reason: z.string().max(500).optional(),
});
export type TransitionHeatInput = z.infer<typeof transitionHeatSchema>;

// --- Draw Engine (Этап 5, docs/00_DECISIONS.md A5/A6) ---

export const callOrderSchema = z.enum(["SEQUENTIAL", "RANDOM"]);

export const startDrawingSchema = z.object({
  callOrder: callOrderSchema,
});
export type StartDrawingInput = z.infer<typeof startDrawingSchema>;

export const rerollDrawSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type RerollDrawInput = z.infer<typeof rerollDrawSchema>;

export const addDrawHelperSchema = z.object({
  registrationId: z.string().min(1),
  role: registrationRoleSchema,
});
export type AddDrawHelperInput = z.infer<typeof addDrawHelperSchema>;

export const replaceDrawHelperSchema = z.object({
  registrationId: z.string().min(1),
});
export type ReplaceDrawHelperInput = z.infer<typeof replaceDrawHelperSchema>;

// --- Живой танцпол / ротация партнёров (Этап 6, docs/00_DECISIONS.md A12) ---

export const nextTrackSchema = z.object({
  trackName: z.string().max(200).optional(),
});
export type NextTrackInput = z.infer<typeof nextTrackSchema>;

export const shiftSourceSchema = z.enum(["RANDOM", "MANUAL"]);

export const chooseShiftSchema = z
  .object({
    source: shiftSourceSchema,
    n: z.coerce.number().int().optional(),
  })
  .refine((v) => v.source === "RANDOM" || v.n !== undefined, {
    message: "Укажите число партнёров.",
    path: ["n"],
  });
export type ChooseShiftInput = z.infer<typeof chooseShiftSchema>;

// --- Судейство и определение проходящих (Этапы 7-8) ---

// role — необязательна: сервер сам определяет её по полу судьи
// (suggestedRoleForGender, judge-assignment.ts). Клиент присылает её только
// запасным путём, когда у судьи пол не указан — тогда сервер вернёт понятную
// ошибку без role, и форма покажет выбор вручную (2026-09-09).
export const assignJudgeSchema = z.object({
  judgeUserId: z.string().min(1),
  role: registrationRoleSchema.optional(),
});
export type AssignJudgeInput = z.infer<typeof assignJudgeSchema>;

// Добавление человека в общий ростер судей соревнования (CompetitionMember,
// роль JUDGE), без привязки к категории — "Общий список судей" на вкладке
// "Судьи" (2026-09-09).
export const addCompetitionJudgeSchema = z.object({
  judgeUserId: z.string().min(1),
});
export type AddCompetitionJudgeInput = z.infer<typeof addCompetitionJudgeSchema>;

// Судейская сетка дивизиона одним "Сохранить" (две таблички — кто судит
// ведущих/ведомых, галочки из общего пула судей соревнования) — по запросу
// пользователя, 2026-09-04, заменяет добавление судей по одному.
export const setDivisionJudgesSchema = z.object({
  leaderJudgeUserIds: z.array(z.string().min(1)),
  followerJudgeUserIds: z.array(z.string().min(1)),
});
export type SetDivisionJudgesInput = z.infer<typeof setDivisionJudgesSchema>;

export const submitJudgeScoreSchema = z.object({
  value: z.coerce.number().int().min(0),
  // Ключ идемпотентности офлайн-очереди клиента (CLAUDE.md §17) — судья
  // должен успеть отправить оценку, даже если связи не было.
  clientSubmissionId: z.string().min(1),
});
export type SubmitJudgeScoreInput = z.infer<typeof submitJudgeScoreSchema>;

export const recordTieBreakDecisionSchema = z.object({
  advancingRegistrationIds: z.array(z.string().min(1)).min(1),
});
export type RecordTieBreakDecisionInput = z.infer<typeof recordTieBreakDecisionSchema>;

// --- Финал (Этап 9, docs/00_DECISIONS.md A22) ---

export const finalFormatSchema = z.enum(["NORMAL", "JUDGES_DANCE", "RANDOM_COUPLES", "RELATIVE_PLACEMENT"]);

export const setFinalSettingsSchema = z.object({
  format: finalFormatSchema,
  tracksCount: z.coerce.number().int().positive().default(1),
  partnerChangeEnabled: z.boolean().default(false),
  config: z.record(z.unknown()).default({}),
});
export type SetFinalSettingsInput = z.infer<typeof setFinalSettingsSchema>;

// id — есть у уже существующего критерия (обновить), нет — создать новый.
// priority — НЕ коэффициент (CLAUDE.md-стиль промта пользователя, 2026-09-04):
// только порядок сравнения критериев при полной ничье общей суммы.
export const finalCriterionInputSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1).max(100),
    priority: z.coerce.number().int().positive(),
    minScore: z.coerce.number().int(),
    maxScore: z.coerce.number().int(),
    step: z.coerce.number().int().positive().default(1),
    // Откуда скопированы значения (справочник) — только след происхождения,
    // не живая ссылка (см. JudgingCriterionCatalog в schema.prisma).
    catalogId: z.string().optional().nullable(),
  })
  .refine((v) => v.maxScore > v.minScore, { message: "Максимум должен быть больше минимума.", path: ["maxScore"] });
export type FinalCriterionInput = z.infer<typeof finalCriterionInputSchema>;

// Полный список критериев дивизиона одним "Сохранить" (как setDivisionJudges) —
// приоритеты обязаны быть уникальны и идти подряд 1..N (проверяется в
// сервисе, промт пользователя п.50 "priority уникальны"/"идут последовательно").
export const setFinalCriteriaSchema = z.object({
  criteria: z.array(finalCriterionInputSchema).min(1),
});
export type SetFinalCriteriaInput = z.infer<typeof setFinalCriteriaSchema>;

export const submitFinalJudgeScoreSchema = z.object({
  criterionId: z.string().min(1),
  value: z.coerce.number().int(),
  clientSubmissionId: z.string().min(1),
});
export type SubmitFinalJudgeScoreInput = z.infer<typeof submitFinalJudgeScoreSchema>;

// RANK_ALL (CLAUDE.md §22) — коллегиальное решение перетанцовки финала:
// судьи расставили ВСЮ tie-группу по местам, не выбрали N прошедших
// (в финале у всех уже есть место, нужно только разрешить порядок внутри
// группы) — отличается от recordTieBreakDecisionSchema обычных раундов.
export const recordFinalTieBreakDecisionSchema = z.object({
  orderedRegistrationIds: z.array(z.string().min(1)).min(2),
});
export type RecordFinalTieBreakDecisionInput = z.infer<typeof recordFinalTieBreakDecisionSchema>;

// --- Результаты и публикация (Этап 10, docs/00_DECISIONS.md) ---

export const unpublishReasonSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type UnpublishReasonInput = z.infer<typeof unpublishReasonSchema>;

export const resultStatusSchema = z.enum(["FINALIST", "ELIMINATED"]);

// RESULT-001: раньше проверялось только ELIMINATED => placement===null, но не
// обратное — FINALIST с placement:null проходил валидацию, хотя модель Result
// (calculateResults) никогда не создаёт такую комбинацию сама. Биусловие
// закрывает оба направления сразу.
export const correctResultSchema = z
  .object({
    status: resultStatusSchema,
    placement: z.coerce.number().int().positive().nullable(),
    reason: z.string().min(1).max(500),
  })
  .refine((v) => (v.status === "FINALIST") === (v.placement !== null), {
    message: "У финалиста обязано быть место, у выбывшего участника — не должно быть.",
    path: ["placement"],
  });
export type CorrectResultInput = z.infer<typeof correctResultSchema>;

// Обмен местами двух финалистов (results.ts, swapResultPlacements) — не
// requestId, конкретных resultId, обе строки берутся из тела запроса.
export const swapResultPlacementsSchema = z.object({
  resultIdA: z.string().min(1),
  resultIdB: z.string().min(1),
  reason: z.string().min(1).max(500),
});
export type SwapResultPlacementsInput = z.infer<typeof swapResultPlacementsSchema>;
