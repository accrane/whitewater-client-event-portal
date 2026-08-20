import { createHash } from "node:crypto";

import { querySoql, type SoqlRecord } from "@/lib/salesforce/client";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// Salesforce → sf_contacts staging pull (docs/ecosystem-manual.md §4).
// Idempotent: unchanged contacts (same content hash) are skipped, so re-runs
// and incremental syncs only touch rows that actually changed in Salesforce.

const CONTACT_FIELDS = [
  "Id",
  "FirstName",
  "LastName",
  "Email",
  "Phone",
  "Title",
  "AccountId",
  "Account.Name",
  "MailingStreet",
  "MailingCity",
  "MailingState",
  "MailingPostalCode",
  "MailingCountry",
  "LeadSource",
  "Description",
  "OwnerId",
  "Owner.Name",
  "CreatedDate",
  "LastModifiedDate",
  "SystemModstamp",
] as const;

type SfContactInsert = Database["public"]["Tables"]["sf_contacts"]["Insert"];

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function relationName(record: SoqlRecord, relation: string): string | null {
  const related = record[relation];
  if (related && typeof related === "object" && "Name" in related) {
    return str((related as SoqlRecord).Name);
  }
  return null;
}

function mapContact(record: SoqlRecord): SfContactInsert {
  const mapped = {
    sf_id: String(record.Id),
    first_name: str(record.FirstName),
    last_name: str(record.LastName),
    email: str(record.Email),
    phone: str(record.Phone),
    title: str(record.Title),
    account_id: str(record.AccountId),
    account_name: relationName(record, "Account"),
    mailing_street: str(record.MailingStreet),
    mailing_city: str(record.MailingCity),
    mailing_state: str(record.MailingState),
    mailing_postal_code: str(record.MailingPostalCode),
    mailing_country: str(record.MailingCountry),
    lead_source: str(record.LeadSource),
    description: str(record.Description),
    owner_id: str(record.OwnerId),
    owner_name: relationName(record, "Owner"),
    sf_created_at: str(record.CreatedDate),
    sf_modified_at: str(record.LastModifiedDate),
  };

  // Hash only source content (not timestamps), so a no-op Salesforce save
  // doesn't count as a change.
  const { sf_created_at, sf_modified_at, ...content } = mapped;
  void sf_created_at;
  void sf_modified_at;
  const contentHash = createHash("sha256")
    .update(JSON.stringify(content))
    .digest("hex");

  const { attributes, ...raw } = record;
  void attributes;

  return {
    ...mapped,
    raw: raw as SfContactInsert["raw"],
    content_hash: contentHash,
    pulled_at: new Date().toISOString(),
  };
}

export type PullResult = {
  mode: "full" | "incremental";
  seen: number;
  upserted: number;
  watermark: string | null;
};

// Pulls Contacts from Salesforce into sf_contacts. Incremental mode resumes
// from the last successful run's watermark (max SystemModstamp seen);
// without a watermark it falls back to a full pull.
export async function pullSalesforceContacts(
  requestedMode: "full" | "incremental" = "incremental",
): Promise<PullResult> {
  const supabase = createServiceRoleSupabaseClient();

  let since: string | null = null;
  if (requestedMode === "incremental") {
    const { data: lastRun } = await supabase
      .from("sf_pull_runs")
      .select("watermark")
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
    .insert({ mode })
    .select("id")
    .single();
  if (runError || !run) {
    throw new Error(`Could not record pull run: ${runError?.message}`);
  }

  // Existing hashes let us skip contacts that haven't changed.
  const existingHashes = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("sf_contacts")
      .select("sf_id, content_hash")
      .range(from, from + 999);
    if (error) throw new Error(`Could not load existing hashes: ${error.message}`);
    for (const row of data) existingHashes.set(row.sf_id, row.content_hash);
    if (data.length < 1000) break;
  }

  // SOQL datetime literals are unquoted ISO; Salesforce hands back "+0000"
  // offsets it won't accept as input, so normalize to Z (no milliseconds).
  const sinceLiteral = since
    ? new Date(since).toISOString().replace(/\.\d{3}Z$/, "Z")
    : null;
  const soql =
    `SELECT ${CONTACT_FIELDS.join(", ")} FROM Contact` +
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
        .map(mapContact)
        .filter((row) => existingHashes.get(row.sf_id) !== row.content_hash);
      if (changed.length === 0) return;

      const { error } = await supabase
        .from("sf_contacts")
        .upsert(changed, { onConflict: "sf_id" });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
      upserted += changed.length;
    });

    await supabase
      .from("sf_pull_runs")
      .update({
        finished_at: new Date().toISOString(),
        watermark,
        contacts_seen: seen,
        contacts_upserted: upserted,
      })
      .eq("id", run.id);
  } catch (error) {
    await supabase
      .from("sf_pull_runs")
      .update({
        finished_at: new Date().toISOString(),
        contacts_seen: seen,
        contacts_upserted: upserted,
        error: error instanceof Error ? error.message : String(error),
      })
      .eq("id", run.id);
    throw error;
  }

  return { mode, seen, upserted, watermark };
}
