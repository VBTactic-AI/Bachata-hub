import { t } from "@/lib/i18n/dictionary";
import type { SchoolVerificationStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

// Значок "подтверждён" и "создан сообществом" — сознательно два визуально
// разных бейджа (разный цвет и текст), чтобы степень доверия к карточке
// нельзя было перепутать (требование ТЗ).
export function VerificationBadge({ status }: { status: SchoolVerificationStatus }) {
  if (status === "VERIFIED") {
    return <Badge variant="verified">✓ {t.school.verifiedBadge}</Badge>;
  }
  return <Badge variant="community">{t.school.communityBadge}</Badge>;
}
