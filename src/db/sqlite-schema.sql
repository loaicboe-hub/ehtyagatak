-- =============================================================================
-- EHTYAJATAK FOR SUSTAINABLE DEVELOPMENT — SQLite Runtime Schema (Node 24 node:sqlite)
-- Mirrors PostgreSQL 001_core_schema.sql + 002_ehtyajatak_modules.sql
-- Policy: Additive-only; IF NOT EXISTS; Strict foreign keys & CHECK constraints.
-- =============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS media_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_name TEXT NOT NULL,
  stored_filename TEXT NOT NULL UNIQUE,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256_checksum TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT 'general',
  alt_translations TEXT,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_media_folder_created ON media_items(folder, created_at);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pending_email TEXT,
  mobile_number TEXT,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  avatar_media_id INTEGER REFERENCES media_items(id) ON DELETE SET NULL,
  preferred_language TEXT NOT NULL DEFAULT 'ar',
  is_active INTEGER NOT NULL DEFAULT 1,
  email_verified_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  remember_me INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON user_sessions(user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  requested_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_email TEXT,
  purpose TEXT NOT NULL DEFAULT 'registration',
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS website_settings (
  setting_key TEXT PRIMARY KEY,
  setting_group TEXT NOT NULL,
  value_json TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_settings_group ON website_settings(setting_group);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_key TEXT NOT NULL UNIQUE,
  template_type TEXT NOT NULL DEFAULT 'standard',
  is_visible INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS page_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL CHECK (language_code IN ('ar', 'en')),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  seo_title TEXT,
  seo_description TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image_media_id INTEGER REFERENCES media_items(id) ON DELETE SET NULL,
  canonical_url TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (page_id, language_code),
  UNIQUE (language_code, slug)
);

CREATE TABLE IF NOT EXISTS homepage_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_key TEXT NOT NULL UNIQUE,
  section_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  banner_media_id INTEGER REFERENCES media_items(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS homepage_section_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL REFERENCES homepage_sections(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL CHECK (language_code IN ('ar', 'en')),
  heading TEXT,
  subheading TEXT,
  body_json TEXT NOT NULL,
  cta_label TEXT,
  cta_url TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (section_id, language_code)
);

CREATE TABLE IF NOT EXISTS translation_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_key TEXT NOT NULL,
  language_code TEXT NOT NULL CHECK (language_code IN ('ar', 'en')),
  translated_value TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (translation_key, language_code)
);

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  language_code TEXT NOT NULL DEFAULT 'ar' CHECK (language_code IN ('ar', 'en')),
  status TEXT NOT NULL DEFAULT 'new',
  source_ip TEXT,
  handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sec_created ON security_events(created_at);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  hit_count INTEGER NOT NULL DEFAULT 0,
  window_reset_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Business Tables
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  location_ar TEXT NOT NULL,
  location_en TEXT NOT NULL,
  total_greenhouses INTEGER NOT NULL DEFAULT 0,
  available_greenhouses INTEGER NOT NULL DEFAULT 0,
  area_per_greenhouse_sqm REAL NOT NULL DEFAULT 360,
  unit_price_egp REAL NOT NULL DEFAULT 220000,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planning', 'active', 'completed', 'archived')),
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1,
  cover_media_id INTEGER REFERENCES media_items(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL CHECK (language_code IN ('ar', 'en')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  crop_types TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, language_code)
);

CREATE TABLE IF NOT EXISTS news_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  cover_media_id INTEGER REFERENCES media_items(id) ON DELETE SET NULL,
  is_published INTEGER NOT NULL DEFAULT 1,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news_post_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL CHECK (language_code IN ('ar', 'en')),
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (post_id, language_code)
);

CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT 'investment',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faq_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  faq_id INTEGER NOT NULL REFERENCES faqs(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL CHECK (language_code IN ('ar', 'en')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (faq_id, language_code)
);

CREATE TABLE IF NOT EXISTS investment_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_type TEXT NOT NULL CHECK (lead_type IN ('investment_request', 'appointment_booking', 'general_inquiry')),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  greenhouse_count INTEGER,
  estimated_total_egp REAL,
  estimated_down_payment_egp REAL,
  preferred_date TEXT,
  preferred_time TEXT,
  notes TEXT,
  language_code TEXT NOT NULL DEFAULT 'ar' CHECK (language_code IN ('ar', 'en')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'closed')),
  admin_notes TEXT,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_status_type ON investment_leads(status, lead_type, created_at);

