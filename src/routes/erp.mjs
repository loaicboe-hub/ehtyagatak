import crypto from 'node:crypto';
import { queryOne, runSql, withTransaction } from '../db/client.mjs';
import { getClientIp, logAudit, logSecurityEvent, verifyErpApiKey } from '../security/auth.mjs';
import { getAppRateLimiter } from '../security/rate-limit.mjs';
import { sendJson } from '../http/response.mjs';
import { stripControlChars } from '../../foundation/security/input-sanitizer.mjs';

export async function handleErpApiRequest({ req, res, pathname, db }) {
  if (!pathname.startsWith('/api/v1/erp/')) return false;

  const ip = getClientIp(req);
  const limiter = getAppRateLimiter(db);
  const rate = await limiter.check('erpSync', ip);
  if (!rate.allowed) {
    return sendJson(res, 429, { error: 'ERP sync rate limit exceeded.' }), true;
  }

  const keyCheck = verifyErpApiKey(req);
  if (!keyCheck.configured) {
    return sendJson(res, 503, { error: 'ERP_API_KEY is not configured on the server.' }), true;
  }
  if (!keyCheck.valid) {
    logSecurityEvent(db, { eventType: 'erp.auth.failed', severity: 'warning', ipAddress: ip, details: { pathname } });
    return sendJson(res, 401, { error: 'Invalid X-ERP-API-KEY.' }), true;
  }

  if (pathname === '/api/v1/erp/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, service: 'ehtyajatak-erp-sync', approvalMode: 'PENDING_APPROVAL' }), true;
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' }), true;

  const body = req._parsedBody?.fields || {};
  const records = Array.isArray(body.records) ? body.records : [];
  const batchId = stripControlChars(body.batch_id || `BATCH-${Date.now()}`);
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');

  if (records.length === 0) {
    return sendJson(res, 400, { error: 'records array is required.' }), true;
  }

  let queued = 0;
  const errors = [];

  try {
    withTransaction(db, () => {
      if (pathname === '/api/v1/erp/sync/greenhouses') {
        for (const rec of records) {
          const erpId = stripControlChars(rec.external_erp_id || '');
          const contractNo = stripControlChars(rec.contract_number || '');
          const ghNo = stripControlChars(rec.greenhouse_number || '');
          const contract = queryOne(db, 'SELECT id, investor_user_id, project_id FROM investor_contracts WHERE contract_number = ?', contractNo);
          if (!erpId || !contract || !ghNo) {
            errors.push({ external_erp_id: erpId, error: 'Missing external_erp_id, greenhouse_number, or unknown contract_number.' });
            continue;
          }
          const existing = queryOne(db, 'SELECT id, approval_status FROM greenhouses WHERE external_erp_id = ? OR greenhouse_number = ?', erpId, ghNo);
          if (existing) {
            runSql(
              db,
              `UPDATE greenhouses SET external_erp_id = ?, approval_status = 'PENDING_APPROVAL', pending_erp_payload_json = ?, updated_at = datetime('now') WHERE id = ?`,
              erpId,
              JSON.stringify({
                operational_status: rec.operational_status,
                current_crop_ar: rec.current_crop_ar,
                current_crop_en: rec.current_crop_en
              }),
              existing.id
            );
          } else {
            runSql(
              db,
              `INSERT INTO greenhouses (contract_id, investor_user_id, project_id, greenhouse_number, area_sqm, location_label, current_crop_ar, current_crop_en, operational_status, external_erp_id, approval_status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL')`,
              contract.id,
              contract.investor_user_id,
              contract.project_id,
              ghNo,
              Number(rec.area_sqm || 360),
              stripControlChars(rec.location_label || 'Main Sector'),
              stripControlChars(rec.current_crop_ar || ''),
              stripControlChars(rec.current_crop_en || ''),
              ['preparing', 'planted', 'harvesting', 'maintenance'].includes(rec.operational_status) ? rec.operational_status : 'preparing',
              erpId
            );
          }
          queued += 1;
        }
      } else if (pathname === '/api/v1/erp/sync/installments') {
        for (const rec of records) {
          const erpId = stripControlChars(rec.external_erp_id || '');
          const contractNo = stripControlChars(rec.contract_number || '');
          const contract = queryOne(db, 'SELECT id, investor_user_id FROM investor_contracts WHERE contract_number = ?', contractNo);
          if (!erpId || !contract || !rec.installment_number || !rec.due_date) {
            errors.push({ external_erp_id: erpId, error: 'Invalid installment payload or unknown contract_number.' });
            continue;
          }
          const existing = queryOne(db, 'SELECT id FROM investor_installments WHERE external_erp_id = ? OR (contract_id = ? AND installment_number = ?)', erpId, contract.id, Number(rec.installment_number));
          if (existing) {
            runSql(
              db,
              `UPDATE investor_installments SET external_erp_id = ?, source = 'erp', approval_status = 'PENDING_APPROVAL', pending_erp_payload_json = ?, updated_at = datetime('now') WHERE id = ?`,
              erpId,
              JSON.stringify({
                paid_amount_egp: Number(rec.paid_amount_egp ?? 0),
                paid_date: rec.paid_date || null,
                payment_status: rec.payment_status || 'paid',
                payment_reference: rec.payment_reference || null
              }),
              existing.id
            );
          } else {
            runSql(
              db,
              `INSERT INTO investor_installments (contract_id, investor_user_id, installment_number, due_date, amount_egp, paid_amount_egp, paid_date, payment_status, payment_reference, source, external_erp_id, approval_status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'erp', ?, 'PENDING_APPROVAL')`,
              contract.id,
              contract.investor_user_id,
              Number(rec.installment_number),
              stripControlChars(rec.due_date),
              Number(rec.amount_egp || 0),
              Number(rec.paid_amount_egp || 0),
              rec.paid_date ? stripControlChars(rec.paid_date) : null,
              ['pending', 'partial', 'paid', 'overdue'].includes(rec.payment_status) ? rec.payment_status : 'pending',
              rec.payment_reference ? stripControlChars(rec.payment_reference) : null,
              erpId
            );
          }
          queued += 1;
        }
      } else if (pathname === '/api/v1/erp/sync/profits') {
        for (const rec of records) {
          const erpId = stripControlChars(rec.external_erp_id || '');
          const contractNo = stripControlChars(rec.contract_number || '');
          const contract = queryOne(db, 'SELECT id, investor_user_id FROM investor_contracts WHERE contract_number = ?', contractNo);
          if (!erpId || !contract || !rec.period_label || !rec.distribution_date) {
            errors.push({ external_erp_id: erpId, error: 'Invalid profit payload or unknown contract_number.' });
            continue;
          }
          const existing = queryOne(db, 'SELECT id FROM investor_profits WHERE external_erp_id = ?', erpId);
          if (existing) {
            runSql(
              db,
              `UPDATE investor_profits SET source = 'erp', approval_status = 'PENDING_APPROVAL', pending_erp_payload_json = ?, updated_at = datetime('now') WHERE id = ?`,
              JSON.stringify({
                gross_revenue_egp: Number(rec.gross_revenue_egp || 0),
                operating_costs_egp: Number(rec.operating_costs_egp || 0),
                net_profit_egp: Number(rec.net_profit_egp || 0),
                payout_status: rec.payout_status || 'scheduled',
                payout_reference: rec.payout_reference || null
              }),
              existing.id
            );
          } else {
            runSql(
              db,
              `INSERT INTO investor_profits (contract_id, investor_user_id, period_label, gross_revenue_egp, operating_costs_egp, net_profit_egp, distribution_date, payout_status, payout_reference, source, external_erp_id, approval_status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'erp', ?, 'PENDING_APPROVAL')`,
              contract.id,
              contract.investor_user_id,
              stripControlChars(rec.period_label),
              Number(rec.gross_revenue_egp || 0),
              Number(rec.operating_costs_egp || 0),
              Number(rec.net_profit_egp || 0),
              stripControlChars(rec.distribution_date),
              ['scheduled', 'distributed'].includes(rec.payout_status) ? rec.payout_status : 'scheduled',
              rec.payout_reference ? stripControlChars(rec.payout_reference) : null,
              erpId
            );
          }
          queued += 1;
        }
      } else {
        throw new Error('Unknown ERP sync endpoint');
      }

      runSql(
        db,
        `INSERT INTO erp_sync_logs (endpoint, external_batch_id, payload_hash, records_received, records_queued_pending, status, error_message, source_ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        pathname,
        batchId,
        payloadHash,
        records.length,
        queued,
        errors.length > 0 ? (queued > 0 ? 'partial' : 'failed') : 'queued',
        errors.length > 0 ? JSON.stringify(errors) : null,
        ip
      );

      logAudit(db, {
        actorUserId: null,
        actorRole: 'erp_system',
        action: 'erp.sync.ingested',
        entityType: 'erp_batch',
        entityId: batchId,
        after: { endpoint: pathname, received: records.length, queued },
        ipAddress: ip,
        source: 'erp_api'
      });
    });

    return sendJson(res, 202, {
      ok: true,
      batchId,
      received: records.length,
      queuedPendingApproval: queued,
      errors
    }), true;
  } catch (err) {
    return sendJson(res, 400, { error: err.message }), true;
  }
}
