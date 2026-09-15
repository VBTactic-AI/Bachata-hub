// QA BUG-008 (2026-09-15) — stored XSS через <script type="application/ld+json">:
// обычный JSON.stringify не экранирует "<", поэтому title/description
// события/школы, содержащие "</script><script>...", буквально закрывали
// JSON-LD тег и открывали новый исполняемый <script> — код выполнялся у
// каждого посетителя публичной страницы. Единая точка сериализации для всех
// dangerouslySetInnerHTML={{ __html: ... }} JSON-LD блоков — не размножаем
// один и тот же .replace() по каждой странице.
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
