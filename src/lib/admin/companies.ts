import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// Data access for the Companies directory (/admin/companies) — the app's
// permanent archive of pre-GHL booking history (docs/ecosystem-manual.md §4).
// Stats come live from sf_opportunities via the sf_company_directory view,
// not from the account's frozen Salesforce roll-up snapshots. All reads go
// through the service role; pages guard with a signed-in portal user.

export type CompanyDirectoryRow =
  Database["public"]["Views"]["sf_company_directory"]["Row"];
export type SfAccountRow = Database["public"]["Tables"]["sf_accounts"]["Row"];
export type SfContactRow = Database["public"]["Tables"]["sf_contacts"]["Row"];
export type SfOpportunityRow =
  Database["public"]["Tables"]["sf_opportunities"]["Row"];

export const COMPANY_SORTS = [
  "recent",
  "name",
  "type",
  "bookings",
  "contacts",
  "upcoming",
  "next",
] as const;
export type CompanySort = (typeof COMPANY_SORTS)[number];
export type CompanySortDir = "asc" | "desc";

// View column + the direction a fresh click on that column starts with:
// text ascends, counts and event dates lead with the biggest/most recent.
const SORT_COLUMNS: Record<
  CompanySort,
  { column: string; defaultDir: CompanySortDir }
> = {
  recent: { column: "last_event_date", defaultDir: "desc" },
  name: { column: "name", defaultDir: "asc" },
  type: { column: "type", defaultDir: "asc" },
  bookings: { column: "won_count", defaultDir: "desc" },
  contacts: { column: "contact_count", defaultDir: "desc" },
  upcoming: { column: "upcoming_booked_count", defaultDir: "desc" },
  next: { column: "next_event_date", defaultDir: "asc" },
};

export function defaultSortDir(sort: CompanySort): CompanySortDir {
  return SORT_COLUMNS[sort].defaultDir;
}

const PAGE_SIZE = 25;

// Escape ilike wildcards so user input matches literally.
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

export type CompanyListFilters = {
  search?: string;
  type?: string;
  bookedOnly?: boolean;
  sort?: CompanySort;
  dir?: CompanySortDir;
  page?: number;
};

export type CompanyListPage = {
  companies: CompanyDirectoryRow[];
  page: number;
  pageCount: number;
  totalMatching: number;
};

export async function listCompanies({
  search,
  type,
  bookedOnly,
  sort = "recent",
  dir,
  page = 1,
}: CompanyListFilters): Promise<CompanyListPage> {
  const supabase = createServiceRoleSupabaseClient();

  let query = supabase
    .from("sf_company_directory")
    .select("*", { count: "exact" });

  if (search) query = query.ilike("name", `%${escapeLike(search)}%`);
  if (type) query = query.eq("type", type);
  if (bookedOnly) query = query.gt("won_count", 0);

  const { column, defaultDir } = SORT_COLUMNS[sort];
  const ascending = (dir ?? defaultDir) === "asc";
  // Rows without a value (no events yet, no type, ...) always sink to the
  // bottom regardless of direction.
  query = query.order(column, { ascending, nullsFirst: false });
  if (column !== "name") {
    query = query.order("name", { ascending: true });
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`Could not list companies: ${error.message}`);

  const totalMatching = count ?? 0;
  return {
    companies: data,
    page,
    pageCount: Math.max(1, Math.ceil(totalMatching / PAGE_SIZE)),
    totalMatching,
  };
}

// Distinct account types for the list filter (their org uses a handful, e.g.
// Corporate / Non-Profit). Small table scan, fine at this size.
export async function listCompanyTypes(): Promise<string[]> {
  const supabase = createServiceRoleSupabaseClient();

  const types = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("sf_accounts")
      .select("type")
      .not("type", "is", null)
      .range(from, from + 999);
    if (error) throw new Error(`Could not list types: ${error.message}`);
    for (const row of data) if (row.type) types.add(row.type);
    if (data.length < 1000) break;
  }
  return [...types].sort((a, b) => a.localeCompare(b));
}

export type CompanyDetail = {
  account: SfAccountRow;
  stats: CompanyDirectoryRow | null;
  contacts: SfContactRow[];
  opportunities: SfOpportunityRow[];
  /** Other staged accounts sharing this account's name (case-insensitive). */
  duplicates: CompanyDirectoryRow[];
};

// Opportunity history is rendered in full; cap defensively far above the
// busiest account seen (Wells Fargo: 115).
const OPPORTUNITY_LIMIT = 500;

export async function getCompanyDetail(
  sfId: string,
): Promise<CompanyDetail | null> {
  const supabase = createServiceRoleSupabaseClient();

  const { data: account, error: accountError } = await supabase
    .from("sf_accounts")
    .select("*")
    .eq("sf_id", sfId)
    .maybeSingle();
  if (accountError) {
    throw new Error(`Could not load account: ${accountError.message}`);
  }
  if (!account) return null;

  const [stats, contacts, opportunities, duplicates] = await Promise.all([
    supabase
      .from("sf_company_directory")
      .select("*")
      .eq("sf_id", sfId)
      .maybeSingle(),
    supabase
      .from("sf_contacts")
      .select("*")
      .eq("account_id", sfId)
      .order("last_name", { ascending: true, nullsFirst: false })
      .order("first_name", { ascending: true, nullsFirst: false }),
    supabase
      .from("sf_opportunities")
      .select("*")
      .eq("account_id", sfId)
      .order("event_date", { ascending: false, nullsFirst: false })
      .order("close_date", { ascending: false, nullsFirst: false })
      .limit(OPPORTUNITY_LIMIT),
    account.name
      ? supabase
          .from("sf_company_directory")
          .select("*")
          .ilike("name", escapeLike(account.name))
          .neq("sf_id", sfId)
          .order("won_count", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (stats.error) {
    throw new Error(`Could not load stats: ${stats.error.message}`);
  }
  if (contacts.error) {
    throw new Error(`Could not load contacts: ${contacts.error.message}`);
  }
  if (opportunities.error) {
    throw new Error(
      `Could not load opportunities: ${opportunities.error.message}`,
    );
  }
  if (duplicates.error) {
    throw new Error(`Could not load duplicates: ${duplicates.error.message}`);
  }

  return {
    account,
    stats: stats.data,
    contacts: contacts.data,
    opportunities: opportunities.data,
    duplicates: duplicates.data ?? [],
  };
}
