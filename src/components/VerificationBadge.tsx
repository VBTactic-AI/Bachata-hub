import { t } from "@/lib/i18n/dictionary";
import type { SchoolVerificationStatus } from "@prisma/client";

// Значок "подтверждён" и "создан сообществом" — сознательно два визуально
// разных бейджа (разный цвет и текст), чтобы степень доверия к карточке
// нельзя было перепутать (требование ТЗ).
export function VerificationBadge({ status }: { status: SchoolVerificationStatus }) {
  if (status === "VERIFIED") {
    return <span className="badge badge-verified">✓ {t.school.verifiedBadge}</span>;
  }
  return <span className="badge badge-community">{t.school.communityBadge}</span>;
}
