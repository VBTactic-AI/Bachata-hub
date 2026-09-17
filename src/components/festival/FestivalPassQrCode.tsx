"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Festival Engine — Stage 6 (2026-09-17, docs/FESTIVAL_SERVICE_LAYER_PLAN.md).
// Кодирует Ticket.id — тот же идентификатор, что показан текстом рядом
// (ручной ввод сотрудником на входе как запасной вариант, если сканера нет
// под рукой или разрядился телефон). Генерация — на клиенте, как решено в
// плане (сервер отдаёт только сырой ticket.id, ничего заранее не рендерит).
//
// Белый фон QR — намеренно вне тёмной палитры экрана (§64.2 CLAUDE.md):
// door-сканеры ожидают контраст "тёмные модули на светлом фоне", инверсия
// цветов часто не читается стандартными сканерами штрихкодов/QR.
export function FestivalPassQrCode({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    QRCode.toDataURL(value, { margin: 1, width: 220 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!dataUrl) {
    return <div aria-hidden className="h-[220px] w-[220px] animate-pulse rounded-app-sm bg-white/10" />;
  }

  // eslint-disable-next-line @next/next/no-img-element -- data URL, не файл, next/image сюда не подходит
  return <img src={dataUrl} alt="QR-код для входа" width={220} height={220} className="rounded-app-sm bg-white p-2" />;
}
