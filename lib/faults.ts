export function faultEnabled(name: string): boolean {
  return (process.env.HEADWIND_FAULTS ?? "").split(",").map((s) => s.trim()).includes(name);
}
