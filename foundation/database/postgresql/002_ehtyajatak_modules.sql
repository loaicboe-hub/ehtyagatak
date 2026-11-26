-- =============================================================================
-- EHTYAJATAK FOR SUSTAINABLE DEVELOPMENT — ADDITIVE MODULE SCHEMA (PostgreSQL 15+)
-- Extends foundation/database/postgresql/001_core_schema.sql
-- Policy: Additive-only; IF NOT EXISTS; NO fake users or passwords.
-- =============================================================================

-- 1. Project-Specific RBAC Roles (investor_manager, investor)
INSERT INTO roles (slug, name, description, is_system) VALUES
  ('investor_manager', 'Investor Manager', 'Manages investors, contracts, greenhouses, leads, support tickets, and pending approvals.', TRUE),
  ('investor', 'Investor', 'Private Investor Portal user with strict row-level ownership isolation.', TRUE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM roles r
JOIN (VALUES
  ('admin', 'settings.calculator.edit'),
  ('admin', 'investors.view'),
  ('admin', 'investors.manage'),
  ('admin', 'approvals.view'),
  ('admin', 'approvals.review'),
  ('admin', 'support.view'),
  ('admin', 'support.manage'),
  ('admin', 'erp.logs.view'),
  ('admin', 'audit.logs.view'),
  ('editor', 'modules.manage'),
  ('investor_manager', 'dashboard.overview.view'),
  ('investor_manager', 'inquiries.view'),
  ('investor_manager', 'inquiries.manage'),
  ('investor_manager', 'investors.view'),
  ('investor_manager', 'investors.manage'),
  ('investor_manager', 'approvals.view'),
  ('investor_manager', 'approvals.review'),
  ('investor_manager', 'support.view'),
  ('investor_manager', 'support.manage'),
  ('investor_manager', 'media.view'),
  ('investor_manager', 'media.upload'),
  ('investor_manager', 'erp.logs.view'),
  ('investor_manager', 'audit.logs.view'),
  ('investor_manager', 'account.self.manage'),
  ('investor', 'portal.access'),
  ('investor', 'account.self.manage')
) AS p(role_slug, permission_key) ON r.slug = p.role_slug
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 2. Agricultural Projects CMS
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  slug VARCHAR(160) NOT NULL UNIQUE,
  location_ar VARCHAR(255) NOT NULL,
  location_en VARCHAR(255) NOT NULL,
  total_greenhouses INT NOT NULL DEFAULT 0,
  available_greenhouses INT NOT NULL DEFAULT 0,
  area_per_greenhouse_sqm NUMERIC(10, 2) NOT NULL DEFAULT 360.00,
  unit_price_egp NUMERIC(14, 2) NOT NULL DEFAULT 220000.00,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('planning', 'active', 'completed', 'archived')),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  cover_media_id BIGINT REFERENCES media_items(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_translations (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  language_code VARCHAR(8) NOT NULL CHECK (language_code IN ('ar', 'en')),
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  crop_types VARCHAR(255),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, language_code)
);

-- 3. News Posts & FAQs CMS
CREATE TABLE IF NOT EXISTS news_posts (
  id BIGSERIAL PRIMARY KEY,
  slug VARCHAR(160) NOT NULL UNIQUE,
  cover_media_id BIGINT REFERENCES media_items(id) ON DELETE SET NULL,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  author_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_post_translations (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
  language_code VARCHAR(8) NOT NULL CHECK (language_code IN ('ar', 'en')),
  title VARCHAR(255) NOT NULL,
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, language_code)
);

