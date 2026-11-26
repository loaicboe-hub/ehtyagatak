import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb, closeDb, queryOne, runSql } from '../db/client.mjs';
import { seedDatabase } from '../db/seed.mjs';
import { hashPassword } from '../security/password.mjs';
import { createAppServer } from '../server.mjs';
import { getEnvConfig } from '../config/env.mjs';

const tempDbPath = path.join(os.tmpdir(), `ehtyajatak-test-${Date.now()}.sqlite`);
const db = getDb(tempDbPath);
seedDatabase(db);

// Create test accounts (super_admin, editor)
const superRole = queryOne(db, "SELECT id FROM roles WHERE slug = 'super_admin'");
const editorRole = queryOne(db, "SELECT id FROM roles WHERE slug = 'editor'");
runSql(
  db,
  `INSERT INTO users (full_name, email, password_hash, role_id, preferred_language, is_active, email_verified_at)
   VALUES ('Test Super Admin', 'admin@test.local', ?, ?, 'ar', 1, datetime('now'))`,
  hashPassword('AdminStrong1234'),
  superRole.id
);
runSql(
  db,
  `INSERT INTO users (full_name, email, password_hash, role_id, preferred_language, is_active, email_verified_at)
   VALUES ('Test Editor', 'editor@test.local', ?, ?, 'en', 1, datetime('now'))`,
  hashPassword('EditorStrong1234'),
  editorRole.id
);

const server = createAppServer({ db });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;
const cfg = getEnvConfig();

function extractCookies(setCookieHeaders, store) {
  for (const h of setCookieHeaders || []) {
    const [pair] = h.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      if (v === '') delete store[k];
      else store[k] = v;
    }
  }
}

function cookieHeader(store) {
  return Object.entries(store).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function reqHttp(pathname, { method = 'GET', cookies = {}, body = null, headers = {}, redirect = 'manual' } = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    redirect,
    headers: {
      ...(Object.keys(cookies).length ? { Cookie: cookieHeader(cookies) } : {}),
      ...headers
    },
    body
  });
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  extractCookies(setCookies, cookies);
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/) || html.match(/data-csrf-token="([^"]+)"/);
  return m ? m[1] : '';
}

