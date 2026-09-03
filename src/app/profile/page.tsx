import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDancerByUserId } from "@/lib/dancer";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { DancerProfileView } from "@/components/DancerProfileView";
import { ProfileEditForm } from "@/components/ProfileEditForm";
import { AchievementForm } from "@/components/AchievementForm";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [dancer, cities] = await Promise.all([
    getDancerByUserId(user.id),
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
  ]);

  // У служебных аккаунтов (админ/модератор) профиля танцора нет — это не
  // ошибка, а осознанное решение (см. seed.ts), но молча кидать на главную
  // без объяснения — плохой UX. Показываем понятное сообщение.
  if (!dancer) {
    return (
      <div className="stack">
        <h1 className="page-title">{t.dancer.publicProfileOf}</h1>
        <p className="hint-text">{t.dancer.noProfileForThisAccount}</p>
      </div>
    );
  }

  // Достижение имеет смысл привязывать к событию, на котором танцор
  // отмечал "был" — предлагаем такие события в форме добавления.
  const attendedEvents = dancer.attendances
    .filter((a) => a.status === "WENT")
    .map((a) => a.event);

  return (
    <div className="stack">
      <div className="flex justify-end gap-2">
        <ProfileEditForm dancer={dancer} cities={cities} />
      </div>
      <DancerProfileView dancer={dancer} editable />
      <div>
        <AchievementForm attendedEvents={attendedEvents} />
      </div>
      <p className="hint-text">
        {t.auth.email}: {user.email}
      </p>
    </div>
  );
}
