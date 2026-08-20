import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// Data access for the Salesforce → GHL migration review screen
// (docs/ecosystem-manual.md §4). All reads/writes go through the service
// role; pages guard with requireAdminUser().

export type SfPushStatus = Database["public"]["Enums"]["sf_push_status"];
export type SfContactRow = Database["public"]["Tables"]["sf_contacts"]["Row"];

export type SfMigrationStats = {
  total: number;
  byStatus: Record<SfPushStatus, number>;
  duplicateContacts: number;
};

export type SfPullRunSummary = {
  startedAt: string;
  finishedAt: string | null;
  mode: "full" | "incremental";
  seen: number;
  upserted: number;
  error: string | null;
};

const PUSH_STATUSES: SfPushStatus[] = [
  "staged",
  "approved",
  "excluded",
  "pushed",
  "error",
];

export async function getSfMigrationStats(): Promise<SfMigrationStats> {
  const supabase = createServiceRoleSupabaseClient();

  const [total, dupes, ...statusCounts] = await Promise.all([
    supabase.from("sf_contacts").select("sf_id", { count: "exact", head: true }),
    supabase
      .from("sf_contact_duplicates")
      .select("sf_id", { count: "exact", head: true }),
    ...PUSH_STATUSES.map((status) =>
      supabase
        .from("sf_contacts")
        .select("sf_id", { count: "exact", head: true })
        .eq("push_status", status),
    ),
  ]);

  const byStatus = Object.fromEntries(
    PUSH_STATUSES.map((status, index) => [
      status,
      statusCounts[index].count ?? 0,
    ]),
  ) as Record<SfPushStatus, number>;

  return {
    total: total.count ?? 0,
    byStatus,
    duplicateContacts: dupes.count ?? 0,
  };
}

export async function getLastSfPullRun(): Promise<SfPullRunSummary | null> {
  const supabase = createServiceRoleSupabaseClient();

  const { data } = await supabase
    .from("sf_pull_runs")
    .select("started_at, finished_at, mode, contacts_seen, contacts_upserted, error")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    startedAt: data.started_at,
    finishedAt: data.finished_at,
    mode: data.mode,
    seen: data.contacts_seen,
    upserted: data.contacts_upserted,
    error: data.error,
  };
}

export type SfContactFilters = {
  search?: string;
  status?: SfPushStatus;
  dupesOnly?: boolean;
  page?: number;
};

export const SF_CONTACTS_PAGE_SIZE = 50;

export type SfContactPage = {
  contacts: SfContactRow[];
  totalMatching: number;
  page: number;
  pageCount: number;
};

export async function listSfContacts(
  filters: SfContactFilters,
): Promise<SfContactPage> {
  const supabase = createServiceRoleSupabaseClient();
  const page = Math.max(1, filters.page ?? 1);

  // The duplicates view has the same row shape as the table; the cast keeps
  // the query typed as sf_contacts rows either way.
  const relation = (
    filters.dupesOnly ? "sf_contact_duplicates" : "sf_contacts"
  ) as "sf_contacts";
  let query = supabase.from(relation).select("*", { count: "exact" });

  if (filters.status) {
    query = query.eq("push_status", filters.status);
  }

  if (filters.search) {
    // Strip PostgREST or() syntax characters from user input.
    const term = filters.search.replace(/[,()]/g, " ").trim();
    if (term) {
      const pattern = `%${term}%`;
      query = query.or(
        [
          `first_name.ilike.${pattern}`,
          `last_name.ilike.${pattern}`,
          `email.ilike.${pattern}`,
          `account_name.ilike.${pattern}`,
          `owner_name.ilike.${pattern}`,
        ].join(","),
      );
    }
  }

  const from = (page - 1) * SF_CONTACTS_PAGE_SIZE;
  const { data, count, error } = await query
    .order(filters.dupesOnly ? "email" : "sf_modified_at", {
      ascending: filters.dupesOnly,
      nullsFirst: false,
    })
    .range(from, from + SF_CONTACTS_PAGE_SIZE - 1);

  if (error) {
    throw new Error(`Could not list staged contacts: ${error.message}`);
  }

  const totalMatching = count ?? 0;
  return {
    contacts: data ?? [],
    totalMatching,
    page,
    pageCount: Math.max(1, Math.ceil(totalMatching / SF_CONTACTS_PAGE_SIZE)),
  };
}

export async function setSfContactStatus(
  sfId: string,
  status: Extract<SfPushStatus, "staged" | "approved" | "excluded">,
  excludedReason?: string,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();

  const { data, error } = await supabase
    .from("sf_contacts")
    .update({
      push_status: status,
      excluded_reason: status === "excluded" ? (excludedReason ?? "Excluded in review") : null,
    })
    .eq("sf_id", sfId)
    // Pushed contacts are historical record; status changes stop mattering.
    .neq("push_status", "pushed")
    .select("sf_id");

  if (error) {
    throw new Error(`Could not update contact status: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error("Contact not found or already pushed.");
  }
}
