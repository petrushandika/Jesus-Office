import { guard, error, proxy } from '../shared.ts';
export async function GET(request: Request) { return guard(request) ?? proxy('/tasks'); }
// Task creation belongs to verified source connectors, never to a manual form.
export async function POST(request: Request) { return guard(request, true) ?? error(405); }