try {
  // 1. Public pages & RTL/LTR
  const publicRoutes = ['/', '/ar', '/en', '/about', '/projects', '/invest', '/how-it-works', '/services', '/news', '/faq', '/contact', '/policies', '/sitemap.xml', '/robots.txt'];
  for (const r of publicRoutes) {
    const res = await reqHttp(r);
    assert.equal(res.status, 200, `Expected 200 on ${r}, got ${res.status}`);
  }
  const arHome = await reqHttp('/');
  assert.ok(arHome.text.includes('dir="rtl"'), 'Default / must render Arabic RTL');
  assert.ok(arHome.text.includes('360'), 'Home calculator should include 360 sqm default');
  assert.ok(arHome.text.includes('data-hero-carousel'), 'Home must render hero carousel');
  assert.ok(arHome.text.includes('id="ehtyajatak-splash"'), 'Home must render intro splash screen');
  assert.ok(arHome.text.includes('/js/splash-init.js'), 'Home must include splash-init.js');
  for (let i = 1; i <= 4; i += 1) {
    assert.ok(arHome.text.includes(`/assets/hero/slide-${i}.jpg`), `Home must include slide-${i}.jpg`);
  }
  const enHome = await reqHttp('/en');
  assert.ok(enHome.text.includes('dir="ltr"'), '/en must render English LTR');
  assert.ok(enHome.text.includes('data-hero-carousel'), 'English home must render hero carousel');

  const sectionBannerChecks = [
    ['/about', '/assets/banners/banner-about.jpg'],
    ['/projects', '/assets/hero/slide-4.jpg'],
    ['/invest', '/assets/hero/slide-2.jpg'],
    ['/how-it-works', '/assets/banners/banner-how-it-works.jpg'],
    ['/services', '/assets/hero/slide-3.jpg'],
    ['/news', '/assets/banners/banner-news.jpg'],
    ['/faq', '/assets/banners/banner-faq.jpg'],
    ['/contact', '/assets/banners/banner-contact.jpg']
  ];
  for (const [route, imgPath] of sectionBannerChecks) {
    const pageRes = await reqHttp(route);
    assert.ok(pageRes.text.includes('class="page-hero"'), `${route} must render .page-hero banner`);
    assert.ok(pageRes.text.includes(imgPath), `${route} must include banner ${imgPath}`);
  }

  // 2. Public registration disabled & SMTP 503 guard
  const regRes = await reqHttp('/register');
  assert.equal(regRes.status, 403);
  const fpGet = await reqHttp('/forgot-password');
  const fpCookies = {};
  extractCookies(fpGet.headers.getSetCookie(), fpCookies);
  const fpRes = await reqHttp('/api/auth/forgot-password', {
    method: 'POST',
    cookies: fpCookies,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', _csrf: extractCsrf(fpGet.text) })
  });
  assert.equal(fpRes.status, 503, 'Forgot password must return 503 when SMTP_ENABLED=false');

  // 3. Public Lead Capture (CSRF + validation + persistence)
  const investCookies = {};
  const investPage = await reqHttp('/ar/invest', { cookies: investCookies });
  const leadCsrf = extractCsrf(investPage.text);
  const leadRes = await reqHttp('/api/public/leads', {
    method: 'POST',
    cookies: investCookies,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      _csrf: leadCsrf,
      lead_type: 'investment_request',
      full_name: 'أحمد المستثمر المحتمل',
      phone: '+201012345678',
      email: 'prospect@example.com',
      greenhouse_count: 4
    })
  });
  assert.equal(leadRes.status, 201);
  const savedLead = queryOne(db, "SELECT * FROM investment_leads WHERE email = 'prospect@example.com'");
  assert.equal(savedLead.greenhouse_count, 4);
  assert.equal(savedLead.estimated_total_egp, 880000);
  assert.equal(savedLead.estimated_down_payment_egp, 308000);

  // 4. Admin Login & RBAC Enforcement
  const adminCookies = {};
  const loginPage = await reqHttp('/login', { cookies: adminCookies });
  const loginRes = await reqHttp('/api/auth/login', {
    method: 'POST',
    cookies: adminCookies,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', password: 'AdminStrong1234', _csrf: extractCsrf(loginPage.text) })
  });
  assert.equal(loginRes.status, 200);

  const editorCookies = {};
  const edLoginPage = await reqHttp('/login', { cookies: editorCookies });
  await reqHttp('/api/auth/login', {
    method: 'POST',
    cookies: editorCookies,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'editor@test.local', password: 'EditorStrong1234', _csrf: extractCsrf(edLoginPage.text) })
  });
  const editorBlocked = await reqHttp('/admin/investors', { cookies: editorCookies });
  assert.equal(editorBlocked.status, 403, 'Editor must be blocked from Investor Management');

  // 5. Admin creates Investor 1, Investor 2, Contracts, Pending Greenhouse
  const adminInvPage = await reqHttp('/admin/investors', { cookies: adminCookies });
  const adminCsrf = extractCsrf(adminInvPage.text);

  const inv1Res = await reqHttp('/api/admin/investors/create', {
    method: 'POST',
    cookies: adminCookies,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      _csrf: adminCsrf,
      full_name: 'Investor One',
      email: 'inv1@test.local',
      mobile_number: '+201011111111',
      investor_code: 'INV-001',
      city: 'Cairo',
      password: 'InvestorOne1234'
    })
  });
  assert.equal(inv1Res.status, 201);

  const inv2Res = await reqHttp('/api/admin/investors/create', {
    method: 'POST',
    cookies: adminCookies,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      _csrf: adminCsrf,
      full_name: 'Investor Two',
      email: 'inv2@test.local',
      mobile_number: '+201022222222',
      investor_code: 'INV-002',
      city: 'Alexandria',
      password: 'InvestorTwo1234'
    })
  });
  assert.equal(inv2Res.status, 201);

  const inv1User = queryOne(db, "SELECT id FROM users WHERE email = 'inv1@test.local'");
  const inv2User = queryOne(db, "SELECT id FROM users WHERE email = 'inv2@test.local'");

  await reqHttp('/api/admin/contracts/create', {
    method: 'POST',
    cookies: adminCookies,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      _csrf: adminCsrf,
      investor_user_id: String(inv1User.id),
      contract_number: 'CNT-2026-101',
      greenhouse_count: '3',
      total_amount_egp: '660000',
      down_payment_egp: '231000',
      start_date: '2026-11-01'
    }).toString()
  });

  // 6. External ERP Sync API (auth check + PENDING_APPROVAL queuing)
  const erpUnauth = await reqHttp('/api/v1/erp/sync/installments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [] })
  });
  assert.equal(erpUnauth.status, 401);

  const erpInst = await reqHttp('/api/v1/erp/sync/installments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-ERP-API-KEY': cfg.erpApiKey },
    body: JSON.stringify({
      batch_id: 'ERP-BATCH-1',
      records: [{
        external_erp_id: 'ERP-INST-1',
        contract_number: 'CNT-2026-101',
        installment_number: 1,
        due_date: '2026-12-01',
        amount_egp: 50000,
        paid_amount_egp: 50000,
        paid_date: '2026-11-25',
        payment_status: 'paid',
        payment_reference: 'TRX-9988'
      }]
    })
  });
  assert.equal(erpInst.status, 202);
  const erpInstJson = JSON.parse(erpInst.text);
  assert.equal(erpInstJson.queuedPendingApproval, 1);

  const erpProf = await reqHttp('/api/v1/erp/sync/profits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-ERP-API-KEY': cfg.erpApiKey },
    body: JSON.stringify({
      batch_id: 'ERP-BATCH-2',
      records: [{
        external_erp_id: 'ERP-PROF-1',
        contract_number: 'CNT-2026-101',
        period_label: 'Q4-2026',
        gross_revenue_egp: 120000,
        operating_costs_egp: 40000,
        net_profit_egp: 80000,
        distribution_date: '2026-11-26',
        payout_status: 'distributed',
        payout_reference: 'PAY-5544'
      }]
    })
  });
  assert.equal(erpProf.status, 202);

  // 7. Investor 1 logs in: PENDING_APPROVAL records MUST NOT be visible yet!
  const inv1Cookies = {};
  const inv1LoginGet = await reqHttp('/login', { cookies: inv1Cookies });
  await reqHttp('/api/auth/login', {
    method: 'POST',
    cookies: inv1Cookies,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'inv1@test.local', password: 'InvestorOne1234', _csrf: extractCsrf(inv1LoginGet.text) })
  });

  const portalBlockedAdmin = await reqHttp('/admin', { cookies: inv1Cookies });
  assert.equal(portalBlockedAdmin.status, 303, 'Investor must be redirected away from /admin');

  const summaryBefore = JSON.parse((await reqHttp('/api/portal/summary', { cookies: inv1Cookies })).text);
  assert.equal(summaryBefore.contracts.length, 1);
  assert.equal(summaryBefore.installments.length, 0, 'Pending ERP installment must NOT be visible before admin approval');
  assert.equal(summaryBefore.profits.length, 0, 'Pending ERP profit must NOT be visible before admin approval');

  // 8. Admin approves the installment & profit
  const pendingInst = queryOne(db, "SELECT id FROM investor_installments WHERE external_erp_id = 'ERP-INST-1'");
  const pendingProf = queryOne(db, "SELECT id FROM investor_profits WHERE external_erp_id = 'ERP-PROF-1'");

  const approve1 = await reqHttp('/api/admin/approvals/review', {
    method: 'POST',
    cookies: adminCookies,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _csrf: adminCsrf, entity_type: 'installment', entity_id: pendingInst.id, decision: 'APPROVED' })
  });
  assert.equal(approve1.status, 200);

  const approve2 = await reqHttp('/api/admin/approvals/review', {
    method: 'POST',
    cookies: adminCookies,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _csrf: adminCsrf, entity_type: 'profit', entity_id: pendingProf.id, decision: 'APPROVED' })
  });
  assert.equal(approve2.status, 200);

  // Now Investor 1 sees both approved records + statement CSV
  const summaryAfter = JSON.parse((await reqHttp('/api/portal/summary', { cookies: inv1Cookies })).text);
  assert.equal(summaryAfter.installments.length, 1);
  assert.equal(summaryAfter.profits.length, 1);

  const csvRes = await reqHttp('/api/portal/statement/export.csv', { cookies: inv1Cookies });
  assert.equal(csvRes.status, 200);
  assert.ok(csvRes.text.includes('CNT-2026-101'));
  assert.ok(csvRes.text.includes('Q4-2026'));

  // 9. Strict Row-Level Isolation: Investor 2 sees 0 contracts/installments/profits and cannot reply to Investor 1 ticket
  const inv1PortalSupport = await reqHttp('/portal/support', { cookies: inv1Cookies });
  await reqHttp('/api/portal/support/tickets', {
    method: 'POST',
    cookies: inv1Cookies,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _csrf: extractCsrf(inv1PortalSupport.text), subject: 'Private Inquiry', category: 'financial', message: 'Check installment' })
  });
  const inv1Ticket = queryOne(db, 'SELECT id FROM support_tickets WHERE investor_user_id = ?', inv1User.id);

  const inv2Cookies = {};
  const inv2LoginGet = await reqHttp('/login', { cookies: inv2Cookies });
  await reqHttp('/api/auth/login', {
    method: 'POST',
    cookies: inv2Cookies,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'inv2@test.local', password: 'InvestorTwo1234', _csrf: extractCsrf(inv2LoginGet.text) })
  });
  const inv2Summary = JSON.parse((await reqHttp('/api/portal/summary', { cookies: inv2Cookies })).text);
  assert.equal(inv2Summary.contracts.length, 0);
  assert.equal(inv2Summary.installments.length, 0);
  assert.equal(inv2Summary.profits.length, 0);

  const inv2PortalProfile = await reqHttp('/portal/profile', { cookies: inv2Cookies });
  const crossReply = await reqHttp(`/api/portal/support/tickets/${inv1Ticket.id}/reply`, {
    method: 'POST',
    cookies: inv2Cookies,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _csrf: extractCsrf(inv2PortalProfile.text), message: 'Unauthorized access' })
  });
  assert.equal(crossReply.status, 404, 'Investor 2 must receive 404 on Investor 1 ticket');

  // 10. Centralized Website Settings & Calculator Update propagates to public API
  const calcUpdate = await reqHttp('/api/admin/settings/website', {
    method: 'POST',
    cookies: adminCookies,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      _csrf: adminCsrf,
      site_name_ar: 'شركة احتياجاتك للتنمية المستدامة',
      site_name_en: 'Ehtyajatak for Sustainable Development',
      greenhouse_area_sqm: 400,
      greenhouse_price_egp: 250000,
      min_greenhouses: 3,
      down_payment_percent: 35
    })
  });
  assert.equal(calcUpdate.status, 200);
  const pubSettings = JSON.parse((await reqHttp('/api/public/settings')).text);
  assert.equal(pubSettings.calculator.greenhouse_area_sqm, 400);
  assert.equal(pubSettings.calculator.greenhouse_price_egp, 250000);

  console.log('ALL EHTYAJATAK INTEGRATION TESTS PASSED (Auth, RBAC, Public Leads, Calculator Sync, ERP API, Approval Gate, Row Isolation, CSV Statement).');
} finally {
  server.close();
  try { db.close(); } catch {}
  closeDb();
  for (const f of [tempDbPath, `${tempDbPath}-wal`, `${tempDbPath}-shm`]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  }
}
