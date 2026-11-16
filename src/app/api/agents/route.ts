import { homedir } from "node:os";
import { join } from "node:path";
import { connection } from "next/server";
import { readSnapshot } from "@/lib/agents";

const DIR = process.env.OFFICE_RUNS_DIR ?? join(homedir(), ".hermes/cache/delegation/live");
const GATEWAY = process.env.OFFICE_GATEWAY_FILE ?? join(homedir(), ".hermes/gateway_state.json");

export async function GET() {
  await connection();
  const snapshot = await readSnapshot({ dir: DIR, gatewayFile: GATEWAY });
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
