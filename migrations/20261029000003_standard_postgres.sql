-- ============================================================================
-- BizPilot: Standard PostgreSQL Canonical Schema & Application Isolation
-- Migration: 20261029000003_standard_postgres.sql
--
-- Pure PostgreSQL schema without runtime dependencies on Supabase Auth (auth.users)
-- or proprietary Supabase services. Operates via standard `pg` connection pool.
-- ============================================================================

-- Enable standard UUID & Cryptographic extensions if supported
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TENANTS & USER ACCOUNTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'Retail Pro MSME',
    region TEXT NOT NULL DEFAULT 'ap-south-1 (Mumbai)',
    sla_rate TEXT NOT NULL DEFAULT '99.9%',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT, -- Stored scrypt / pbkdf2 salted hash
    phone TEXT,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure password_hash column exists if table was created in an earlier migration
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'password_hash'
    ) THEN
        ALTER TABLE users ADD COLUMN password_hash TEXT;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenant_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'STAFF', -- 'OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'VIEWER'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 2. INVENTORY & PRODUCT CATALOG
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    name_en TEXT NOT NULL,
    name_hi TEXT NOT NULL,
    category_en TEXT NOT NULL,
    category_hi TEXT NOT NULL,
    available_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
    reorder_level NUMERIC(12, 2) NOT NULL DEFAULT 10,
    unit_en TEXT NOT NULL DEFAULT 'units',
    unit_hi TEXT NOT NULL DEFAULT 'इकाई',
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'IN_STOCK', -- 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'
    primary_supplier_id UUID,
    shelf_location TEXT,
    barcode TEXT,
    last_restocked TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, sku)
);

-- ----------------------------------------------------------------------------
-- 3. CUSTOMER UDHAAR KHATA & LEDGER
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name_en TEXT NOT NULL,
    name_hi TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    credit_limit NUMERIC(12, 2) NOT NULL DEFAULT 5000,
    outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_purchases NUMERIC(12, 2) NOT NULL DEFAULT 0,
    last_transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL, -- 'DEBIT' (Udhaar taken), 'CREDIT' (Payment received)
    amount NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2) NOT NULL,
    description_en TEXT NOT NULL,
    description_hi TEXT NOT NULL,
    reference_id TEXT,
    payment_mode TEXT, -- 'CASH', 'UPI', 'BANK'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. WHOLESALE SUPPLIERS & PURCHASE ORDERS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name_en TEXT NOT NULL,
    name_hi TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    city TEXT NOT NULL,
    market_area TEXT NOT NULL,
    gstin TEXT,
    payment_terms TEXT NOT NULL DEFAULT 'Net 15 Days',
    lead_time_days INT NOT NULL DEFAULT 2,
    product_categories TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    po_number TEXT NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery DATE NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RECEIVED', 'REJECTED'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, po_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    sku TEXT NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL,
    unit_en TEXT NOT NULL DEFAULT 'units',
    unit_hi TEXT NOT NULL DEFAULT 'इकाई',
    unit_price NUMERIC(12, 2) NOT NULL,
    line_total NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. POS COUNTER SALES & RECEIPTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    receipt_number TEXT NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'CASH', -- 'CASH', 'UPI', 'UDHAAR', 'MIXED'
    notes TEXT,
    is_demo_simulation BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    sku TEXT NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL,
    unit_en TEXT NOT NULL DEFAULT 'units',
    unit_hi TEXT NOT NULL DEFAULT 'इकाई',
    unit_price NUMERIC(12, 2) NOT NULL,
    line_total NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. AUDIT LOG STREAM
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    scope TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'INFO',
    details TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. PERFORMANCE & TENANT ISOLATION INDEXES
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_products_tenant_sku ON products(tenant_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_tenant_status ON products(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger_entries(tenant_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_tenant_status ON purchase_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_created ON sales(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 8. DEFAULT SEED DATA (Shree Ganesh Kirana Store)
-- ----------------------------------------------------------------------------

INSERT INTO tenants (id, slug, name, tier, region, sla_rate)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'shree-ganesh-kirana',
    'Shree Ganesh Kirana Store',
    'Retail Pro MSME',
    'Sector 14, Gurugram, Haryana',
    '99.9%'
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    tier = EXCLUDED.tier;

