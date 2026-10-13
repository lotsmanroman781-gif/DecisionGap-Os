/** Vercel serverless adapter for the temporary, non-commercial demo. */
import { handleRequest } from '../server/index.js';

export default async function handler(req, res) {
  // The path is carried by vercel.json's /api/:path* rewrite.
  const original = new URL(req.url || '/api/index', 'https://local.invalid');
  const raw = req.query?.path ?? original.searchParams.get('path') ?? '';
  const segments = Array.isArray(raw) ? raw : String(raw).split('/');
  if (!segments.length || segments.some(x => !/^[a-zA-Z0-9_-]+$/.test(x))) {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'API endpoint not found.' }));
    return;
  }
  const params = new URLSearchParams(original.searchParams);
  params.delete('path');
  const suffix = params.toString();
  req.url = `/api/${segments.join('/')}${suffix ? `?${suffix}` : ''}`;
  return handleRequest(req, res);
}
