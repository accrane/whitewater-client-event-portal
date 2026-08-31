import { createHash } from "node:crypto";

import { querySoql, type SoqlRecord } from "@/lib/salesforce/client";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";

// Shared engine for Salesforce → staging pulls (docs/ecosystem-manual.md §4).
// Each object (Contact, Account, Opportunity) supplies a spec: the SOQL
// fields, a mapper to its staging row, and typed hash-load/upsert callbacks.
// The engine handles watermarks, run logging, and change detection, so all
// pulls stay idempotent: unchanged records (same content hash) are skipped.

export type SfPullObject = "contact" | "account" | "opportunity";

type ServiceClient = ReturnType<typeof createServiceRoleSupabaseClient>;

export type ObjectPullSpec<Insert extends { sf_id: string; content_hash: string }> = {
  /** Salesforce API object name, e.g. "Opportunity" */
  sfObject: string;
  /** sf_pull_runs.sf_object value */
  runObject: SfPullObject;
  fields: readonly string[];
  map: (record: SoqlRecord) => Insert;
  loadExistingHashes: (supabase: ServiceClient) => Promise<Map<string, string>>;
  upsert: (supabase: ServiceClient, rows: Insert[]) => Promise<void>;
};

export type PullResult = {
  object: SfPullObject;
  mode: "full" | "incremental";
  seen: number;
  upserted: number;
  watermark: string | null;
};

export function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function relationName(
  record: SoqlRecord,
  relation: string,
): string | null {
  const related = record[relation];
  if (related && typeof related === "object" && "Name" in related) {
    return str((related as SoqlRecord).Name);
  }
  return null;
}

// Hash of the mapped source content, excluding Salesforce timestamps so a
// no-op save there doesn't count as a change here.
export function contentHash(content: Record<string, unknown>): string {
  const {
    sf_created_at,
    sf_modified_at,
    ...rest
  } = content;
  void sf_created_at;
  void sf_modified_at;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

export function rawRecord(record: SoqlRecord): SoqlRecord {
  const { attributes, ...raw } = record;
  void attributes;
  return raw;
}

// Pages through a staging table's (sf_id, content_hash) pairs; shared by the
// per-object loadExistingHashes callbacks.
export async function loadHashPages(
  fetchPage: (
    from: number,
    to: number,
  ) => Promise<{ sf_id: string; content_hash: string }[]>,
): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const page = await fetchPage(from, from + 999);
    for (const row of page) hashes.set(row.sf_id, row.content_hash);
    if (page.length < 1000) break;
  }
  return hashes;
}

export async function runObjectPull<
  Insert extends { sf_id: string; content_hash: string },
>(
  spec: ObjectPullSpec<Insert>,
  requestedMode: "full" | "incremental" = "incremental",
): Promise<PullResult> {
  const supabase = createServiceRoleSupabaseClient();

  let since: string | null = null;
  if (requestedMode === "incremental") {
    const { data: lastRun } = await supabase
      .from("sf_pull_runs")
      .select("watermark")
      .eq("sf_object", spec.runObject)
      .not("watermark", "is", null)
      .is("error", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    since = lastRun?.watermark ?? null;
  }
  const mode: "full" | "incremental" = since ? "incremental" : "full";

  const { data: run, error: runError } = await supabase
    .from("sf_pull_runs")
    .insert({ mode, sf_object: spec.runObject })
    .select("id")
    .single();
  if (runError || !run) {
    throw new Error(`Could not record pull run: ${runError?.message}`);
  }

  const existingHashes = await spec.loadExistingHashes(supabase);

  // SOQL datetime literals are unquoted ISO; Salesforce hands back "+0000"
  // offsets it won't accept as input, so normalize to Z (no milliseconds).
  const sinceLiteral = since
    ? new Date(since).toISOString().replace(/\.\d{3}Z$/, "Z")
    : null;
  const soql =
    `SELECT ${spec.fields.join(", ")} FROM ${spec.sfObject}` +
    (sinceLiteral ? ` WHERE SystemModstamp >= ${sinceLiteral}` : "") +
    " ORDER BY SystemModstamp ASC";

  let seen = 0;
  let upserted = 0;
  let watermark: string | null = since;

  try {
    await querySoql(soql, async (records) => {
      seen += records.length;

      const last = records[records.length - 1];
      const stamp = str(last.SystemModstamp);
      if (stamp && (!watermark || stamp > watermark)) watermark = stamp;

      const changed = records
        .map(spec.map)
        .filter((row) => existingHashes.get(row.sf_id) !== row.content_hash);
      if (changed.length === 0) return;

      await spec.upsert(supabase, changed);
      upserted += changed.length;
    });

    await supabase
      .from("sf_pull_runs")
      .update({
        finished_at: new Date().toISOString(),
        watermark,
        records_seen: seen,
        records_upserted: upserted,
      })
      .eq("id", run.id);
  } catch (error) {
    await supabase
      .from("sf_pull_runs")
      .update({
        finished_at: new Date().toISOString(),
        records_seen: seen,
        records_upserted: upserted,
        error: error instanceof Error ? error.message : String(error),
      })
      .eq("id", run.id);
    throw error;
  }

  return { object: spec.runObject, mode, seen, upserted, watermark };
}
