# New Project Initialization Checklist

Use this checklist whenever a new website project is created by copying the Master Foundation folder.

---

## Phase 1 — Setup & Configuration (Zero Coding Before This)

- [ ] Copied the entire Master Foundation folder manually and renamed it for the new project (original Master Foundation untouched).
- [ ] Completed `templates/PROJECT-CONFIG.md` with business type, branding, pages, modules, hosting, and auth rules.
- [ ] Created `config/project.config.json` from `config/project.config.example.json` (no secrets included).
- [ ] Verified actual hosting environment capabilities (runtime, DB engine, SSL, SMTP availability).
- [ ] Completed `templates/PROJECT-ARCHITECTURE.md` with stack, DB engine, and migration strategy.
- [ ] Created `.env` from `.env.example` with strong random `SESSION_SECRET`, `CSRF_SECRET`, and real local/dev DB credentials.

## Phase 2 — Database & Security Foundation

- [ ] Selected the single appropriate SQL blueprint (`foundation/database/mysql/` OR `foundation/database/postgresql/`).
- [ ] Applied core schema migrations cleanly (non-destructive).
- [ ] Added only the optional business module tables required by `PROJECT-CONFIG.md`.
- [ ] Implemented server-side password hashing (Argon2id or bcrypt cost >= 12).
- [ ] Implemented server-side session management (`user_sessions`) and HTTP-only secure cookies.
- [ ] Implemented RBAC middleware (`super_admin`, `admin`, `editor`, plus any project-specific roles) enforced on every protected API endpoint.
- [ ] Implemented rate limiting on login, password reset, public forms, and API endpoints (`config/security-policy.json`).
- [ ] Implemented CSRF protection, security headers (`foundation/security/security-headers.json`), request body size caps, and safe error handling.
- [ ] Created initial Super Admin bootstrap mechanism safely (CLI/seed script or secure one-time setup — never hardcoded public passwords).

## Phase 3 — Authentication, Account Settings & Email

- [ ] Login with email/password, validation, error handling, optional remember-me, and secure logout.
- [ ] Public registration enabled ONLY if required by `PROJECT-CONFIG.md` (otherwise disabled).
- [ ] Email verification enabled if required by project security/registration rules.
- [ ] Forgot Password flow with single-use expiring hashed token and non-enumerating responses.
- [ ] Real SMTP/email service connected via `.env`, verifying delivery failures are surfaced honestly (never faked).
- [ ] Dedicated Admin **Account Settings** page connected to DB (view/edit name, email, mobile, avatar, password change verifying current password, security preferences, revoke other active sessions).

## Phase 4 — Admin Dashboard & Centralized Settings

- [ ] Admin Overview connected strictly to real DB queries (zero fabricated statistics).
- [ ] Website Content management (homepage sections, headings, descriptions, banners, CTAs).
- [ ] Pages Management (create/edit pages, visibility, SEO, translations).
- [ ] Media Library (upload validation: extension + MIME + magic bytes + size limit; safe filename & non-executable storage; preview & replace).
- [ ] Centralized **Website Settings** (name, logo, favicon, header/footer, menus, social links, copyright, languages) completely separate from Account Settings.
- [ ] Centralized **Contact Information** (WhatsApp, mobile, email, address, working hours) dynamically powering all public website links/sections.
- [ ] SEO Settings (global & per-language title, description, Open Graph, sharing images, canonical URLs, sitemap, robots).
- [ ] User Management & Roles/Permissions UI backed by server enforcement.

## Phase 5 — Six-Language System & Responsive UI

- [ ] All 6 mandatory languages active: `ar` (RTL), `en`, `fr`, `ru`, `de`, `es` (LTR).
- [ ] Navigation, header, footer, homepage, pages, forms, validation, buttons, notifications, admin UI, dynamic content, and SEO translated cleanly without unintended mixed languages.
- [ ] Language switcher persists preference, keeps user on equivalent page/translated URL, and updates `dir="rtl"` / `dir="ltr"` cleanly.
- [ ] Missing or unverified translations visible and trackable inside the Admin Dashboard (`is_verified` status respected).
- [ ] Custom industry-appropriate visual design & homepage structure built using `foundation/design-system/tokens.css` & `base.css`.
- [ ] Verified responsive layout across Desktop, Laptop, Tablet, and Mobile (touch targets, responsive tables/menus/admin sidebar, zero horizontal overflow in RTL & LTR).

## Phase 6 — Pre-Deployment (Manual Verification Only When Requested)

- [ ] `.env` configured for target production environment (`APP_ENV=production`, `APP_DEBUG=false`, `COOKIE_SECURE=true`, real SMTP & DB creds).
- [ ] Followed `docs/DEPLOYMENT-GUIDE.md` (Shared Hosting or VPS section matching actual host).
- [ ] Database and media backup procedures documented and tested.
- [ ] Run any explicit user-requested audits (e.g., Security Audit, Responsive Audit, User Journey Test) **only after user approval**.

