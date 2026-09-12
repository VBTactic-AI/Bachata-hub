// Клиент публичного Vercel REST API (Web Analytics + Deployments), проверено
// по официальной документации 2026-09-12:
// vercel.com/docs/rest-api/web-analytics/*, vercel.com/docs/rest-api/reference/
// endpoints/deployments/list-deployments.
//
// Требует секрет VERCEL_API_TOKEN (создаётся вручную в vercel.com/account/
// tokens — программно его получить нельзя) + VERCEL_PROJECT_ID, и
// VERCEL_TEAM_ID, если проект в команде, а не в личном аккаунте (см.
// .env.example). Без них функции возвращают { configured: false } — страница
// показывает понятное "не подключено", а не падает и не выдумывает цифры
// (CLAUDE.md §46/§60).
//
// Egress/bandwidth и точные квоты Vercel сюда сознательно НЕ включены —
// официального API для них нет (подтверждено: community.vercel.com/t/
// building-a-vercel-integration.../222, github.com/vercel/vercel/
// discussions/11120). Единственная цифра "относительно лимита", которую
// можно получить честно — события Web Analytics в этом месяце против
// квоты Hobby-плана (vercel.com/docs/analytics/limits-and-pricing).

export const VERCEL_HOBBY_MONTHLY_EVENT_LIMIT = 50_000;

type VercelConfig = { token: string; projectId: string; teamId?: string };

function getVercelConfig(): VercelConfig | null {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;
  return { token, projectId, teamId: process.env.VERCEL_TEAM_ID || undefined };
}

async function callVercel<T>(path: string, params: Record<string, string>, config: VercelConfig): Promise<T> {
  const url = new URL(`https://api.vercel.com${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (config.teamId) url.searchParams.set("teamId", config.teamId);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${config.token}` },
    // Не дёргаем Vercel на каждую загрузку страницы — обновляем раз в 5 минут.
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Vercel API ${path} → ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export type DailyVisits = { date: string; pageviews: number; visitors: number };

export type VercelAnalyticsResult =
  | { configured: false }
  | { configured: true; ok: true; dailyVisits: DailyVisits[]; monthPageviews: number; monthVisitors: number }
  | { configured: true; ok: false; error: string };

export async function getVercelWebAnalytics(days = 14): Promise<VercelAnalyticsResult> {
  const config = getVercelConfig();
  if (!config) return { configured: false };

  try {
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    type AggregateResponse = { data: { timestamp: string; pageviews: number; visitors: number }[] };
    type CountResponse = { data: { pageviews: number; visitors: number } };

    const [aggregate, monthCount] = await Promise.all([
      callVercel<AggregateResponse>(
        "/v1/query/web-analytics/visits/aggregate",
        { projectId: config.projectId, since: since.toISOString(), until: now.toISOString(), by: "day" },
        config
      ),
      callVercel<CountResponse>(
        "/v1/query/web-analytics/visits/count",
        { projectId: config.projectId, since: monthStart.toISOString(), until: now.toISOString() },
        config
      ),
    ]);

    return {
      configured: true,
      ok: true,
      dailyVisits: aggregate.data.map((row) => ({ date: row.timestamp, pageviews: row.pageviews, visitors: row.visitors })),
      monthPageviews: monthCount.data.pageviews,
      monthVisitors: monthCount.data.visitors,
    };
  } catch (err) {
    return { configured: true, ok: false, error: err instanceof Error ? err.message : "Неизвестная ошибка" };
  }
}

export type LatestDeployment = { state: string; target: string | null; createdAt: number; url: string; inspectorUrl: string | null };

export type VercelDeploymentResult =
  | { configured: false }
  | { configured: true; ok: true; deployment: LatestDeployment | null }
  | { configured: true; ok: false; error: string };

export async function getLatestVercelDeployment(): Promise<VercelDeploymentResult> {
  const config = getVercelConfig();
  if (!config) return { configured: false };

  try {
    type DeploymentsResponse = {
      deployments: { state: string; target: string | null; createdAt: number; url: string; inspectorUrl: string | null }[];
    };
    const res = await callVercel<DeploymentsResponse>("/v6/deployments", { projectId: config.projectId, limit: "1" }, config);
    const d = res.deployments[0];
    return {
      configured: true,
      ok: true,
      deployment: d ? { state: d.state, target: d.target, createdAt: d.createdAt, url: d.url, inspectorUrl: d.inspectorUrl } : null,
    };
  } catch (err) {
    return { configured: true, ok: false, error: err instanceof Error ? err.message : "Неизвестная ошибка" };
  }
}
