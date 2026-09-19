import { describe, it, expect } from "vitest";
import { buildIcsEvent } from "@/lib/ics";

describe("buildIcsEvent()", () => {
  it("формирует валидный VEVENT с CRLF-переносами и DTSTART/DTEND в UTC basic-формате", () => {
    const ics = buildIcsEvent({
      uid: "event-1@bachata-hub",
      title: "Bachata Sensual Night",
      startsAt: new Date("2026-09-19T19:00:00.000Z"),
      endsAt: new Date("2026-09-19T23:00:00.000Z"),
    });

    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("UID:event-1@bachata-hub\r\n");
    expect(ics).toContain("DTSTART:20260919T190000Z\r\n");
    expect(ics).toContain("DTEND:20260919T230000Z\r\n");
    expect(ics).toContain("SUMMARY:Bachata Sensual Night\r\n");
    expect(ics).toContain("END:VEVENT\r\n");
    expect(ics).toContain("END:VCALENDAR\r\n");
  });

  it("без endsAt — подставляет условную длительность 2 часа, а не падает без DTEND", () => {
    const ics = buildIcsEvent({
      uid: "event-2@bachata-hub",
      title: "Открытая практика",
      startsAt: new Date("2026-09-20T18:00:00.000Z"),
    });

    expect(ics).toContain("DTSTART:20260920T180000Z\r\n");
    expect(ics).toContain("DTEND:20260920T200000Z\r\n");
  });

  it("экранирует запятые, точку с запятой и переносы строк в тексте (RFC 5545)", () => {
    const ics = buildIcsEvent({
      uid: "event-3@bachata-hub",
      title: "Party: Salsa, Bachata; Kizomba",
      description: "Первая строка\nВторая строка",
      startsAt: new Date("2026-09-19T19:00:00.000Z"),
    });

    expect(ics).toContain("SUMMARY:Party: Salsa\\, Bachata\\; Kizomba\r\n");
    expect(ics).toContain("DESCRIPTION:Первая строка\\nВторая строка\r\n");
  });

  it("необязательные LOCATION/URL — только когда переданы", () => {
    const withoutOptional = buildIcsEvent({ uid: "e", title: "T", startsAt: new Date("2026-09-19T19:00:00.000Z") });
    expect(withoutOptional).not.toContain("LOCATION:");
    expect(withoutOptional).not.toContain("URL:");

    const withOptional = buildIcsEvent({
      uid: "e",
      title: "T",
      startsAt: new Date("2026-09-19T19:00:00.000Z"),
      location: "Минск, ул. Ленина 1",
      url: "https://example.com/events/e",
    });
    expect(withOptional).toContain("LOCATION:Минск\\, ул. Ленина 1\r\n");
    expect(withOptional).toContain("URL:https://example.com/events/e\r\n");
  });
});
