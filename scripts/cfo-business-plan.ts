import "../lib/env";
import { callTool, ensureScenario } from "../lib/cfo";
const scenario = "Headwind business plan (hypothesis)";
const p = "HWBP";
const v = (name: string) => `\`${p} ${name}\``;
const rows: [string, string][] = [
  ["Paying agencies (hypothesis)", "10"],
  ["Price per agency per month USD (hypothesis)", "300"],
  ["Monthly revenue", `${v("Paying agencies (hypothesis)")} * ${v("Price per agency per month USD (hypothesis)")}`],
  ["Reviews per agency per month", "4"],
  ["Crustdata credits per review (measured)", "6"],
  ["Crustdata USD per credit (unverified)", "0.05"],
  ["Model USD per review (measured tokens, with retry buffer)", "0.01"],
  ["Variable data and model cost", `${v("Paying agencies (hypothesis)")} * ${v("Reviews per agency per month")} * (${v("Crustdata credits per review (measured)")} * ${v("Crustdata USD per credit (unverified)")} + ${v("Model USD per review (measured tokens, with retry buffer)")})`],
  ["Support hours per agency per month (hypothesis)", "1"],
  ["Labor USD per hour (hypothesis)", "50"],
  ["Support labor", `${v("Paying agencies (hypothesis)")} * ${v("Support hours per agency per month (hypothesis)")} * ${v("Labor USD per hour (hypothesis)")}`],
  ["New agencies per month (hypothesis)", "2"],
  ["Setup hours per new agency (hypothesis)", "3"],
  ["Setup labor", `${v("New agencies per month (hypothesis)")} * ${v("Setup hours per new agency (hypothesis)")} * ${v("Labor USD per hour (hypothesis)")}`],
  ["Acquisition USD per new agency (hypothesis)", "200"],
  ["Acquisition", `${v("New agencies per month (hypothesis)")} * ${v("Acquisition USD per new agency (hypothesis)")}`],
  ["Hosting EC2 t3.small and disk USD per month", "17"],
  ["Observability neatlogs USD per month (unverified)", "0"],
  ["Contribution A (each agency pays its own cfo.ai)", `${v("Monthly revenue")} - ${v("Variable data and model cost")} - ${v("Support labor")}`],
  ["cfo.ai Growth plan USD per month (seen on trial)", "1500"],
  ["Contribution B (Headwind pays one cfo.ai plan)", `${v("Contribution A (each agency pays its own cfo.ai)")} - ${v("cfo.ai Growth plan USD per month (seen on trial)")}`],
  ["Fixed costs per month", `${v("Hosting EC2 t3.small and disk USD per month")} + ${v("Observability neatlogs USD per month (unverified)")} + ${v("Setup labor")} + ${v("Acquisition")}`],
  ["Net per month A", `${v("Contribution A (each agency pays its own cfo.ai)")} - ${v("Fixed costs per month")}`],
  ["Net per month B", `${v("Contribution B (Headwind pays one cfo.ai plan)")} - ${v("Fixed costs per month")}`],
  ["Starting funds USD (hypothesis)", "5000"],
  ["Runway months B (if burning)", `if(${v("Net per month B")} < 0, ${v("Starting funds USD (hypothesis)")} / (0 - ${v("Net per month B")}), 999)`],
];
await ensureScenario(scenario);
const create = { name: "Headwind business plan (monthly, hypotheses labelled)", page: "Headwind business plan", window: { granularity: "NO_GRANULARITY" }, columns: [], rows: rows.map(([n, f]) => ({ variable: `${p} ${n}`, formula: f })) };
const dry = await callTool<object>("edit_table_blocks", { scenario, create: { ...create, dry_run: true } });
console.log("dry run", JSON.stringify(dry).slice(0, 800));
if (process.argv[2] === "write") {
  const r = await callTool<object>("edit_table_blocks", { scenario, create: { ...create, readback: {} } });
  console.log(JSON.stringify(r).slice(0, 4000));
}