CREATE TABLE IF NOT EXISTS investor_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  investor_code TEXT NOT NULL UNIQUE,
  national_id_masked TEXT,
  city TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS investor_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contract_number TEXT NOT NULL UNIQUE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  greenhouse_count INTEGER NOT NULL CHECK (greenhouse_count > 0),
  total_amount_egp REAL NOT NULL CHECK (total_amount_egp >= 0),
  down_payment_egp REAL NOT NULL CHECK (down_payment_egp >= 0),
  remaining_amount_egp REAL NOT NULL CHECK (remaining_amount_egp >= 0),
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'suspended')),
  document_media_id INTEGER REFERENCES media_items(id) ON DELETE SET NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contracts_investor ON investor_contracts(investor_user_id, status);

CREATE TABLE IF NOT EXISTS greenhouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES investor_contracts(id) ON DELETE RESTRICT,
  investor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  greenhouse_number TEXT NOT NULL UNIQUE,
  area_sqm REAL NOT NULL DEFAULT 360,
  location_label TEXT NOT NULL,
  current_crop_ar TEXT,
  current_crop_en TEXT,
  operational_status TEXT NOT NULL DEFAULT 'preparing' CHECK (operational_status IN ('preparing', 'planted', 'harvesting', 'maintenance')),
  external_erp_id TEXT UNIQUE,
  approval_status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  pending_erp_payload_json TEXT,
  rejection_reason TEXT,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_greenhouses_investor_approved ON greenhouses(investor_user_id, approval_status);

CREATE TABLE IF NOT EXISTS crop_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  greenhouse_id INTEGER NOT NULL REFERENCES greenhouses(id) ON DELETE CASCADE,
  investor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  season_name TEXT NOT NULL,
  crop_name_ar TEXT NOT NULL,
  crop_name_en TEXT NOT NULL,
  stage_ar TEXT NOT NULL,
  stage_en TEXT NOT NULL,
  yield_kg REAL NOT NULL DEFAULT 0,
  sales_revenue_egp REAL NOT NULL DEFAULT 0,
  recorded_date TEXT NOT NULL,
  notes_ar TEXT,
  notes_en TEXT,
  source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'erp')),
  external_erp_id TEXT UNIQUE,
  approval_status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  rejection_reason TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_crops_investor_approved ON crop_updates(investor_user_id, approval_status, recorded_date);

CREATE TABLE IF NOT EXISTS investor_installments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES investor_contracts(id) ON DELETE RESTRICT,
  investor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  installment_number INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  amount_egp REAL NOT NULL CHECK (amount_egp >= 0),
  paid_amount_egp REAL NOT NULL DEFAULT 0 CHECK (paid_amount_egp >= 0),
  paid_date TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'overdue')),
  payment_reference TEXT,
  receipt_media_id INTEGER REFERENCES media_items(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'erp')),
  external_erp_id TEXT UNIQUE,
  approval_status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  pending_erp_payload_json TEXT,
  rejection_reason TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (contract_id, installment_number)
);
CREATE INDEX IF NOT EXISTS idx_installments_investor_approved ON investor_installments(investor_user_id, approval_status, due_date);

CREATE TABLE IF NOT EXISTS investor_profits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES investor_contracts(id) ON DELETE RESTRICT,
  investor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  period_label TEXT NOT NULL,
  gross_revenue_egp REAL NOT NULL DEFAULT 0,
  operating_costs_egp REAL NOT NULL DEFAULT 0,
  net_profit_egp REAL NOT NULL DEFAULT 0,
  distribution_date TEXT NOT NULL,
  payout_status TEXT NOT NULL DEFAULT 'scheduled' CHECK (payout_status IN ('scheduled', 'distributed')),
  payout_reference TEXT,
  source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'erp')),
  external_erp_id TEXT UNIQUE,
  approval_status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  pending_erp_payload_json TEXT,
  rejection_reason TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_profits_investor_approved ON investor_profits(investor_user_id, approval_status, distribution_date);

CREATE TABLE IF NOT EXISTS investor_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contract_id INTEGER REFERENCES investor_contracts(id) ON DELETE SET NULL,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'contract' CHECK (doc_type IN ('contract', 'receipt', 'report', 'certificate')),
  media_id INTEGER NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_docs_investor_approved ON investor_documents(investor_user_id, approval_status);

CREATE TABLE IF NOT EXISTS investor_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  body_ar TEXT NOT NULL,
  body_en TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_investor_read ON investor_notifications(investor_user_id, is_read, created_at);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number TEXT NOT NULL UNIQUE,
  investor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'financial', 'agricultural', 'technical', 'complaint')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_investor ON support_tickets(investor_user_id, status);

CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_staff_reply INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  ip_address TEXT,
  source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'portal', 'erp_api', 'system')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id, created_at);

CREATE TABLE IF NOT EXISTS erp_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL,
  external_batch_id TEXT,
  payload_hash TEXT NOT NULL,
  records_received INTEGER NOT NULL DEFAULT 0,
  records_queued_pending INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'partial', 'failed')),
  error_message TEXT,
  source_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
