import { SESSION_COOKIE, verifySession, sameOrigin, readJson } from '../../../lib/operations-auth.ts';

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
export const error = (status: number) => json({ error: status === 401 ? 'Authentication required.' : status === 429 ? 'Too many attempts. Try later.' : 'Operation unavailable or invalid request.' }, status);
export function configured() {
  return !!process.env.OFFICE_OPERATOR_PASSWORD && (process.env.OFFICE_SESSION_SECRET?.length ?? 0) >= 32;
}
export function guard(request: Request, mutation = false): Response | null {
  if (!configured()) return error(503);
  if (mutation && !sameOrigin(request)) return error(403);
  const token = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
  return verifySession(token, process.env.OFFICE_SESSION_SECRET!, process.env.OFFICE_OPERATOR_PASSWORD!) ? null : error(401);
}
export { readJson };
export const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export function safeUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}

// Fixed upstream origin and allowlisted paths only. Never follow upstream redirects.
export async function proxy(path: string, body?: Record<string, unknown>) {
  if (!/^\/(tasks|pause|tasks\/[A-Za-z0-9_-]{1,128}\/decision)$/.test(path)) return error(400);
  const token = process.env.OFFICE_OPS_TOKEN;
  if (!token) return error(503);
  try {
    const upstream = await fetch(`http://127.0.0.1:18160${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) { await upstream.body?.cancel(); return error([400, 404, 409, 422, 429].includes(upstream.status) ? upstream.status : 502); }
    // Do not expose upstream error bodies, headers, redirects or credentials.
    const reader = upstream.body?.getReader();
    if (!reader) return error(502);
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2_097_152) return error(502);
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    return json(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch { return error(502); }
}
