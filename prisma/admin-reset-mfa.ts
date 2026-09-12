// Административная процедура восстановления (задача §5/§7): пользователь
// потерял ОБА фактора MFA (устройство утеряно/сброшено) и не может пройти
// challenge/verify сам — self-service unenroll() тоже недоступен, потому что
// Supabase Auth требует уже иметь aal2, чтобы снять фактор (см. план
// миграции), а у заблокированного пользователя его как раз и нет. Recovery-
// кодов Supabase Auth не предоставляет (проверено по документации) — их не
// используем, вместо них единственный поддерживаемый путь — Admin API
// (service_role, только офлайн-скрипт, никогда не HTTP-роут в приложении).
//
// Снимает ВСЕ TOTP-факторы указанного пользователя — после этого при
// следующем входе роль, требующая MFA (SUPER_ADMIN/EVENT_ADMIN/ADMIN-мост),
// сама заставит пройти /mfa/setup заново (mfaRequired && !mfaSatisfied,
// enroll с нуля — старый секрет уже недействителен вместе со снятым фактором).
//
// Запуск (только человеком с доступом к service_role, не автоматизацией):
//   SUPABASE_SERVICE_ROLE_KEY=... npx tsx prisma/admin-reset-mfa.ts \
//     --email=user@example.com \
//     --operator-email=super-admin@example.com \
//     --reason="Утеряно устройство, подтверждено голосом"
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const operatorEmail = arg("operator-email")?.trim().toLowerCase();
  const reason = arg("reason");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!email || !operatorEmail || !reason) {
    throw new Error("Нужны --email=, --operator-email= (кто санкционировал) и --reason= (обязательная причина).");
  }
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Задайте NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.");
  }

  const target = await prisma.user.findUnique({ where: { email } });
  if (!target || !target.supabaseUserId) {
    throw new Error(`Пользователь с email ${email} не найден или не привязан к Supabase Auth.`);
  }
  const operator = await prisma.user.findUnique({ where: { email: operatorEmail } });
  if (!operator) {
    throw new Error(`Оператор с email ${operatorEmail} не найден в public.User — audit-запись требует реального actorId.`);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: target.supabaseUserId });
  if (listError) throw listError;
  const totpFactors = factors?.factors?.filter((f) => f.factor_type === "totp") ?? [];

  if (totpFactors.length === 0) {
    console.log(`У ${email} нет ни одного TOTP-фактора — снимать нечего.`);
    return;
  }

  for (const factor of totpFactors) {
    const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: target.supabaseUserId,
    });
    if (deleteError) throw deleteError;
    console.log(`Снят фактор ${factor.id} (${factor.friendly_name ?? "без имени"}).`);
  }

  // CLAUDE.md §28: критическое действие безопасности — обязательный audit.
  // actorId — оператор, entityId — public.User.id ЦЕЛИ (не оператора).
  await prisma.auditLog.create({
    data: {
      actorId: operator.id,
      action: "mfa.admin_reset",
      entityType: "User",
      entityId: target.id,
      before: { totpFactorCount: totpFactors.length },
      after: { totpFactorCount: 0 },
      reason,
    },
  });

  console.log(`Готово. ${email} снова должен будет настроить MFA с нуля при следующем входе.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
