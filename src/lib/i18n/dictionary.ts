import { ru } from "./ru";

// Единственная точка выбора языка. На старте всегда "ru", но весь остальной
// код обращается только к t(), а не к ru напрямую — поэтому добавление
// locale в будущем (слой 2, СНГ) не требует правок в компонентах.
const dictionaries = { ru } as const;

export type Locale = keyof typeof dictionaries;

export function getDictionary(locale: Locale = "ru") {
  return dictionaries[locale];
}

export const t = getDictionary("ru");
