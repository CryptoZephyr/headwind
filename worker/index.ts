import "../lib/env";
import os from "node:os";
import { getDb } from "../lib/db";
import { claimRun, LeaseLostError, processRun, SimulatedCrash } from "../lib/review";
import { startTelemetry, stopTelemetry } from "../lib/telemetry";

const owner = `${os.hostname()}:${process.pid}`;
const once = process.argv.includes("--once");
let stopping = false;

async function main(): Promise<void> {
  await startTelemetry("weekly-revenue-review");
  const db = getDb();
  console.log(`[worker ${owner}] started${once ? " (single pass)" : ""}`);
  while (!stopping) {
    const run = claimRun(db, owner);
    if (!run) {
      if (once) break;
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    console.log(`[worker] claimed ${run.id} (${run.kind}, step ${run.step}, attempt ${run.attempts + 1})`);
    try {
      const done = await processRun(db, run, owner);
      console.log(`[worker] ${done.id} -> ${done.status}${done.error ? `: ${done.error}` : ""}${done.trace_id ? ` trace ${done.trace_id}` : ""}`);
    } catch (e) {
      if (e instanceof SimulatedCrash) {
        console.log(`[worker] ${e.message}; exiting without releasing the lease`);
        await stopTelemetry();
        process.exit(75);
      }
      if (e instanceof LeaseLostError) console.log(`[worker] ${e.message}`);
      else throw e;
    }
  }
  await stopTelemetry();
}

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stopping = true; });

main().catch(async (e) => {
  console.error(e);
  await stopTelemetry();
  process.exit(1);
});
