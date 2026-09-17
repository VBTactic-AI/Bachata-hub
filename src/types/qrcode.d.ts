// Минимальные типы для пакета qrcode (@types/qrcode не установлен — npm
// registry устойчиво отдавал 503 именно на scoped-пакетах через прокси
// среды разработки, см. docs/PROGRESS.md; сам пакет qrcode пользователь
// установил вручную). Покрывает только то, что реально использует
// src/components/festival/FestivalPassQrCode.tsx.
declare module "qrcode" {
  export interface QRCodeToDataURLOptions {
    margin?: number;
    width?: number;
    color?: { dark?: string; light?: string };
  }

  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
}
