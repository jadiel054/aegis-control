-- Authorization policy source for the Go gateway (v1: exact-match only).
-- Apply after 001_mission_gates.sql. No policies are seeded: missing rules deny.
CREATE TABLE IF NOT EXISTS public.authorization_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) > 0 AND tenant_id = btrim(tenant_id)),
    principal_id TEXT NOT NULL CHECK (length(btrim(principal_id)) > 0 AND principal_id = btrim(principal_id)),
    action TEXT NOT NULL CHECK (length(btrim(action)) > 0 AND action = btrim(action)),
    resource TEXT NOT NULL CHECK (length(btrim(resource)) > 0 AND resource = btrim(resource)),
    effect TEXT NOT NULL CHECK (effect IN ('ALLOW', 'DENY')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT authorization_policies_exact_match_unique
      UNIQUE (tenant_id, principal_id, action, resource),
    CONSTRAINT authorization_policies_valid_window
      CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS authorization_policies_enabled_idx
    ON public.authorization_policies (enabled, tenant_id, principal_id);

CREATE OR REPLACE FUNCTION public.set_authorization_policy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS authorization_policies_updated_at ON public.authorization_policies;
CREATE TRIGGER authorization_policies_updated_at
    BEFORE UPDATE ON public.authorization_policies
    FOR EACH ROW EXECUTE FUNCTION public.set_authorization_policy_updated_at();
