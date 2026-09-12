// Создаёт (или чинит связку для уже существующего) единственного рабочего
// SUPER_ADMIN в новой схеме аутентификации — Supabase Auth + public.User +
// явная строка UserRoleAssignment(SUPER_ADMIN). Не полагается ТОЛЬКО на
// мост UserRole.ADMIN -> SUPER_ADMIN (docs/00_DECISIONS.md, D2) — этот
// bootstrap-аккаунт получает обе вещи сразу, чтобы источник истины для
// движковых прав был явным (см. итоговый план миграции, п.6).
//
// Идемпотентно: повторный запуск с тем же email обновит существующую запись,
// а не создаст дубликат — safe для повторного использования, если что-то
// прервалось на середине.
//
// Пароль/e-mail — ТОЛЬКО из переменных окружения, никогда не хардкодить
// (задача §6/Definition of Done — секреты не в git):
//   BOOTSTRAP_SUPER_ADMIN_EMAIL
//   BOOTSTRAP_SUPER_ADMIN_PASSWORD  (минимум 12 символов — Supabase Auth
//     сам отклонит слишком короткий)
//
// Запуск: BOOTSTRAP_SUPER_ADMIN_EMAIL=... BOOTSTRAP_SUPER_ADMIN_PASSWORD=... \
//   npx tsx prisma/bootstrap-super-admin.ts
//
// После первого входа под этим аккаунтом MFA будет ОБЯЗАТЕЛЬНА немедленно
// (SUPER_ADMIN — src/server/mfa/policy.ts) — приложение само отправит на
// /mfa/setup при первой попытке зайти в админку.
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!email || !password) {
    throw new Error("Задайте BOOTSTRAP_SUPER_ADMIN_EMAIL и BOOTSTRAP_SUPER_ADMIN_PASSWORD в окружении.");
  }
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Задайте NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (см. .env).");
  }

  // service_role — только здесь, в серверном одноразовом скрипте; никогда не
  // в браузер и не в обычный рантайм приложения.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Ищу существующего пользователя auth.users с email ${email}...`);
  // Admin API не даёт "createUser или получить существующего" одним вызовом —
  // сначала пробуем создать, и если email уже занят, ищем среди
  // существующих через listUsers (постранично, но для одного email обычно
  // хватает первой страницы; при большом числе пользователей это разовый
  // bootstrap-скрипт, не хот-путь).
  let authUserId: string;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) {
    if (!created.error.message.toLowerCase().includes("already")) {
      throw created.error;
    }
    console.log("Пользователь в auth.users уже существует — ищу его id...");
    let page = 1;
    let found: string | null = null;
    while (!found) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      found = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
      if (found || data.users.length < 200) break;
      page += 1;
    }
    if (!found) throw new Error(`Не удалось найти существующего auth.users с email ${email}.`);
    authUserId = found;
  } else {
    if (!created.data.user) throw new Error("Supabase не вернул созданного пользователя.");
    authUserId = created.data.user.id;
  }

  console.log(`auth.users.id = ${authUserId}. Связываю с public.User...`);

  const superAdminRole = await prisma.role.findFirst({ where: { code: "SUPER_ADMIN" } });
  if (!superAdminRole) {
    throw new Error('Роль SUPER_ADMIN не найдена — сначала выполните "npm run seed:layer3".');
  }

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, supabaseUserId: authUserId, role: "ADMIN" },
    update: { supabaseUserId: authUserId, role: "ADMIN", isBlocked: false },
  });

  await prisma.userRoleAssignment.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    create: { userId: user.id, roleId: superAdminRole.id },
    update: {},
  });

  console.log(`Готово. ${email} — public.User.id=${user.id}, role=ADMIN, UserRoleAssignment=SUPER_ADMIN.`);
  console.log("При первом входе через /login (Email) система сразу потребует настроить MFA.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
