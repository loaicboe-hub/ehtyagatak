# Project Architecture Decision Record

Active architecture for **شركة احتياجاتك للتنمية المستدامة (Ehtyajatak for Sustainable Development)**.

---

## 1. Hosting & Runtime Stack

- **Target Production Hosting**: VPS / Dedicated Server (Node.js 22+/24 LTS behind Nginx/Caddy HTTPS reverse proxy) — *final server details pending client confirmation*.
- **Selected Backend Stack**: Native Node.js (`v24.19.0`) ES Modules (`node:http`, `node:crypto`, `node:sqlite`, `node:fs`, `node:net`/`node:tls`) directly reusing `foundation/` security, validation, i18n, mail, and SEO modules.
- **Selected Frontend Approach**: Server-Side Rendered (SSR) semantic HTML5 consuming `foundation/design-system/` tokens/base/components + brand `public/css/theme.css` + progressive enhancement `public/js/app.js`.
- **Reason for Choice**: Zero external runtime dependency risk, native RTL/LTR SSR without layout flash, direct reuse of Master Foundation `.mjs` security modules, and clean REST JSON APIs (`/api/v1/*`) ready for future mobile app clients.

---

## 2. Database Architecture

- **Target Production Engine**: PostgreSQL 15+ (`foundation/database/postgresql/001_core_schema.sql` + `002_ehtyajatak_modules.sql`).
- **Local Development/Verification Engine**: Built-in Node.js `node:sqlite` (`DB_DRIVER=sqlite`) mirroring identical relational tables, foreign keys, and constraints so the system runs and tests completely out-of-the-box without a local Postgres daemon.
- **Single-Database Rule Confirmed?**: Yes — PostgreSQL 15+ only for production VPS (never mixing MySQL and PostgreSQL).
- **Non-Destructive Migration Policy**: Strictly additive (`CREATE TABLE IF NOT EXISTS`).

---

## 3. Core Subsystem Mapping

| Capability | Implementation Location | Notes / Dependencies |
| :--- | :--- | :--- |
| Design Tokens & RTL/LTR CSS | `foundation/design-system/*` + `public/css/theme.css` | Emerald/gold palette, `Cairo` + `Plus Jakarta Sans`, logical CSS properties |
| Two-Language i18n (`ar`, `en`) | `src/i18n/{ar,en}.json` + `foundation/i18n/i18n-helper.mjs` | Default `ar` (RTL), `en` (LTR); foundation 6-lang baseline preserved |
| Authentication & Sessions | `src/security/auth.mjs`, `src/security/password.mjs` | `crypto.scrypt` (`N=16384`), HTTP-only cookies, `user_sessions`, session rotation |
| RBAC Enforcement | `config/rbac.json` + DB `roles`/`role_permissions` | `super_admin`, `admin`, `editor`, `investor_manager`, `investor` |
| Rate Limiting & Brute-Force Guard | `src/security/rate-limit.mjs` + `foundation/security/rate-limiter.mjs` | Persistent `rate_limit_buckets` table + memory store |
| Investor Portal (`/portal/*`) | `src/routes/portal.mjs`, `src/views/portal.mjs` | Enforces `investor_user_id = req.user.id AND approval_status = 'APPROVED'` |
| Admin Dashboard (`/admin/*`) | `src/routes/admin.mjs`, `src/views/admin.mjs` | Full CMS, approvals queue, investors/contracts, leads, support, audit logs, Account Settings |
| ERP Sync API (`/api/v1/erp/*`) | `src/routes/erp.mjs` | `X-ERP-API-KEY` constant-time verification; queues data in `PENDING_APPROVAL` |
| Media Uploads & Storage | `src/http/body-parser.mjs` + `foundation/security/upload-policy.mjs` | Magic bytes + MIME + extension + SHA-256; stored in `storage/uploads/` |
| SMTP / Email Delivery | `src/mail/smtp.mjs` + `foundation/mail/email-templates.mjs` | Configured solely via `.env`; fails loudly (`503`) if `SMTP_ENABLED=false` |
| SEO & Sitemap/Robots | `src/views/layout.mjs` + `foundation/seo/seo-meta.mjs` | Dynamic `ar`/`en` meta, canonical, `hreflang`, `/sitemap.xml`, `/robots.txt` |

---

## 4. API & Route Boundaries

- **Public Routes**: `/`, `/about`, `/projects`, `/invest`, `/how-it-works`, `/services`, `/news`, `/faq`, `/contact`, `/policies`, `/:lang/...`, `/sitemap.xml`, `/robots.txt`, `/api/public/*`
- **Auth Routes**: `/login`, `/forgot-password`, `/reset-password`, `/api/auth/*`
- **Investor Portal Routes** (Protected: Auth + `portal.access` + Row-Level Ownership + `APPROVED` gate): `/portal/*`, `/api/portal/*`
- **Admin Routes** (Protected: Auth + Staff RBAC + Rate Limit + CSRF): `/admin/*`, `/api/admin/*`
- **ERP Sync API Routes** (Protected: `X-ERP-API-KEY` + Rate Limit): `/api/v1/erp/*`
