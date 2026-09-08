"use client";

import { useMemo, useState } from "react";
import { Input, Select } from "@/components/ui/field";
import { ChangeDivisionControl } from "@/components/admin/ChangeDivisionControl";
import { RoleOverrideReview } from "@/components/admin/RoleOverrideReview";
import { CheckInButton } from "@/components/admin/CheckInButton";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatCard } from "@/components/admin/StatCard";

export type ParticipantRow = {
  id: string;
  displayName: string;
  divisionId: string;
  categoryName: string;
  roleLabel: string;
  status: string;
  statusLabel: string;
  bibNumber: string | null;
  checkedIn: boolean;
  noShow: boolean;
  roleOverrideStatus: "PENDING" | "REJECTED" | null;
  requestedRoleLabel: string | null;
};

const FIELD_CLASS =
  "max-w-[220px] border-night-border bg-night-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

function RowActions({
  r,
  categories,
  canChangeDivision,
  canReviewRoleOverride,
  canCheckIn,
}: {
  r: ParticipantRow;
  categories: { id: string; categoryName: string }[];
  canChangeDivision: boolean;
  canReviewRoleOverride: boolean;
  canCheckIn: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canChangeDivision && <ChangeDivisionControl registrationId={r.id} currentDivisionId={r.divisionId} divisions={categories} />}
      {r.roleOverrideStatus === "PENDING" && canReviewRoleOverride && <RoleOverrideReview registrationId={r.id} />}
      {canCheckIn && r.status === "REGISTERED" && !r.checkedIn && <CheckInButton registrationId={r.id} />}
    </div>
  );
}

function CheckInStatus({ r }: { r: ParticipantRow }) {
  if (r.checkedIn) return <StatusBadge label="Check-in" variant="success" />;
  if (r.noShow) return <StatusBadge label="Не явился" variant="danger" />;
  return <StatusBadge label="Ожидает" variant="neutral" />;
}

// Вкладка "Участники" (redesign, 2026-09-08) — вся фильтрация клиентская, по
// уже загруженному на сервере списку (никаких новых запросов): поиск по
// имени, категория, check-in, статус. Каждое действие (смена категории,
// подтверждение роли, check-in) — тот же существующий клиентский компонент,
// что и раньше, просто внутри компактной строки таблицы вместо большой Card.
export function ParticipantsPanel({
  registrations,
  categories,
  canChangeDivision,
  canReviewRoleOverride,
  canCheckIn,
}: {
  registrations: ParticipantRow[];
  categories: { id: string; categoryName: string }[];
  canChangeDivision: boolean;
  canReviewRoleOverride: boolean;
  canCheckIn: boolean;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [checkinFilter, setCheckinFilter] = useState<"" | "yes" | "no">("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return registrations.filter((r) => {
      if (q && !r.displayName.toLowerCase().includes(q)) return false;
      if (categoryFilter && r.divisionId !== categoryFilter) return false;
      if (checkinFilter === "yes" && !r.checkedIn) return false;
      if (checkinFilter === "no" && r.checkedIn) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    });
  }, [registrations, search, categoryFilter, checkinFilter, statusFilter]);

  const checkedInCount = registrations.filter((r) => r.checkedIn).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Всего участников" value={registrations.length} />
        <StatCard label="Прошли check-in" value={checkedInCount} accent />
        <StatCard label="Не прошли check-in" value={registrations.length - checkedInCount} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-app border border-night-border bg-night-card/50 p-3">
        <Input
          placeholder="Поиск по имени…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={FIELD_CLASS}
        />
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={FIELD_CLASS}>
          <option value="">Все категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.categoryName}
            </option>
          ))}
        </Select>
        <Select value={checkinFilter} onChange={(e) => setCheckinFilter(e.target.value as "" | "yes" | "no")} className={FIELD_CLASS} style={{ maxWidth: 170 }}>
          <option value="">Check-in: все</option>
          <option value="yes">Прошли</option>
          <option value="no">Не прошли</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={FIELD_CLASS} style={{ maxWidth: 200 }}>
          <option value="">Статус: все</option>
          <option value="REGISTERED">Зарегистрирован</option>
          <option value="SCRATCHED">Снялся</option>
          <option value="DISQUALIFIED">Дисквалифицирован</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-night-muted">Ничего не найдено.</p>
      ) : (
        <>
          {/* Desktop/tablet — компактная таблица. */}
          <div className="hidden overflow-x-auto rounded-app border border-night-border sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-night-card2 text-xs font-semibold uppercase tracking-wide text-night-disabled">
                <tr>
                  <th className="px-3 py-2 font-semibold">№</th>
                  <th className="px-3 py-2 font-semibold">Участник</th>
                  <th className="px-3 py-2 font-semibold">Категория</th>
                  <th className="px-3 py-2 font-semibold">Роль</th>
                  <th className="px-3 py-2 font-semibold">Check-in</th>
                  <th className="px-3 py-2 font-semibold">Статус</th>
                  <th className="px-3 py-2 text-right font-semibold">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-night-border hover:bg-night-card2/50">
                    <td className="px-3 py-2 align-top text-night-muted">{r.bibNumber ?? "—"}</td>
                    <td className="px-3 py-2 align-top font-medium text-night-text">
                      {r.displayName}
                      {r.roleOverrideStatus === "PENDING" && (
                        <p className="m-0 mt-0.5 text-xs font-normal text-night-pink">Просит роль «{r.requestedRoleLabel}»</p>
                      )}
                      {r.roleOverrideStatus === "REJECTED" && (
                        <p className="m-0 mt-0.5 text-xs font-normal text-night-muted">Запрос роли отклонён</p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-night-muted">{r.categoryName}</td>
                    <td className="px-3 py-2 align-top text-night-muted">{r.roleLabel}</td>
                    <td className="px-3 py-2 align-top">
                      <CheckInStatus r={r} />
                    </td>
                    <td className="px-3 py-2 align-top text-night-muted">{r.statusLabel}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex justify-end">
                        <RowActions r={r} categories={categories} canChangeDivision={canChangeDivision} canReviewRoleOverride={canReviewRoleOverride} canCheckIn={canCheckIn} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile — карточки вместо широкой таблицы (задача redesign §16:
              "большие таблицы → cards"), те же данные и действия. */}
          <div className="flex flex-col gap-2 sm:hidden">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-app-sm border border-night-border bg-night-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="m-0 font-medium text-night-text">
                      {r.bibNumber ? `№${r.bibNumber} · ` : ""}
                      {r.displayName}
                    </p>
                    <p className="m-0 mt-0.5 text-xs text-night-muted">
                      {r.categoryName} · {r.roleLabel} · {r.statusLabel}
                    </p>
                    {r.roleOverrideStatus === "PENDING" && (
                      <p className="m-0 mt-0.5 text-xs text-night-pink">Просит роль «{r.requestedRoleLabel}»</p>
                    )}
                    {r.roleOverrideStatus === "REJECTED" && <p className="m-0 mt-0.5 text-xs text-night-muted">Запрос роли отклонён</p>}
                  </div>
                  <CheckInStatus r={r} />
                </div>
                <div className="mt-2">
                  <RowActions r={r} categories={categories} canChangeDivision={canChangeDivision} canReviewRoleOverride={canReviewRoleOverride} canCheckIn={canCheckIn} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
