import { getSecurityHeaders } from '../security/auth.mjs';

export function sendHtml(res, statusCode, html, opts = {}) {
  const headers = {
    ...getSecurityHeaders({ noReferrer: opts.noReferrer }),
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': opts.cacheControl || 'no-store'
  };
  res.writeHead(statusCode, headers);
  res.end(html);
}

export function sendJson(res, statusCode, payload, opts = {}) {
  const headers = {
    ...getSecurityHeaders({ noReferrer: opts.noReferrer }),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

export function sendRedirect(res, location, statusCode = 303) {
  const headers = {
    ...getSecurityHeaders(),
    Location: location
  };
  res.writeHead(statusCode, headers);
  res.end();
}

export function sendCsv(res, filename, rows) {
  const headers = {
    ...getSecurityHeaders(),
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
    'Cache-Control': 'no-store'
  };
  const escapeCell = (val) => {
    let s = String(val ?? '');
    // Prevent CSV formula injection in Excel
    if (/^[=+\-@\t\r]/.test(s)) {
      s = `'${s}`;
    }
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csvBody = '\uFEFF' + rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
  res.writeHead(200, headers);
  res.end(csvBody);
}
