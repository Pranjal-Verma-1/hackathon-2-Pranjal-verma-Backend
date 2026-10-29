-- ============================================================================
-- BizPilot: Supabase Authentication, Tenant Memberships & Access Token Hook
-- Migration: 20261029000002_auth_and_memberships.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ROW LEVEL SECURITY (RLS) ON USERS, TENANT MEMBERSHIPS & TENANTS
-- ----------------------------------------------------------------------------

-- Enable RLS (idempotent)
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tenants ENABLE ROW LEVEL SECURITY;

-- Drop previous policies if re-running
DROP POLICY IF EXISTS users_select_self ON users;
DROP POLICY IF EXISTS users_update_self ON users;
DROP POLICY IF EXISTS memberships_select_own ON tenant_memberships;
DROP POLICY IF EXISTS memberships_select_tenant_admin ON tenant_memberships;
DROP POLICY IF EXISTS memberships_manage_owner ON tenant_memberships;
DROP POLICY IF EXISTS tenants_select_members ON tenants;
DROP POLICY IF EXISTS tenants_update_owner ON tenants;

-- Policies on `users` table:
-- 1. Users can select their own record
CREATE POLICY users_select_self ON users
    FOR SELECT USING (
        auth_user_id = auth.uid() OR
        auth_user_id IS NULL -- Allows public directory queries for tenant members when scoped
    );

-- 2. Users can update their own profile
CREATE POLICY users_update_self ON users
    FOR UPDATE USING (
        auth_user_id = auth.uid()
    ) WITH CHECK (
        auth_user_id = auth.uid()
    );

-- Policies on `tenant_memberships` table:
-- 1. Users can view their own memberships
CREATE POLICY memberships_select_own ON tenant_memberships
    FOR SELECT USING (
        user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    );

-- 2. Tenant Owners and Admins can view all memberships within their tenant
CREATE POLICY memberships_select_tenant_admin ON tenant_memberships
    FOR SELECT USING (
        tenant_id IN (
            SELECT tm2.tenant_id
            FROM tenant_memberships tm2
            JOIN users u2 ON tm2.user_id = u2.id
            WHERE u2.auth_user_id = auth.uid()
              AND tm2.role IN ('OWNER', 'ADMIN')
              AND tm2.is_active = TRUE
        )
    );

-- 3. Only Tenant Owners can insert or update memberships in their tenant
CREATE POLICY memberships_manage_owner ON tenant_memberships
    FOR ALL USING (
        tenant_id IN (
            SELECT tm2.tenant_id
            FROM tenant_memberships tm2
            JOIN users u2 ON tm2.user_id = u2.id
            WHERE u2.auth_user_id = auth.uid()
              AND tm2.role = 'OWNER'
              AND tm2.is_active = TRUE
        )
    ) WITH CHECK (
        tenant_id IN (
            SELECT tm2.tenant_id
            FROM tenant_memberships tm2
            JOIN users u2 ON tm2.user_id = u2.id
            WHERE u2.auth_user_id = auth.uid()
              AND tm2.role = 'OWNER'
              AND tm2.is_active = TRUE
        )
    );

-- Policies on `tenants` table:
-- 1. Users can only select tenants where they hold an active membership
CREATE POLICY tenants_select_members ON tenants
    FOR SELECT USING (
        id IN (
            SELECT tm.tenant_id
            FROM tenant_memberships tm
            JOIN users u ON tm.user_id = u.id
            WHERE u.auth_user_id = auth.uid()
              AND tm.is_active = TRUE
        )
    );

-- 2. Only tenant Owners can update tenant metadata
CREATE POLICY tenants_update_owner ON tenants
    FOR UPDATE USING (
        id IN (
            SELECT tm.tenant_id
            FROM tenant_memberships tm
            JOIN users u ON tm.user_id = u.id
            WHERE u.auth_user_id = auth.uid()
              AND tm.role = 'OWNER'
              AND tm.is_active = TRUE
        )
    ) WITH CHECK (
        id IN (
            SELECT tm.tenant_id
            FROM tenant_memberships tm
            JOIN users u ON tm.user_id = u.id
            WHERE u.auth_user_id = auth.uid()
              AND tm.role = 'OWNER'
              AND tm.is_active = TRUE
        )
    );

-- ----------------------------------------------------------------------------
-- 2. ENHANCED TENANT CONTEXT RESOLUTION
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    -- 1. Check direct JWT claim `tenant_id` (injected via custom access token hook)
    IF NULLIF(current_setting('request.jwt.claim.tenant_id', true), '') IS NOT NULL THEN
        RETURN current_setting('request.jwt.claim.tenant_id', true)::UUID;
    END IF;

    -- 2. Check JWT app_metadata -> tenant_id
    IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL THEN
        v_tenant_id := NULLIF(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,tenant_id}', '')::UUID;
        IF v_tenant_id IS NOT NULL THEN
            RETURN v_tenant_id;
        END IF;
    END IF;

    -- 3. Check session context variable (for verified server-side database connections)
    IF NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL THEN
        RETURN current_setting('app.current_tenant_id', true)::UUID;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3. AUTOMATIC PROFILE CREATION TRIGGER ON SUPABASE AUTH SIGNUP
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_tenant_id UUID;
    v_store_name TEXT;
    v_slug TEXT;
BEGIN
    -- Create public.users record linked to auth.users.id
    INSERT INTO public.users (auth_user_id, email, phone, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'phone',
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    )
    ON CONFLICT (email) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id,
        updated_at = NOW()
    RETURNING id INTO v_user_id;

    -- If store_name was provided at sign-up, provision a new tenant and OWNER membership
    v_store_name := NEW.raw_user_meta_data->>'store_name';
    IF v_store_name IS NOT NULL AND length(trim(v_store_name)) > 0 THEN
        v_slug := lower(regexp_replace(v_store_name, '[^a-zA-Z0-9]+', '-', 'g'));
        IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) THEN
            v_slug := v_slug || '-' || substr(md5(random()::text), 1, 6);
        END IF;

        INSERT INTO public.tenants (name, slug, tier)
        VALUES (v_store_name, v_slug, 'Retail Pro MSME')
        RETURNING id INTO v_tenant_id;

        INSERT INTO public.tenant_memberships (tenant_id, user_id, role, is_active)
        VALUES (v_tenant_id, v_user_id, 'OWNER', TRUE);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 4. SUPABASE CUSTOM ACCESS TOKEN HOOK (FOR JWT CLAIMS INJECTION)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
    v_claims jsonb;
    v_auth_user_id UUID;
    v_tenant_id UUID;
    v_role TEXT;
BEGIN
    v_claims := event->'claims';
    v_auth_user_id := (event->>'user_id')::UUID;

    -- Query active tenant membership for authenticated user
    SELECT tm.tenant_id, tm.role INTO v_tenant_id, v_role
    FROM public.tenant_memberships tm
    JOIN public.users u ON tm.user_id = u.id
    WHERE u.auth_user_id = v_auth_user_id AND tm.is_active = TRUE
    ORDER BY tm.created_at ASC
    LIMIT 1;

    -- Inject claims into the minted JWT so PostgreSQL RLS can verify tenant_id natively
    IF v_tenant_id IS NOT NULL THEN
        v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
        v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
    END IF;

    event := jsonb_set(event, '{claims}', v_claims);
    RETURN event;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

