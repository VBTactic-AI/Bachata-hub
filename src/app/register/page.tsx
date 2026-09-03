import { t } from "@/lib/i18n/dictionary";
import { prisma } from "@/lib/prisma";
import { RegisterForm } from "@/components/RegisterForm";

export default async function RegisterPage() {
  const cities = await prisma.city.findMany({
    where: { isActive: true },
    orderBy: { nameRu: "asc" },
  });

  return (
    <div className="stack max-w-[480px]">
      <h1 className="page-title">{t.auth.registerTitle}</h1>
      <RegisterForm cities={cities} />
    </div>
  );
}
