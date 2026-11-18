import { guard, error, proxy, readJson } from '../../../shared.ts';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guard(request, true);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const data = await readJson(request);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !['approve', 'reject'].includes(String(data.decision)) || typeof data.report_hash !== 'string' || !/^[a-f0-9]{64}$/.test(data.report_hash)) return error(400);
    return proxy(`/tasks/${id}/decision`, { decision: data.decision, report_hash: data.report_hash });
  } catch { return error(400); }
}
