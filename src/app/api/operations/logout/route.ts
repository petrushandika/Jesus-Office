import { sessionCookie } from '../../../../lib/operations-auth.ts';
import { guard, json } from '../shared.ts';
export async function POST(request: Request) {
  const denied = guard(request, true);
  if (denied) return denied;
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('') });
}
