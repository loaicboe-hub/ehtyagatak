export function GET(request) {
  return new Response(JSON.stringify({ ok: true, runtime: 'web-standards' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export default function handler(req, res) {
  if (res.status && typeof res.status === 'function') {
    return res.status(200).json({ ok: true, runtime: 'node' });
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({ ok: true, runtime: 'raw' }));
}
