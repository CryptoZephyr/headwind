const BASE = "https://api.crustdata.com";

export class ProviderError extends Error {
  constructor(message: string, readonly kind: "auth" | "credits" | "rate_limit" | "unavailable" | "bad_response") {
    super(message);
  }
}

async function post<T>(pathName: string, body: object): Promise<{ data: T; credits: number | null }> {
  const key = process.env.CRUSTDATA_API_KEY;
  if (!key) throw new ProviderError("Crustdata isn't connected (no API key on the server).", "auth");
  let res: Response;
  try {
    res = await fetch(`${BASE}${pathName}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-api-version": "2025-11-01" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new ProviderError("Crustdata didn't answer in time.", "unavailable");
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError("Crustdata rejected the API key.", "auth");
  if (res.status === 402) throw new ProviderError("Crustdata credits are used up.", "credits");
  if (res.status === 429) throw new ProviderError("Crustdata rate limit reached. Try again in a minute.", "rate_limit");
  if (!res.ok) throw new ProviderError(`Crustdata returned an error (HTTP ${res.status}).`, "unavailable");
  const credits = Number(res.headers.get("x-credits-used") ?? res.headers.get("x-credits-consumed") ?? NaN);
  return { data: (await res.json()) as T, credits: Number.isNaN(credits) ? null : credits };
}

export interface CompanyCandidate {
  companyId: string;
  name: string;
  primaryDomain: string;
  confidence: number;
}

export interface CompanySnapshot {
  candidates: CompanyCandidate[];
  openingsCount: number | null;
  recentTitles: string[];
  timeseries: { date: string; openJobs: number }[];
  raw: unknown;
  credits: number | null;
}

interface EnrichMatch {
  confidence_score: number;
  company_data: {
    crustdata_company_id: number;
    basic_info?: { name?: string; primary_domain?: string };
    hiring?: { openings_count?: number | string; recent_titles_csv?: string; open_jobs_timeseries?: { date: string; open_jobs: number }[] | string };
  };
}

export async function fetchCompany(domain: string): Promise<CompanySnapshot> {
  const { data, credits } = await post<{ matched_on: string; matches: EnrichMatch[] }[]>("/company/enrich", { domains: [domain], fields: ["basic_info", "hiring"] });
  if (!Array.isArray(data)) throw new ProviderError("Crustdata sent a response Headwind couldn't read.", "bad_response");
  const matches = data[0]?.matches ?? [];
  const candidates = matches.map((m) => ({
    companyId: String(m.company_data.crustdata_company_id),
    name: m.company_data.basic_info?.name ?? "",
    primaryDomain: (m.company_data.basic_info?.primary_domain ?? "").toLowerCase(),
    confidence: m.confidence_score,
  }));
  const hiring = matches[0]?.company_data.hiring;
  const series = typeof hiring?.open_jobs_timeseries === "string" ? [] : (hiring?.open_jobs_timeseries ?? []);
  const count = hiring?.openings_count;
  return {
    candidates,
    openingsCount: count === undefined || count === null || count === "" ? null : Number(count),
    recentTitles: (hiring?.recent_titles_csv ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    timeseries: series.map((p) => ({ date: p.date.slice(0, 10), openJobs: p.open_jobs })),
    raw: data,
    credits,
  };
}

export interface Listing {
  title: string;
  url: string | null;
  location: string | null;
  dateAdded: string | null;
}

export interface ListingSnapshot {
  listings: Listing[];
  totalCount: number | null;
  complete: boolean;
  filters: object;
  credits: number | null;
}

interface JobRow {
  job_details?: { title?: string; url?: string };
  location?: { raw?: string };
  metadata?: { date_added?: string };
}

export function cleanRoleTitle(roleTitle: string): string {
  return roleTitle.replace(/\(sample\)/gi, "").trim();
}

export async function fetchListings(companyId: string, roleTitle: string, since: string, limit = 50): Promise<ListingSnapshot> {
  const filters = {
    op: "and",
    conditions: [
      { field: "company.basic_info.company_id", type: "=", value: Number(companyId) },
      { field: "job_details.title", type: "(.)", value: cleanRoleTitle(roleTitle) },
      { field: "metadata.date_added", type: "=>", value: since },
    ],
  };
  const { data, credits } = await post<{ job_listings?: JobRow[]; next_cursor?: string | null; total_count?: number }>("/job/search", {
    filters,
    fields: ["job_details.title", "job_details.url", "location.raw", "metadata.date_added"],
    sorts: [{ field: "metadata.date_added", order: "desc" }],
    limit,
  });
  if (!Array.isArray(data.job_listings)) throw new ProviderError("Crustdata sent a job response Headwind couldn't read.", "bad_response");
  const listings = data.job_listings.map((j) => ({
    title: j.job_details?.title ?? "",
    url: j.job_details?.url ?? null,
    location: j.location?.raw ?? null,
    dateAdded: j.metadata?.date_added ?? null,
  }));
  const total = typeof data.total_count === "number" ? data.total_count : null;
  return { listings, totalCount: total, complete: !data.next_cursor, filters, credits };
}

export function titleMatches(listingTitle: string, roleTitle: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\(sample\)/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const want = norm(roleTitle);
  const have = new Set(norm(listingTitle));
  return want.length > 0 && want.every((w) => have.has(w));
}
