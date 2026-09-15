import { describe, it, expect } from "vitest";
import { safeJsonLd } from "@/lib/json-ld";

// QA BUG-008/Test Gap #14 — stored XSS через <script type="application/ld+json">
// dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}: обычный
// JSON.stringify не экранирует "<", поэтому "</script><script>...</script>" в
// title/description буквально закрывал JSON-LD тег и открывал новый
// исполняемый <script>, выполняясь у каждого посетителя страницы.
describe("safeJsonLd()", () => {
  it("экранирует </script>, не давая закрыть тег JSON-LD", () => {
    const html = safeJsonLd({ name: "Event</script><script>alert(1)</script>" });
    expect(html).not.toContain("</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).toContain("\\u003cscript\\u003e");
  });

  it("остаётся валидным JSON после снятия экранирования (не ломает сериализацию)", () => {
    const original = { name: "Bachata <Night> & Friends", description: "тест" };
    const html = safeJsonLd(original);
    // Экранированный вид всё ещё парсится как валидный JSON — просто с
    // \u003c/\u003e/\u0026 вместо буквальных символов, что JSON.parse
    // разворачивает обратно в исходную строку без потерь.
    expect(JSON.parse(html)).toEqual(original);
  });

  it("обычный текст без спецсимволов не искажается", () => {
    const html = safeJsonLd({ name: "Обычное название вечеринки" });
    expect(JSON.parse(html)).toEqual({ name: "Обычное название вечеринки" });
  });
});
