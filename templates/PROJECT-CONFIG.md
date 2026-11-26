# Project Configuration Worksheet

Completed for **شركة احتياجاتك للتنمية المستدامة (Ehtyajatak for Sustainable Development)**. Mirrored into `config/project.config.json`. Secrets remain strictly in `.env`.

---

## 1. Business & Project Identity

- **Project Name**: `شركة احتياجاتك للتنمية المستدامة — Ehtyajatak for Sustainable Development`
- **Project Folder / Slug**: `ehtyajatak-sustainable-dev`
- **Business Type**: `custom` (Agricultural Greenhouse Investment & Sustainable Farming Management)
- **Primary Objective / Audience**: Showcase greenhouse investment opportunities to prospective investors, capture investment/appointment leads, provide a row-isolated Private Investor Portal, and manage CMS + mandatory approval workflows + ERP ingestion in Admin.
- **Is E-Commerce?**: `No`

---

## 2. Branding & Visual Identity

- **Logo File(s)**: `/assets/logo.svg` (clean custom SVG placeholder logo for احتياجاتك للتنمية المستدامة)
- **Favicon File(s)**: `/assets/favicon.svg`
- **Color Palette**:
  - Primary Color: `#14532d` (Deep Emerald Green)
  - Primary Hover: `#0f3f22`
  - Secondary Color: `#0b2919` (Forest Dark)
  - Accent Color: `#c5922b` (Warm Earth Gold)
  - Surface / Background: `#ffffff` / `#fcfdfb`
  - Text Primary / Muted: `#0f2419` / `#4b6355`
- **Typography**:
  - Latin Font Family (EN): `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`
  - Arabic Font Family (AR): `'Cairo', 'IBM Plex Sans Arabic', Tahoma, sans-serif`
- **Design Direction**: Modern agricultural investment & corporate sustainability aesthetic with high-legibility Arabic RTL layout and crisp financial/operational clarity.

---

## 3. Website Structure & Pages

- **Core & Business Pages**:
  - [x] Home (`/`)
  - [x] About Us (`/about`)
  - [x] Projects (`/projects`)
  - [x] Greenhouse Investment & Calculator (`/invest`)
  - [x] Contracting Steps (`/how-it-works`)
  - [x] Services (`/services`)
  - [x] News (`/news`)
  - [x] FAQ (`/faq`)
  - [x] Contact Us (`/contact`)
  - [x] Policies & Investment Disclaimers (`/policies`)
  - [x] Login & Password Recovery (`/login`, `/forgot-password`, `/reset-password`)

---

## 4. Custom & Opt-In Modules

- [x] **Private Investor Portal (`/portal/*`)**: Row-isolated investor dashboard, investments, greenhouses, crops/production, profits, installments, documents, filterable account statement (CSV + printable PDF), notifications, support tickets, profile settings.
- [x] **Admin Dashboard (`/admin/*`)**: Core 11 foundation sections + Approvals Workflow (`PENDING_APPROVAL` -> `APPROVED`), Investors & Contracts Manager, Projects/News/FAQs CMS, Leads & Appointments, Support Desk, Calculator Defaults, Immutable Audit Log.
- [x] **External ERP Sync API (`/api/v1/erp/*`)**: Token-authenticated (`X-ERP-API-KEY`) ingestion queuing records in `PENDING_APPROVAL`.

---

## 5. Multilingual Configuration (Active Project Languages: 2)

Per stakeholder directive (`ONLY 2 LANGUAGES ARABIC AND ENGLISH`):
- [x] Arabic (`ar` — RTL) — **Primary Default Language**
- [x] English (`en` — LTR) — **Secondary Language**
- **Translated URL Slugs**: Supported via `/ar/...` and `/en/...` plus default `/` routing.
- **Translation Verification Status**: Starter copy marked `is_verified: false` until reviewed by company stakeholders.

---

## 6. Hosting & Database Selection

- **Target Production Hosting**: VPS / Dedicated Server (PostgreSQL 15+ schema provided at `foundation/database/postgresql/002_ehtyajatak_modules.sql`) — *awaiting client hosting credentials*.
- **Local Development Runtime**: Node.js `v24.19.0` with built-in `node:sqlite` (`DB_DRIVER=sqlite`) for immediate local verification with zero external package failures.
- **Single Primary Database Policy**: PostgreSQL 15+ for production VPS; never mixing MySQL and PostgreSQL.

---

## 7. Authentication & Email Configuration

- **Login**: Server-side DB-backed (`crypto.scrypt` + HTTP-only sessions in `user_sessions`).
- **Public User Registration**: `Disabled` (`ALLOW_PUBLIC_REGISTRATION=false`; investor accounts are created exclusively by authorized Admin/Investor Manager staff).
- **Email Verification Required?**: `Optional / Disabled for admin-provisioned investors` (`REQUIRE_EMAIL_VERIFICATION=false`), supported for email-change verification when SMTP is configured.
- **Forgot Password Flow**: Enabled with `checkSmtpConfiguration()` pre-check (`503` when SMTP unconfigured).
- **Roles**: `super_admin`, `admin`, `editor`, `investor_manager`, `investor`.

---

## 8. Centralized Contact Defaults & Integrations

- **WhatsApp / Phone / Email / Address / Hours**: Configured centrally in `website_settings` via Admin Dashboard.
- **Calculator Reference Defaults**: `360 m²` per greenhouse, `220,000 EGP`, minimum `3 greenhouses`, `35%` down payment (editable in Admin).
- **Integrations**: Configurable WhatsApp `wa.me` links, SMTP email via `.env`, External ERP Sync REST API (`/api/v1/erp/*`).
