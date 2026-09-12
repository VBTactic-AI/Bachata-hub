import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { getAuthClaims } from "@/lib/auth";
import { siteRoleRequiresMfa } from "./policy";

// Аналог MfaRequiredError/requirePermission() (src/server/rbac/authorize.ts)
// для роутов слоя 1, которые проверяют isAdmin()/isModerator() напрямую и
// НЕ проходят через requirePermission() движка соревнований
// (docs/00_DECISIONS.md, D2 — это независимая система прав). Возвращает
// NextResponse вместо throw — под стиль этих конкретных роутов (они не
// оборачивают вызов в respondToDomainError). null — можно продолжать.
export async function mfaGateForSiteRole(user: Pick<User, "role">): Promise<NextResponse | null> {
  if (!siteRoleRequiresMfa(user.role)) return null;

  const claims = await getAuthClaims();
  if (claims?.aal !== "aal2") {
    return NextResponse.json(
      { error: "Для этого действия требуется подтверждение двухфакторной аутентификации (MFA).", code: "mfa_required" },
      { status: 403 }
    );
  }
  return null;
}
