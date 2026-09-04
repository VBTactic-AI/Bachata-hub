// Демо-набор судей для проверки Судейства (Этап 7): 10 аккаунтов, 5 мужского
// пола и 5 женского. Судья в этом движке — обычный User (JudgeAssignment
// ссылается на User напрямую, отдельной модели Judge нет, см.
// src/server/judging/judge-assignment.ts) — пол хранить негде, кроме как на
// Dancer, поэтому вместе с User заводится и Dancer-профиль (displayName +
// gender), по аналогии с тем, как registerSelf/registerByAdmin создают
// Dancer на лету (docs/00_DECISIONS.md, D9). Ничего не назначает на
// конкретное соревнование/дивизион — это отдельное действие
// (assignJudge/setDivisionJudges) через email уже после создания.
//
// Идемпотентно (upsert по email) — можно запускать повторно.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Demo12345!";

const JUDGES: { email: string; displayName: string; gender: "MALE" | "FEMALE" }[] = [
  { email: "judge-m1@bachata.by", displayName: "Алексей Волков", gender: "MALE" },
  { email: "judge-m2@bachata.by", displayName: "Дмитрий Соколов", gender: "MALE" },
  { email: "judge-m3@bachata.by", displayName: "Игорь Мельник", gender: "MALE" },
  { email: "judge-m4@bachata.by", displayName: "Сергей Романов", gender: "MALE" },
  { email: "judge-m5@bachata.by", displayName: "Максим Ковалёв", gender: "MALE" },
  { email: "judge-f1@bachata.by", displayName: "Ольга Волкова", gender: "FEMALE" },
  { email: "judge-f2@bachata.by", displayName: "Наталья Соколова", gender: "FEMALE" },
  { email: "judge-f3@bachata.by", displayName: "Ирина Мельник", gender: "FEMALE" },
  { email: "judge-f4@bachata.by", displayName: "Елена Романова", gender: "FEMALE" },
  { email: "judge-f5@bachata.by", displayName: "Анна Ковалёва", gender: "FEMALE" },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const j of JUDGES) {
    const user = await prisma.user.upsert({
      where: { email: j.email },
      update: {},
      create: { email: j.email, passwordHash, role: "DANCER" },
    });
    await prisma.dancer.upsert({
      where: { userId: user.id },
      update: { displayName: j.displayName, gender: j.gender },
      create: { userId: user.id, displayName: j.displayName, gender: j.gender },
    });
  }

  console.log(
    `Готово: ${JUDGES.length} судей (5 мужского, 5 женского пола), пароль у всех — ${DEMO_PASSWORD}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
