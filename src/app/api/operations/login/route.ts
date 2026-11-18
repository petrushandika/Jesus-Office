import { createSession, operatorSessionKey, normalizeOperatorEmail, passwordMatches, sessionCookie, sameOrigin, LoginLimiter } from '../../../../lib/operations-auth.ts';
import { configured, error, json, readJson } from '../shared.ts';
const limiter = new LoginLimiter();
export async function POST(request: Request) {
  if (!configured()) return error(503);
  if (!sameOrigin(request)) return error(403);
  if (!limiter.allowed()) return error(429);
  try {
    const body = await readJson(request);
    const email = normalizeOperatorEmail(body.email);
    const validPassword = typeof body.password === 'string' && body.password.length <= 4096
      && passwordMatches(body.password, process.env.OFFICE_OPERATOR_PASSWORD!);
    if (!validPassword || !email || email !== normalizeOperatorEmail(process.env.OFFICE_OPERATOR_EMAIL)) {
      limiter.fail(); return error(401);
    }
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(createSession(process.env.OFFICE_SESSION_SECRET!, operatorSessionKey(process.env.OFFICE_OPERATOR_EMAIL!, process.env.OFFICE_OPERATOR_PASSWORD!))) });
  } catch { limiter.fail(); return error(400); }
}
