import { flush, init, shutdown, trace, wrapOpenAI } from "neatlogs";
import OpenAI from "openai";

let started: Promise<void> | null = null;

export function telemetryEnabled(): boolean {
  return Boolean(process.env.NEATLOGS_API_KEY);
}

export function startTelemetry(workflowName: string): Promise<void> {
  if (!telemetryEnabled()) return Promise.resolve();
  started ??= init({ apiKey: process.env.NEATLOGS_API_KEY, endpoint: process.env.NEATLOGS_ENDPOINT || "https://ingest.neatlogs.com", workflowName });
  return started;
}

export async function stopTelemetry(): Promise<void> {
  if (!started) return;
  await flush();
  await shutdown("process exit");
  started = null;
}

export async function workflow<T>(name: string, fn: (traceId: string | null) => Promise<T>): Promise<T> {
  if (!telemetryEnabled()) return fn(null);
  return trace({ name, kind: "WORKFLOW" }, (span) => fn(span.spanContext().traceId));
}

export async function toolSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!telemetryEnabled()) return fn();
  return trace({ name, kind: "TOOL" }, () => fn());
}

let client: OpenAI | null = null;

export function modelClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.LiteLLM_API_KEY || process.env.LITELLM_API_KEY;
  if (!apiKey) throw new Error("The model gateway isn't connected (no LiteLLM key on the server).");
  const raw = new OpenAI({ baseURL: process.env.LITELLM_BASE_URL || "https://litellm.vision.aivar.app/v1", apiKey, timeout: 60_000, maxRetries: 0 });
  client = telemetryEnabled() ? wrapOpenAI(raw) : raw;
  return client;
}

export function modelName(): string {
  return process.env.HEADWIND_MODEL || "nova-micro";
}
