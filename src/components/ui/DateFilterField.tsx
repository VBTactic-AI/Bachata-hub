"use client";

import { useEffect, useState } from "react";
import { DateField } from "./DateField";
import type { CalendarTheme } from "./CalendarGrid";

// Обёртка DateField для ОБЫЧНОЙ (не JS-управляемой) формы фильтров /events —
// та форма намеренно отдаёт готовый HTML и работает через нативный GET без
// обязательного JS ("страница остаётся индексируемой и рабочей даже без
// клиентского JS", см. комментарий в src/app/events/page.tsx). Замена
// нативного `<input type="date">` на кастомный календарь не должна сломать
// это: до гидратации на странице рендерится настоящий `<input type="date"
// name=...>` (работает без единой строчки JS), и только ПОСЛЕ монтирования
// на клиенте подменяется на календарь + скрытый input с тем же name, чтобы
// обычная сериализация формы браузером не заметила разницы.
export function DateFilterField({
  name,
  defaultValue = "",
  theme = "night",
  className,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  theme?: CalendarTheme;
  className?: string;
  placeholder?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <input type="date" name={name} defaultValue={defaultValue} className={className} />;
  }

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <DateField value={value} onChange={setValue} theme={theme} className={className} placeholder={placeholder} />
    </>
  );
}
