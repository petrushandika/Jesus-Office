import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = '__Host-office_operator';
const SESSION_SECONDS = 8 * 3600;
const digest = (value: string) => createHash('sha256').update(value).digest();

export function passwordMatches(candidate: string, expected: string): boolean {
  return timingSafeEqual(digest(candidate), digest(expected)) && expected.length > 0;
}

export function createSession(secret: string, password: string, now = Math.floor(Date.now() / 1000)): string {
  if (secret.length < 32 || !password) throw new Error('Unavailable');
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + SESSION_SECONDS, nonce: randomBytes(16).toString('hex') })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).update(digest(password)).digest('base64url')}`;
}

export function verifySession(token: string | undefined, secret: string, password: string, now = Math.floor(Date.now() / 1000)): boolean {
  if (!token || token.length > 1024 || secret.length < 32 || !password) return false;
  try {
    const [payload, signature, extra] = token.split('.');
    if (extra !== undefined || !payload || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
    const expected = createHmac('sha256', secret).update(payload).update(digest(password)).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'base64url'))) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isSafeInteger(data.iat) && Number.isSafeInteger(data.exp) && data.iat <= now && data.exp === data.iat + SESSION_SECONDS && now < data.exp;
  } catch { return false; }
}

export function sameOrigin(request: Request, publicOrigin = process.env.OFFICE_PUBLIC_ORIGIN ?? 'https://office.petrushandika.com'): boolean {
  try {
    const expected = publicOrigin ?? new URL(request.url).origin;
    const parsed = new URL(expected);
    if (parsed.origin !== expected || !['http:', 'https:'].includes(parsed.protocol)) return false;
    return request.headers.get('origin') === expected;
  } catch { return false; }
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${token ? SESSION_SECONDS : 0}`;
}

// One process-wide bucket: constant memory, no spoofable client/IP identity.
// This intentionally trades shared operator availability for fail-closed throttling.
export class LoginLimiter {
  private failures = 0;
  private until = 0;
  allowed(now = Date.now()): boolean {
    if (now >= this.until) { this.failures = 0; this.until = now + 900_000; }
    return this.failures < 10;
  }
  fail(now = Date.now()): void { this.allowed(now); this.failures++; }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new Error('Invalid request');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Invalid request');
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16_384) throw new Error('Invalid request');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid request');
  return data as Record<string, unknown>;
}
