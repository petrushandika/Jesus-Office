import { guard, error, proxy, readJson, text, safeUrl } from '../shared.ts';
export async function GET(request: Request) { return guard(request) ?? proxy('/tasks'); }
export async function POST(request: Request) {
  const denied = guard(request, true);
  if (denied) return denied;
  try {
    const data = await readJson(request);
    if (!text(data.title, 200) || !text(data.description, 12000) || data.source !== 'manual' || (data.source_url !== undefined && !safeUrl(data.source_url))) return error(400);
    return proxy('/tasks', { title: data.title, description: data.description, source: 'manual', ...(data.source_url ? { source_url: data.source_url } : {}) });
  } catch { return error(400); }
}
