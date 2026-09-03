-- Новые таблицы слоя 3 создавались без RLS. Приводим к тому же состоянию,
-- что и все остальные таблицы проекта (RLS включён, политик пока нет —
-- см. 20260902132912_enable_rls_no_policies для layer-1 таблиц). Прямой
-- доступ приложения через Prisma не затрагивается; закрывается только
-- прямой доступ к таблицам через публичный Supabase REST API.

ALTER TABLE public."Permission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserRoleAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CompetitionTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Competition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CompetitionMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CompetitionRules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Division" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Round" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Heat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CompetitionEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."IdempotencyKey" ENABLE ROW LEVEL SECURITY;