CREATE TABLE IF NOT EXISTS faqs (
  id BIGSERIAL PRIMARY KEY,
  category VARCHAR(64) NOT NULL DEFAULT 'investment',
  sort_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faq_translations (
  id BIGSERIAL PRIMARY KEY,
  faq_id BIGINT NOT NULL REFERENCES faqs(id) ON DELETE CASCADE,
  language_code VARCHAR(8) NOT NULL CHECK (language_code IN ('ar', 'en')),
  question VARCHAR(500) NOT NULL,
  answer TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (faq_id, language_code)
);

-- 4. Public Investment Leads & Appointment Bookings
CREATE TABLE IF NOT EXISTS investment_leads (
  id BIGSERIAL PRIMARY KEY,
  lead_type VARCHAR(32) NOT NULL CHECK (lead_type IN ('investment_request', 'appointment_booking', 'general_inquiry')),
  full_name VARCHAR(160) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  email VARCHAR(190),
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  greenhouse_count INT,
  estimated_total_egp NUMERIC(14, 2),
  estimated_down_payment_egp NUMERIC(14, 2),
  preferred_date DATE,
  preferred_time VARCHAR(40),
  notes TEXT,
  language_code VARCHAR(8) NOT NULL DEFAULT 'ar' CHECK (language_code IN ('ar', 'en')),
  status VARCHAR(32) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'closed')),
  admin_notes TEXT,
  assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
  source_ip VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_status_type ON investment_leads(status, lead_type, created_at);

-- 5. Investor Profiles & Contracts
CREATE TABLE IF NOT EXISTS investor_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  investor_code VARCHAR(64) NOT NULL UNIQUE,
  national_id_masked VARCHAR(32),
  city VARCHAR(120),
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investor_contracts (
  id BIGSERIAL PRIMARY KEY,
  investor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contract_number VARCHAR(80) NOT NULL UNIQUE,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  greenhouse_count INT NOT NULL CHECK (greenhouse_count > 0),
  total_amount_egp NUMERIC(14, 2) NOT NULL CHECK (total_amount_egp >= 0),
  down_payment_egp NUMERIC(14, 2) NOT NULL CHECK (down_payment_egp >= 0),
  remaining_amount_egp NUMERIC(14, 2) NOT NULL CHECK (remaining_amount_egp >= 0),
  start_date DATE NOT NULL,
  end_date DATE,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'suspended')),
  document_media_id BIGINT REFERENCES media_items(id) ON DELETE SET NULL,
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contracts_investor ON investor_contracts(investor_user_id, status);

-- 6. Greenhouses, Crops, Installments, Profits (With Mandatory Approval Gate)
CREATE TABLE IF NOT EXISTS greenhouses (
  id BIGSERIAL PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES investor_contracts(id) ON DELETE RESTRICT,
  investor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  greenhouse_number VARCHAR(80) NOT NULL UNIQUE,
  area_sqm NUMERIC(10, 2) NOT NULL DEFAULT 360.00,
  location_label VARCHAR(255) NOT NULL,
  current_crop_ar VARCHAR(160),
  current_crop_en VARCHAR(160),
  operational_status VARCHAR(32) NOT NULL DEFAULT 'preparing' CHECK (operational_status IN ('preparing', 'planted', 'harvesting', 'maintenance')),
  external_erp_id VARCHAR(120) UNIQUE,
  approval_status VARCHAR(24) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  pending_erp_payload_json JSONB,
  rejection_reason TEXT,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_greenhouses_investor_approved ON greenhouses(investor_user_id, approval_status);

CREATE TABLE IF NOT EXISTS crop_updates (
  id BIGSERIAL PRIMARY KEY,
  greenhouse_id BIGINT NOT NULL REFERENCES greenhouses(id) ON DELETE CASCADE,
  investor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  season_name VARCHAR(120) NOT NULL,
  crop_name_ar VARCHAR(160) NOT NULL,
  crop_name_en VARCHAR(160) NOT NULL,
  stage_ar VARCHAR(120) NOT NULL,
  stage_en VARCHAR(120) NOT NULL,
  yield_kg NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sales_revenue_egp NUMERIC(14, 2) NOT NULL DEFAULT 0,
  recorded_date DATE NOT NULL,
  notes_ar TEXT,
  notes_en TEXT,
  source VARCHAR(16) NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'erp')),
  external_erp_id VARCHAR(120) UNIQUE,
  approval_status VARCHAR(24) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  rejection_reason TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crops_investor_approved ON crop_updates(investor_user_id, approval_status, recorded_date);

