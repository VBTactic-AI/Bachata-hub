"use client";

import { useMemo, useState } from "react";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ChangeDivisionControl } from "@/components/admin/ChangeDivisionControl";
import { RoleOverrideReview } from "@/components/admin/RoleOverrideReview";
import { CheckInToggle } from "@/components/admin/CheckInToggle";
import { PaymentToggle } from "@/components/admin/PaymentToggle";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatCard } from "@/components/admin/StatCard";
import { PeopleIcon, CheckCircleIcon, CardIcon, AlertIcon, KebabIcon } from "@/components/admin/icons";

export type ParticipantRow = {
  id: string;
  displayName: string;
  divisionId: string;
  categoryName: string;
  roleLabel: string;
  status: string;
  bibNumber: string | null;
  checkedIn: boolean;
  isPaid: boolean;
  noShow: boolean;
  roleOverrideStatus: "PENDING" | "REJECTED" | null;
  requestedRoleLabel: string | null;
};

const FIELD_CLASS =
  "max-w-[220px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

function pct(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

// Вкладка "Участники" (redesign, 2026-09-09) — фильтрация клиентская, по
// уже загруженному на сервере списку (никаких новых запросов): поиск по
// имени, категория, оплата, check-in. Сортировка по имени всегда (по
// умолчанию, а не только "изначально" — второй сортировки пока не просили).
// Столбец/фильтр "Статус" (REGISTERED/SCRATCHED/DISQUALIFIED) убран из
// отображения по прямому запросу пользователя — сами данные не удалены,
// noShow по-прежнему считается из status на сервере (page.tsx), просто не
// выводится отдельной колонкой.
export function ParticipantsPanel({
  registrations,
  categories,
  canChangeDivision,
  canReviewRoleOverride,
  canCheckIn,
  canManagePayment,
}: {
  registrations: ParticipantRow[];
  categories: { id: string; categoryName: string }[];
  canChangeDivision: boolean;
  canReviewRoleOverride: boolean;
  canCheckIn: boolean;
  canManagePayment: boolean;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"" | "yes" | "no">("");
  const [checkinFilter, setCheckinFilter] = useState<"" | "yes" | "no">("");

  function resetFilters() {
    setSearch("");
    setCategoryFilter("");
    setPaymentFilter("");
    setCheckinFilter("");
  }

  const sorted = useMemo(
    () => [...registrations].sort((a, b) => a.displayName.localeCompare(b.displayName, "ru")),
    [registrations]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((r) => {
      if (q && !r.displayName.toLowerCase().includes(q)) return false;
      if (categoryFilter && r.divisionId !== categoryFilter) return false;
      if (paymentFilter === "yes" && !r.isPaid) return false;
      if (paymentFilter === "no" && r.isPaid) return false;
      if (checkinFilter === "yes" && !r.checkedIn) return false;
      if (checkinFilter === "no" && r.checkedIn) return false;
      return true;
    });
  }, [sorted, search, categoryFilter, paymentFilter, checkinFilter]);

  const checkedInCount = registrations.filter((r) => r.checkedIn).length;
  const paidCount = registrations.filter((r) => r.isPaid).length;
  const total = registrations.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Всего участников" value={total} icon={<PeopleIcon />} tone="primary" />
        <StatCard label="Прошли check-in" value={checkedInCount} icon={<CheckCircleIcon />} tone="success" percent={pct(checkedInCount, total)} />
        <StatCard
          label="Оплачено"
          value={paidCount}
          icon={<CardIcon />}
          tone="primary"
          percent={pct(paidCount, total)}
          active={paymentFilter === "yes"}
          onClick={() => setPaymentFilter((v) => (v === "yes" ? "" : "yes"))}
        />
        <StatCard
          label="Не оплачено"
          value={total - paidCount}
          icon={<AlertIcon />}
          tone="danger"
          percent={pct(total - paidCount, total)}
          active={paymentFilter === "no"}
          onClick={() => setPaymentFilter((v) => (v === "no" ? "" : "no"))}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-app border border-admin-border bg-admin-card/50 p-3">
        <Input
          placeholder="Поиск по имени, ID или партнёру…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={FIELD_CLASS}
        />
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          Категория
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={FIELD_CLASS} style={{ maxWidth: 180 }}>
            <option value="">Все категории</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.categoryName}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          Статус оплаты
          <Select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as "" | "yes" | "no")} className={FIELD_CLASS} style={{ maxWidth: 170 }}>
            <option value="">Все</option>
            <option value="yes">Оплачено</option>
            <option value="no">Не оплачено</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          Check-in
          <Select value={checkinFilter} onChange={(e) => setCheckinFilter(e.target.value as "" | "yes" | "no")} className={FIELD_CLASS} style={{ maxWidth: 150 }}>
            <option value="">Все</option>
            <option value="yes">Прошли</option>
            <option value="no">Не прошли</option>
          </Select>
        </label>
        <Button type="button" size="sm" variant="adminOutline" onClick={resetFilters}>
          Сбросить
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-admin-muted">Ничего не найдено.</p>
      ) : (
        <>
          {/* Desktop/tablet — компактная таблица. */}
          <div className="hidden overflow-x-auto rounded-app border border-admin-border sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
                <tr>
                  <th className="px-3 py-2 font-semibold">№</th>
                  <th className="px-3 py-2 font-semibold">Участник</th>
                  <th className="px-3 py-2 font-semibold">Категория</th>
                  <th className="px-3 py-2 font-semibold">Роль</th>
                  <th className="px-3 py-2 font-semibold">Сменить категорию</th>
                  <th className="px-3 py-2 font-semibold">Оплата</th>
                  <th className="px-3 py-2 font-semibold">Check-in</th>
                  <th className="px-3 py-2 text-right font-semibold">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} className="border-t border-admin-border hover:bg-admin-card2/50">
                    <td className="px-3 py-2 align-top text-admin-muted">{r.bibNumber ?? i + 1}</td>
                    <td className="px-3 py-2 align-top font-medium text-night-text">
                      {r.displayName}
                      {r.roleOverrideStatus === "PENDING" && (
                        <p className="m-0 mt-0.5 text-xs font-normal text-night-pink">Просит роль «{r.requestedRoleLabel}»</p>
                      )}
                      {r.roleOverrideStatus === "REJECTED" && (
                        <p className="m-0 mt-0.5 text-xs font-normal text-admin-muted">Запрос роли отклонён</p>
                      )}
                      {r.noShow && (
                        <p className="m-0 mt-0.5 text-xs font-normal">
                          <StatusBadge label="Не явился" variant="danger" />
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-admin-muted">{r.categoryName}</td>
                    <td className="px-3 py-2 align-top text-admin-muted">{r.roleLabel}</td>
                    <td className="px-3 py-2 align-top">
                      {canChangeDivision && (
                        <ChangeDivisionControl registrationId={r.id} currentDivisionId={r.divisionId} divisions={categories} />
                      )}
                      {r.roleOverrideStatus === "PENDING" && canReviewRoleOverride && (
                        <div className="mt-1">
                          <RoleOverrideReview registrationId={r.id} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {canManagePayment ? (
                        <PaymentToggle registrationId={r.id} isPaid={r.isPaid} />
                      ) : (
                        <StatusBadge label={r.isPaid ? "Оплачено" : "Не оплачено"} variant={r.isPaid ? "success" : "danger"} />
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {canCheckIn && r.status === "REGISTERED" ? (
                        <CheckInToggle registrationId={r.id} checkedIn={r.checkedIn} displayName={r.displayName} />
                      ) : (
                        <StatusBadge label={r.checkedIn ? "Да" : "Нет"} variant={r.checkedIn ? "success" : "neutral"} />
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled
                          title="Скоро"
                          aria-label="Дополнительные действия — пока недоступно"
                          className="cursor-not-allowed text-admin-disabled opacity-60"
                        >
                          <KebabIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile — карточки вместо широкой таблицы. */}
          <div className="flex flex-col gap-2 sm:hidden">
            {filtered.map((r, i) => (
              <div key={r.id} className="rounded-app-sm border border-admin-border bg-admin-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="m-0 font-medium text-night-text">
                      №{r.bibNumber ?? i + 1} · {r.displayName}
                    </p>
                    <p className="m-0 mt-0.5 text-xs text-admin-muted">
                      {r.categoryName} · {r.roleLabel}
                    </p>
                    {r.roleOverrideStatus === "PENDING" && (
                      <p className="m-0 mt-0.5 text-xs text-night-pink">Просит роль «{r.requestedRoleLabel}»</p>
                    )}
                    {r.noShow && (
                      <p className="m-0 mt-0.5">
                        <StatusBadge label="Не явился" variant="danger" />
                      </p>
                    )}
                  </div>
                  {canCheckIn && r.status === "REGISTERED" ? (
                    <CheckInToggle registrationId={r.id} checkedIn={r.checkedIn} displayName={r.displayName} />
                  ) : (
                    <StatusBadge label={r.checkedIn ? "Да" : "Нет"} variant={r.checkedIn ? "success" : "neutral"} />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {canManagePayment ? (
                    <PaymentToggle registrationId={r.id} isPaid={r.isPaid} />
                  ) : (
                    <StatusBadge label={r.isPaid ? "Оплачено" : "Не оплачено"} variant={r.isPaid ? "success" : "danger"} />
                  )}
                  {canChangeDivision && (
                    <ChangeDivisionControl registrationId={r.id} currentDivisionId={r.divisionId} divisions={categories} />
                  )}
                  {r.roleOverrideStatus === "PENDING" && canReviewRoleOverride && <RoleOverrideReview registrationId={r.id} />}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
