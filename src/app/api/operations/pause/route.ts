import { guard, error, proxy, readJson } from '../shared.ts';
export async function POST(request: Request) {
  const denied = guard(request, true);
  if (denied) return denied;
  try {
    const data = await readJson(request);
    if (typeof data.paused !== 'boolean') return error(400);
    return proxy('/pause', { paused: data.paused });
  } catch { return error(400); }
}
