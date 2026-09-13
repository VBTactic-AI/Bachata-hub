import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: (...a: unknown[]) => userFindUnique(...a) } } }));

const { emailProvider } = await import("@/server/notifications/providers/email-provider");

const ORIGINAL_ENV = { ...process.env };
const fetchMock = vi.fn();

beforeEach(() => {
  userFindUnique.mockReset().mockResolvedValue({ email: "dancer@example.com" });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "Bachata HUB <notifications@bachatahub.by>";
  process.env.NEXT_PUBLIC_SITE_URL = "https://bachatahub.by";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

const payload = { userId: "u1", title: "Новое событие", body: "Bachata Night — 20 сентября", deepLink: "/events/party" };

describe("emailProvider — Resend REST API через fetch, без SDK-пакета", () => {
  it("RESEND_API_KEY не задан — FAILED, fetch не вызывается", async () => {
    delete process.env.RESEND_API_KEY;

    const result = await emailProvider.send(payload);

    expect(result).toEqual({ status: "FAILED", errorCode: "resend_not_configured", errorMessage: "RESEND_API_KEY не настроен." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("пользователь не найден — FAILED", async () => {
    userFindUnique.mockResolvedValue(null);

    const result = await emailProvider.send(payload);

    expect(result.status).toBe("FAILED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("успех — POST на api.resend.com с Bearer-ключом, адресом получателя и ссылкой в HTML", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "resend-msg-1" }) });

    const result = await emailProvider.send(payload);

    expect(result).toEqual({ status: "SENT", providerMessageId: "resend-msg-1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer re_test_key", "Content-Type": "application/json" }),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe("dancer@example.com");
    expect(body.subject).toBe("Новое событие");
    expect(body.html).toContain("Bachata Night — 20 сентября");
    expect(body.html).toContain('href="https://bachatahub.by/events/party"');
  });

  it("экранирует HTML в теле уведомления (XSS-защита при подстановке пользовательского текста)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "x" }) });

    await emailProvider.send({ ...payload, body: "<script>alert(1)</script>" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.html).not.toContain("<script>");
    expect(body.html).toContain("&lt;script&gt;");
  });

  it("Resend вернул ошибку (не ok) — FAILED с кодом статуса", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => "Invalid `from` address" });

    const result = await emailProvider.send(payload);

    expect(result.status).toBe("FAILED");
    expect(result).toMatchObject({ errorCode: "422" });
  });

  it("fetch бросил исключение (сеть недоступна) — FAILED, не падает наружу", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    const result = await emailProvider.send(payload);

    expect(result).toEqual({ status: "FAILED", errorMessage: "network unreachable" });
  });

  it("нет deepLink — письмо без ссылки, без ошибки", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "x" }) });

    await emailProvider.send({ ...payload, deepLink: null });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.html).not.toContain("href=");
  });
});
