// Слой 3 — движок соревнований Jack & Jill: каталог прав и ролей.
//
// Идемпотентно (upsert по code) — можно запускать повторно на боевой базе,
// не плодит дублей и не трогает существующие layer-1 данные (User, Event,
// School, ...). Не создаёт CompetitionMember и не назначает роли реальным
// пользователям — только сам каталог Permission/Role/RolePermission плюс
// один демо-аккаунт для проверки SUPER_ADMIN (по аналогии с demo-аккаунтами
// в prisma/seed.ts).
//
// Формат кода прав — "domain:action" (см. docs/00_DECISIONS.md: CLAUDE.md
// §30 использует ":", docs/03 использует "." — по приоритету CLAUDE.md
// выбран ":").
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Demo12345!";

const PERMISSIONS = [
  ["competition:create", "Создание соревнования"],
  ["competition:update", "Редактирование соревнования"],
  ["competition:delete", "Удаление соревнования"],
  ["competition:publish", "Публикация соревнования/результатов"],
  ["competition:settings_update", "Изменение настроек соревнования"],
  ["competition:members_manage", "Назначение ролей участникам команды соревнования"],

  ["registration:view", "Просмотр регистраций"],
  ["registration:create", "Регистрация на соревнование"],
  ["registration:update_own", "Редактирование своей регистрации"],
  ["registration:manage", "Управление регистрациями участников"],
  ["registration:role_override_review", "Подтверждение роли, отличной от пола участника"],
  ["registration:change_division", "Изменение категории (дивизиона) участника после регистрации"],

  ["division_category:manage", "Управление общим справочником категорий соревнований"],
  ["round_stage:manage", "Управление общим справочником этапов отбора"],

  ["checkin:manage", "Проведение check-in участников"],
  ["checkin:self", "Самостоятельный check-in"],

  ["draw:generate", "Генерация жеребьёвки"],
  ["draw:reroll", "Reroll жеребьёвки"],
  ["draw:lock", "Блокировка жеребьёвки"],
  ["draw:override", "Ручное переопределение жеребьёвки"],

  ["round:create", "Создание раунда"],
  ["round:start", "Старт раунда"],
  ["round:pause", "Пауза раунда"],
  ["round:end", "Завершение раунда"],
  ["timer:control", "Управление таймером"],
  ["rotation:control", "Управление ротацией партнёров"],

  ["judge:assign", "Назначение судьи на дивизион (роль LEADER/FOLLOWER)"],
  ["score:submit", "Отправка оценки судьёй"],
  ["score:correct", "Исправление оценки (correction workflow)"],
  ["score:view_own", "Просмотр судьёй своих оценок"],
  ["score:view_all", "Просмотр всех оценок"],
  ["judge:ranking_submit", "Отправка ranking (Relative Placement)"],
  ["judge:conflict_declare", "Декларация конфликта интересов судьи"],

  ["result:calculate", "Расчёт результатов"],
  ["result:review", "Проверка результатов перед публикацией"],
  ["result:publish", "Публикация результатов"],
  ["result:unpublish", "Отмена публикации результатов"],
  ["tie_break:decide", "Внесение решения перетанцовки (кто прошёл дальше)"],

  ["final:configure", "Настройка финала (формат, критерии оценки)"],
  ["final:manage", "Управление ходом финала (старт, пары, стадии)"],

  ["penalty:create", "Назначение штрафа/нарушения"],
  ["disqualification:create", "Дисквалификация участника"],

  ["audit:view", "Просмотр audit log"],
] as const;

// scope: GLOBAL — роль назначается пользователю целиком на движок
// (UserRoleAssignment); COMPETITION — назначается точечно на конкретное
// соревнование (CompetitionMember).
const ROLES = [
  { code: "SUPER_ADMIN", name: "Супер-администратор", scope: "GLOBAL" as const },
  { code: "EVENT_ADMIN", name: "Администратор соревнования", scope: "COMPETITION" as const },
  { code: "HEAD_JUDGE", name: "Главный судья", scope: "COMPETITION" as const },
  { code: "JUDGE", name: "Судья", scope: "COMPETITION" as const },
  { code: "SCORER", name: "Скорер", scope: "COMPETITION" as const },
  { code: "DJ", name: "Диджей", scope: "COMPETITION" as const },
  { code: "MC", name: "Ведущий", scope: "COMPETITION" as const },
  { code: "COMPETITOR", name: "Участник", scope: "COMPETITION" as const },
];

