import { t } from "@/lib/i18n/dictionary";
import type { SchoolVerificationStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

// Значок "подтверждён" и "создан сообществом" — сознательно два визуально
// разных бейджа (разный цвет и текст), чтобы степень доверия к карточке
// нельзя было перепутать (требование ТЗ). Используется только на /schools
// (тёмная тема) — цвета переопределены под ночную палитру прямо здесь.
export function VerificationBadge({ status }: { status: SchoolVerificationStatus }) {
  if (status === "VERIFIED") {
    return (
      <Badge variant="verified" className="bg-night-success/15 text-night-success">
        ✓ {t.school.verifiedBadge}
      </Badge>
    );
  }
  return (
    <Badge variant="community" className="bg-night-card2 text-night-pink">
      {t.school.communityBadge}
    </Badge>
  );
}