CREATE TABLE IF NOT EXISTS investor_installments (
  id BIGSERIAL PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES investor_contracts(id) ON DELETE RESTRICT,
  investor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  installment_number INT NOT NULL,
  due_date DATE NOT NULL,
  amount_egp NUMERIC(14, 2) NOT NULL CHECK (amount_egp >= 0),
  paid_amount_egp NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount_egp >= 0),
  paid_date DATE,
  payment_status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'overdue')),
  payment_reference VARCHAR(120),
  receipt_media_id BIGINT REFERENCES media_items(id) ON DELETE SET NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'erp')),
  external_erp_id VARCHAR(120) UNIQUE,
  approval_status VARCHAR(24) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  pending_erp_payload_json JSONB,
  rejection_reason TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, installment_number)
);
CREATE INDEX IF NOT EXISTS idx_installments_investor_approved ON investor_installments(investor_user_id, approval_status, due_date);

CREATE TABLE IF NOT EXISTS investor_profits (
  id BIGSERIAL PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES investor_contracts(id) ON DELETE RESTRICT,
  investor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  period_label VARCHAR(120) NOT NULL,
  gross_revenue_egp NUMERIC(14, 2) NOT NULL DEFAULT 0,
  operating_costs_egp NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_profit_egp NUMERIC(14, 2) NOT NULL DEFAULT 0,
  distribution_date DATE NOT NULL,
  payout_status VARCHAR(24) NOT NULL DEFAULT 'scheduled' CHECK (payout_status IN ('scheduled', 'distributed')),
  payout_reference VARCHAR(120),
  source VARCHAR(16) NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'erp')),
  external_erp_id VARCHAR(120) UNIQUE,
  approval_status VARCHAR(24) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  pending_erp_payload_json JSONB,
  rejection_reason TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profits_investor_approved ON investor_profits(investor_user_id, approval_status, distribution_date);

-- 7. Investor Documents, Notifications, Support Tickets
CREATE TABLE IF NOT EXISTS investor_documents (
  id BIGSERIAL PRIMARY KEY,
  investor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contract_id BIGINT REFERENCES investor_contracts(id) ON DELETE SET NULL,
  title_ar VARCHAR(255) NOT NULL,
  title_en VARCHAR(255) NOT NULL,
  doc_type VARCHAR(32) NOT NULL DEFAULT 'contract' CHECK (doc_type IN ('contract', 'receipt', 'report', 'certificate')),
  media_id BIGINT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  approval_status VARCHAR(24) NOT NULL DEFAULT 'APPROVED' CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_investor_approved ON investor_documents(investor_user_id, approval_status);

CREATE TABLE IF NOT EXISTS investor_notifications (
  id BIGSERIAL PRIMARY KEY,
  investor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_ar VARCHAR(255) NOT NULL,
  title_en VARCHAR(255) NOT NULL,
  body_ar TEXT NOT NULL,
  body_en TEXT NOT NULL,
  category VARCHAR(48) NOT NULL DEFAULT 'general',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_investor_read ON investor_notifications(investor_user_id, is_read, created_at);

CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGSERIAL PRIMARY KEY,
  ticket_number VARCHAR(64) NOT NULL UNIQUE,
  investor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'financial', 'agricultural', 'technical', 'complaint')),
  priority VARCHAR(16) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tickets_investor ON support_tickets(investor_user_id, status);

CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_staff_reply BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Immutable Audit Log & ERP Sync Ingestion Log
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(64),
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(120),
  before_json JSONB,
  after_json JSONB,
  ip_address VARCHAR(45),
  source VARCHAR(24) NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'portal', 'erp_api', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id, created_at);

CREATE TABLE IF NOT EXISTS erp_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  endpoint VARCHAR(120) NOT NULL,
  external_batch_id VARCHAR(120),
  payload_hash CHAR(64) NOT NULL,
  records_received INT NOT NULL DEFAULT 0,
  records_queued_pending INT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'partial', 'failed')),
  error_message TEXT,
  source_ip VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_erp_logs_created ON erp_sync_logs(created_at);