// Матрица роль -> права по docs/03_ENGINE_ALGORITHMS_AND_RBAC.md §4 и
// CLAUDE.md §30. SUPER_ADMIN получает все права ниже отдельным циклом.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  EVENT_ADMIN: [
    "competition:update",
    "competition:publish",
    "competition:settings_update",
    "competition:members_manage",
    "registration:view",
    "registration:manage",
    "registration:role_override_review",
    "registration:change_division",
    "checkin:manage",
    "draw:generate",
    "draw:reroll",
    "draw:lock",
    "round:create",
    "round:start",
    "round:pause",
    "round:end",
    "timer:control",
    "rotation:control",
    "judge:assign",
    "score:view_all",
    "result:calculate",
    "result:review",
    "result:publish",
    "result:unpublish",
    "tie_break:decide",
    "final:configure",
    "final:manage",
    "penalty:create",
    "disqualification:create",
    "audit:view",
  ],
  HEAD_JUDGE: [
    "competition:publish",
    "registration:view",
    "registration:role_override_review",
    "checkin:manage",
    "draw:generate",
    "draw:reroll",
    "draw:lock",
    "draw:override",
    "round:start",
    "timer:control",
    "rotation:control",
    "judge:assign",
    "score:correct",
    "score:view_all",
    "judge:conflict_declare",
    "result:calculate",
    "result:review",
    "result:publish",
    "result:unpublish",
    "tie_break:decide",
    "final:configure",
    "final:manage",
    "penalty:create",
    "disqualification:create",
    "audit:view",
  ],
  JUDGE: ["score:submit", "score:view_own", "judge:ranking_submit", "judge:conflict_declare"],
  SCORER: ["score:view_all", "result:calculate"],
  DJ: ["timer:control", "rotation:control"],
  MC: [],
  COMPETITOR: ["registration:create", "registration:update_own", "checkin:self"],
};

async function main() {
  console.log("Слой 3: сидирование прав и ролей...");

  const permissionByCode = new Map<string, { id: string }>();
  for (const [code, name] of PERMISSIONS) {
    const p = await prisma.permission.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
    permissionByCode.set(code, p);
  }

  const roleByCode = new Map<string, { id: string }>();
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, scope: r.scope },
      create: r,
    });
    roleByCode.set(r.code, role);
  }

  // SUPER_ADMIN получает все существующие права.
  const superAdmin = roleByCode.get("SUPER_ADMIN")!;
  for (const [code] of PERMISSIONS) {
    const permission = permissionByCode.get(code)!;
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdmin.id, permissionId: permission.id } },
      update: {},
      create: { roleId: superAdmin.id, permissionId: permission.id },
    });
  }

  for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = roleByCode.get(roleCode)!;
    for (const code of codes) {
      const permission = permissionByCode.get(code);
      if (!permission) throw new Error(`Неизвестное право "${code}" для роли ${roleCode}`);
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  // Стартовый общий справочник категорий соревнований — редактируется
  // только через division_category:manage (SUPER_ADMIN), см. AddDivisionForm.
  const DIVISION_CATEGORIES: [string, number][] = [
    ["Дебютанты", 1],
    ["Начинающие", 2],
    ["Любители", 3],
    ["Продвинутые", 4],
    ["Профи", 5],
  ];
  for (const [name, order] of DIVISION_CATEGORIES) {
    await prisma.divisionCategory.upsert({
      where: { name },
      update: { order },
      create: { name, order },
    });
  }

  // Демо-аккаунт для проверки SUPER_ADMIN (пароль — как у остальных demo
  // аккаунтов в prisma/seed.ts). Использует layer-1 User напрямую — своей
  // модели пользователя у слоя 3 нет (docs/00_DECISIONS.md, D2).
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const demoAdmin = await prisma.user.upsert({
    where: { email: "layer3-admin@bachata.by" },
    update: {},
    create: { email: "layer3-admin@bachata.by", passwordHash, role: "ADMIN" },
  });
  await prisma.userRoleAssignment.upsert({
    where: { userId_roleId: { userId: demoAdmin.id, roleId: superAdmin.id } },
    update: {},
    create: { userId: demoAdmin.id, roleId: superAdmin.id },
  });

  console.log(
    `Готово: ${PERMISSIONS.length} прав, ${ROLES.length} ролей, демо SUPER_ADMIN — layer3-admin@bachata.by / ${DEMO_PASSWORD}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
