"use client";

import type { ReactNode } from "react";
import { t } from "@/lib/i18n/dictionary";
import { Tag } from "@/components/ui/tag";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DetailModal } from "./DetailModal";

export type ModerationClaimDetail = {
  id: string;
  schoolName: string;
  schoolCityName: string;
  schoolDescription: string | null;
  schoolDirections: string[];
  schoolLevels: string[];
  schoolContactPhone: string | null;
  schoolContactEmail: string | null;
  schoolVerificationStatus: "COMMUNITY" | "VERIFIED";
  schoolIsActive: boolean;
  claimantEmail: string;
  proofNote: string | null;
  createdAt: string; // ISO
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="m-0 text-[10.5px] font-bold uppercase tracking-wide text-admin-disabled">{label}</p>
      <div className="mt-0.5 text-sm text-night-text">{children}</div>
    </div>
  );
}

// Полная карточка заявки "я представитель школы" (клик по строке в
// /admin/moderation/schools, 2026-09-12, по прямому запросу пользователя) —
// профиль самой школы целиком (не только то, что помещалось в строку
// таблицы), чтобы решение "одобрить/отклонить" принималось по полной
// картине, а не по одному обрезанному proofNote.
export function SchoolClaimDetailModal({
  claim,
  actions,
  trigger,
}: {
  claim: ModerationClaimDetail;
  actions: ReactNode;
  trigger: ReactNode;
}) {
  return (
    <DetailModal trigger={trigger} title={claim.schoolName}>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={claim.schoolVerificationStatus === "VERIFIED" ? t.school.verifiedBadge : t.school.communityBadge}
            variant={claim.schoolVerificationStatus === "VERIFIED" ? "success" : "neutral"}
          />
          <StatusBadge
            label={claim.schoolIsActive ? t.adminDashboard.schoolActive : t.adminDashboard.schoolHidden}
            variant={claim.schoolIsActive ? "success" : "warning"}
          />
        </div>

        <Field label={t.event.city}>{claim.schoolCityName}</Field>

        {claim.schoolDescription && <Field label={t.event.description}>{claim.schoolDescription}</Field>}

        {claim.schoolDirections.length > 0 && (
          <Field label="Направления">
            {claim.schoolDirections.map((d) => (
              <Tag key={d} className="border border-admin-border bg-admin-card2 text-night-text">
                {d}
              </Tag>
            ))}
          </Field>
        )}

        {claim.schoolLevels.length > 0 && (
          <Field label={t.event.level}>
            {claim.schoolLevels.map((lvl) => (
              <Tag key={lvl} className="border border-admin-border bg-admin-card2 text-night-text">
                {t.event.levels[lvl as keyof typeof t.event.levels] ?? lvl}
              </Tag>
            ))}
          </Field>
        )}

        {(claim.schoolContactPhone || claim.schoolContactEmail) && (
          <Field label="Контакты школы">
            {[claim.schoolContactPhone, claim.schoolContactEmail].filter(Boolean).join(" · ")}
          </Field>
        )}

        <div className="border-t border-admin-border pt-3.5">
          <Field label={t.moderation.claimant}>{claim.claimantEmail}</Field>
        </div>

        <Field label={t.moderation.claimNote}>{claim.proofNote ?? "—"}</Field>

        <Field label={t.moderation.submittedAt}>{new Date(claim.createdAt).toLocaleString("ru-RU")}</Field>

        <div className="border-t border-admin-border pt-3.5">{actions}</div>
      </div>
    </DetailModal>
  );
}
