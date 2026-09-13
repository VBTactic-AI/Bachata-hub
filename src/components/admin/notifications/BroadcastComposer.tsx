"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SubscriptionType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";

const fieldClass = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

const SUBSCRIPTION_TYPE_LABELS: Record<SubscriptionType, string> = {
  EVENT: "Конкретное событие",
  SCHOOL: "Школа",
  CITY: "Город",
  COUNTRY: "Страна",
  EVENT_TYPE: "Тип события",
  INSTRUCTOR: "Преподаватель",
};

// Типы, для которых цель ищется по имени (может быть много записей), а не
// выбирается из короткого исчерпывающего списка.
const SEARCH_TYPES: SubscriptionType[] = ["SCHOOL", "EVENT", "INSTRUCTOR"];

type TargetOption = { targetId: string; label: string };
type Preview = { recipientCount: number; label: string };

// Control Center — Broadcast (ручная рассылка админом). Аудитория:
// "Все пользователи" или "Подписчики <тип> → <конкретная цель>". Перед
// отправкой обязателен предпросмотр числа получателей (см. `sendBroadcast`,
// docs/00_DECISIONS.md) — кнопка "Отправить" недоступна, пока текущая
// аудитория/текст не подтверждены предпросмотром.
export function BroadcastComposer() {
  const router = useRouter();

  const [audienceKind, setAudienceKind] = useState<"ALL_USERS" | "SUBSCRIBERS">("ALL_USERS");
  const [subscriptionType, setSubscriptionType] = useState<SubscriptionType>("CITY");
  const [targetQuery, setTargetQuery] = useState("");
  const [targetOptions, setTargetOptions] = useState<TargetOption[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<TargetOption | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [priority, setPriority] = useState<"INFO" | "IMPORTANT" | "URGENT">("IMPORTANT");

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());

  const isSearchType = SEARCH_TYPES.includes(subscriptionType);

  function resetAfterAudienceOrContentChange() {
    setPreview(null);
    setSuccess(null);
    setError(null);
  }

  // Короткие исчерпывающие списки (CITY/COUNTRY/EVENT_TYPE) — грузятся сразу
  // при выборе типа, без поиска.
  useEffect(() => {
    if (audienceKind !== "SUBSCRIBERS" || isSearchType) return;
    setOptionsLoading(true);
    setSelectedTarget(null);
    fetch(`/api/admin/notifications/broadcast-targets?type=${subscriptionType}`)
      .then((r) => r.json())
      .then((data) => setTargetOptions(data.options ?? []))
      .finally(() => setOptionsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceKind, subscriptionType, isSearchType]);

  // Поиск по имени (SCHOOL/EVENT/INSTRUCTOR) — с дебаунсом, как и остальные
  // подобные поля проекта (см. DancerSearchBox/JudgeSearchBox).
  useEffect(() => {
    if (audienceKind !== "SUBSCRIBERS" || !isSearchType) return;
    if (targetQuery.trim().length < 2) {
      setTargetOptions([]);
      return;
    }
    setOptionsLoading(true);
    const handle = setTimeout(() => {
      fetch(`/api/admin/notifications/broadcast-targets?type=${subscriptionType}&q=${encodeURIComponent(targetQuery)}`)
        .then((r) => r.json())
        .then((data) => setTargetOptions(data.options ?? []))
        .finally(() => setOptionsLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [audienceKind, subscriptionType, isSearchType, targetQuery]);

  const audience = useMemo(() => {
    if (audienceKind === "ALL_USERS") return { kind: "ALL_USERS" as const };
    if (!selectedTarget) return null;
    return { kind: "SUBSCRIBERS" as const, type: subscriptionType, targetId: selectedTarget.targetId };
  }, [audienceKind, subscriptionType, selectedTarget]);

  const canPreview = audience !== null && title.trim().length > 0 && body.trim().length > 0;

  async function doPreview() {
    if (!audience) return;
    setPreviewLoading(true);
    setError(null);
    setPreview(null);
    const res = await fetch("/api/admin/notifications/broadcasts/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience }),
    });
    setPreviewLoading(false);
    if (!res.ok) {
      setError("Не удалось определить получателей — проверьте выбранную цель.");
      return;
    }
    const data = await res.json();
    setPreview({ recipientCount: data.recipientCount, label: data.label });
  }

  async function doSend() {
    if (!audience || !preview) return;
    setSendLoading(true);
    setError(null);
    const res = await fetch("/api/admin/notifications/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audience,
        title: title.trim(),
        body: body.trim(),
        deepLink: deepLink.trim() || undefined,
        priority,
        clientRequestId,
      }),
    });
    setSendLoading(false);
    if (!res.ok) {
      setError("Не удалось отправить рассылку.");
      return;
    }
    const data = await res.json();
    setSuccess(
      data.alreadySent
        ? `Уже отправлено ранее (${data.recipientCount} получателей) — повторной отправки не было.`
        : `Отправлено ${data.recipientCount} получателям.`
    );
    setPreview(null);
    setTitle("");
    setBody("");
    setDeepLink("");
    setSelectedTarget(null);
    setTargetQuery("");
    setClientRequestId(crypto.randomUUID());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Label className="text-night-text">
          Кому
          <Select
            className={fieldClass}
            value={audienceKind}
            onChange={(e) => {
              setAudienceKind(e.target.value as "ALL_USERS" | "SUBSCRIBERS");
              resetAfterAudienceOrContentChange();
            }}
          >
            <option value="ALL_USERS">Все пользователи</option>
            <option value="SUBSCRIBERS">Подписчики конкретной цели</option>
          </Select>
        </Label>

        {audienceKind === "SUBSCRIBERS" && (
          <Label className="text-night-text">
            Тип подписки
            <Select
              className={fieldClass}
              value={subscriptionType}
              onChange={(e) => {
                setSubscriptionType(e.target.value as SubscriptionType);
                setTargetQuery("");
                setTargetOptions([]);
                resetAfterAudienceOrContentChange();
              }}
            >
              {(Object.keys(SUBSCRIPTION_TYPE_LABELS) as SubscriptionType[]).map((t) => (
                <option key={t} value={t}>
                  {SUBSCRIPTION_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Label>
        )}
      </div>

      {audienceKind === "SUBSCRIBERS" && (
        <div className="flex flex-col gap-2">
          {isSearchType ? (
            <Label className="text-night-text">
              Поиск ({SUBSCRIPTION_TYPE_LABELS[subscriptionType].toLowerCase()}, от 2 символов)
              <Input
                className={fieldClass}
                value={targetQuery}
                onChange={(e) => {
                  setTargetQuery(e.target.value);
                  setSelectedTarget(null);
                  resetAfterAudienceOrContentChange();
                }}
                placeholder="Начните вводить название…"
              />
            </Label>
          ) : (
            <Label className="text-night-text">
              Конкретная цель
              <Select
                className={fieldClass}
                value={selectedTarget?.targetId ?? ""}
                onChange={(e) => {
                  const opt = targetOptions.find((o) => o.targetId === e.target.value) ?? null;
                  setSelectedTarget(opt);
                  resetAfterAudienceOrContentChange();
                }}
                disabled={optionsLoading}
              >
                <option value="">{optionsLoading ? "Загрузка…" : "Выберите…"}</option>
                {targetOptions.map((o) => (
                  <option key={o.targetId} value={o.targetId}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Label>
          )}

          {isSearchType && targetOptions.length > 0 && !selectedTarget && (
            <div className="flex flex-wrap gap-1.5">
              {targetOptions.map((o) => (
                <button
                  key={o.targetId}
                  type="button"
                  onClick={() => {
                    setSelectedTarget(o);
                    setTargetQuery(o.label);
                    resetAfterAudienceOrContentChange();
                  }}
                  className="rounded-full border border-admin-border bg-admin-card2 px-3 py-1 text-xs text-night-text hover:border-admin-primary"
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {isSearchType && selectedTarget && (
            <p className="m-0 text-xs text-night-success">Выбрано: {selectedTarget.label}</p>
          )}
          {isSearchType && targetQuery.trim().length >= 2 && !optionsLoading && targetOptions.length === 0 && !selectedTarget && (
            <p className="m-0 text-xs text-admin-disabled">Ничего не найдено.</p>
          )}
        </div>
      )}

      <Label className="text-night-text">
        Заголовок
        <Input
          className={fieldClass}
          value={title}
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value);
            resetAfterAudienceOrContentChange();
          }}
        />
      </Label>

      <Label className="text-night-text">
        Текст
        <Textarea
          className={fieldClass}
          value={body}
          maxLength={2000}
          onChange={(e) => {
            setBody(e.target.value);
            resetAfterAudienceOrContentChange();
          }}
        />
      </Label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Label className="text-night-text">
          Ссылка (необязательно)
          <Input className={fieldClass} value={deepLink} onChange={(e) => setDeepLink(e.target.value)} placeholder="/events/..." />
        </Label>
        <Label className="text-night-text">
          Приоритет
          <Select className={fieldClass} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            <option value="INFO">Обычный</option>
            <option value="IMPORTANT">Важный</option>
            <option value="URGENT">Срочный</option>
          </Select>
        </Label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {error && <span className="text-xs text-red-400">{error}</span>}
        {success && <span className="text-xs text-night-success">{success}</span>}
        <Button type="button" size="sm" variant="adminOutline" disabled={!canPreview || previewLoading} onClick={doPreview}>
          {previewLoading ? "Считаем…" : "Показать получателей"}
        </Button>
        {preview && (
          <>
            <span className="text-sm text-night-text">
              Получат: <strong>{preview.recipientCount}</strong> ({preview.label})
            </span>
            <Button type="button" size="sm" variant="admin" disabled={sendLoading || preview.recipientCount === 0} onClick={doSend}>
              {sendLoading ? "Отправка…" : "Подтвердить и отправить"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
