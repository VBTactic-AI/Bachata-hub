"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/field";
import { JUDGING_MAX_SCORE_LABELS, FINAL_FORMAT_LABELS } from "@/lib/competition-labels";

export type FinalFormatValue = "NORMAL" | "JUDGES_DANCE" | "RANDOM_COUPLES" | "RELATIVE_PLACEMENT";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// "Настройки судейства" (вкладка "Судьи", по референсу пользователя,
// 2026-09-09) — единая точка для двух методик одной категории: как судятся
// раунды ДО финала (Division.judgingMaxScore, шкала 0/1 или 0/1/2) и каким
// форматом идёт сам финал (FinalSettings.format). Оба поля уже существовали
// и редактировались в других местах вкладки "Категории" (DivisionSettingsPanel
// показывал первое только текстом, FinalSettingsPanel — второе, вместе с
// критериями/scoring-matrix) — здесь только компактный дубль под один
// "Сохранить", без полной формы финала (критерии по-прежнему настраиваются
// там же, на "Категории").
//
// PATCH/PUT — те же самые эндпоинты, что уже используют DivisionSettingsPanel
// (ротация)/FinalSettingsPanel (критерии): ротация отправляется как есть, без
// изменений (heatCapacity сюда больше не входит — теперь редактируется
// отдельно, панелью категории на вкладке "Категории", 2026-09-09), чтобы не
// задеть настройки, о которых эта форма не знает.
export function DivisionJudgingSettingsForm({
  divisionId,
  judgingMaxScore: initialJudgingMaxScore,
  judgingMaxScoreDisabledReason,
  rotationMode,
  rotationIntervalSec,
  rotationShiftMin,
  rotationShiftMax,
  finalFormat: initialFinalFormat,
  finalFormatDisabledReason,
  finalTracksCount,
  finalPartnerChangeEnabled,
  finalConfig,
}: {
  divisionId: string;
  judgingMaxScore: number;
  judgingMaxScoreDisabledReason: string | null;
  rotationMode: "TRACK_AUTO_SHIFT" | "SEGMENT_MANUAL_SHIFT";
  rotationIntervalSec: number;
  rotationShiftMin: number;
  rotationShiftMax: number;
  finalFormat: FinalFormatValue;
  finalFormatDisabledReason: string | null;
  finalTracksCount: number;
  finalPartnerChangeEnabled: boolean;
  finalConfig: unknown;
}) {
  const router = useRouter();
  const [judgingMaxScore, setJudgingMaxScore] = useState(initialJudgingMaxScore);
  const [finalFormat, setFinalFormat] = useState<FinalFormatValue>(initialFinalFormat);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEditJudgingMaxScore = judgingMaxScoreDisabledReason === null;
  const canEditFinalFormat = finalFormatDisabledReason === null;
  const hasChanges = (canEditJudgingMaxScore && judgingMaxScore !== initialJudgingMaxScore) || (canEditFinalFormat && finalFormat !== initialFinalFormat);

  async function onSave() {
    setLoading(true);
    setError(null);
    const requests: Promise<Response>[] = [];
    if (canEditJudgingMaxScore && judgingMaxScore !== initialJudgingMaxScore) {
      requests.push(
        fetch(`/api/divisions/${divisionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rotationMode, rotationIntervalSec, rotationShiftMin, rotationShiftMax, judgingMaxScore }),
        })
      );
    }
    if (canEditFinalFormat && finalFormat !== initialFinalFormat) {
      requests.push(
        fetch(`/api/divisions/${divisionId}/final-settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: finalFormat, tracksCount: finalTracksCount, partnerChangeEnabled: finalPartnerChangeEnabled, config: finalConfig }),
        })
      );
    }

    const results = await Promise.all(requests);
    setLoading(false);
    for (const res of results) {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось сохранить настройки судейства.");
        return;
      }
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Label className="text-night-text">
          Метод оценки раундов до финала
          <Select
            value={judgingMaxScore}
            disabled={!canEditJudgingMaxScore}
            onChange={(e) => setJudgingMaxScore(Number(e.target.value))}
            className={`${FIELD_CLASS} disabled:opacity-50`}
          >
            {Object.entries(JUDGING_MAX_SCORE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {judgingMaxScoreDisabledReason && <span className="text-xs font-normal text-admin-muted">{judgingMaxScoreDisabledReason}</span>}
        </Label>

        <Label className="text-night-text">
          Методика финала
          <Select
            value={finalFormat}
            disabled={!canEditFinalFormat}
            onChange={(e) => setFinalFormat(e.target.value as FinalFormatValue)}
            className={`${FIELD_CLASS} disabled:opacity-50`}
          >
            {Object.entries(FINAL_FORMAT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {finalFormatDisabledReason && <span className="text-xs font-normal text-admin-muted">{finalFormatDisabledReason}</span>}
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="admin" disabled={loading || !hasChanges} onClick={onSave}>
          Сохранить
        </Button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  );
}
