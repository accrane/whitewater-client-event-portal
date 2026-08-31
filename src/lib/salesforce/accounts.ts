import type { SoqlRecord } from "@/lib/salesforce/client";
import {
  contentHash,
  loadHashPages,
  num,
  rawRecord,
  relationName,
  runObjectPull,
  str,
  type ObjectPullSpec,
  type PullResult,
} from "@/lib/salesforce/pull-engine";
import type { Database } from "@/types/database";

// Salesforce Account → sf_accounts staging pull (docs/ecosystem-manual.md §4).
// Number_of_Booked_Opportunities__c and Last_Booking_Date__c are roll-up
// summaries over the account's opportunities — snapshots at pull time; live
// equivalents are recomputed in-app from sf_opportunities.

const ACCOUNT_FIELDS = [
  "Id",
  "Name",
  "Type",
  "Phone",
  "Website",
  "Industry",
  "AccountSource",
  "BillingStreet",
  "BillingCity",
  "BillingState",
  "BillingPostalCode",
  "BillingCountry",
  "Description",
  "OwnerId",
  "Owner.Name",
  "Number_of_Booked_Opportunities__c",
  "Last_Booking_Date__c",
  "CreatedDate",
  "LastModifiedDate",
  "SystemModstamp",
] as const;

type SfAccountInsert = Database["public"]["Tables"]["sf_accounts"]["Insert"];

function mapAccount(record: SoqlRecord): SfAccountInsert {
  const mapped = {
    sf_id: String(record.Id),
    name: str(record.Name),
    type: str(record.Type),
    phone: str(record.Phone),
    website: str(record.Website),
    industry: str(record.Industry),
    account_source: str(record.AccountSource),
    billing_street: str(record.BillingStreet),
    billing_city: str(record.BillingCity),
    billing_state: str(record.BillingState),
    billing_postal_code: str(record.BillingPostalCode),
    billing_country: str(record.BillingCountry),
    description: str(record.Description),
    owner_id: str(record.OwnerId),
    owner_name: relationName(record, "Owner"),
    number_of_booked_opportunities: num(
      record.Number_of_Booked_Opportunities__c,
    ),
    last_booking_date: str(record.Last_Booking_Date__c),
    sf_created_at: str(record.CreatedDate),
    sf_modified_at: str(record.LastModifiedDate),
  };

  return {
    ...mapped,
    raw: rawRecord(record) as SfAccountInsert["raw"],
    content_hash: contentHash(mapped),
    pulled_at: new Date().toISOString(),
  };
}

const accountPullSpec: ObjectPullSpec<SfAccountInsert> = {
  sfObject: "Account",
  runObject: "account",
  fields: ACCOUNT_FIELDS,
  map: mapAccount,
  loadExistingHashes: (supabase) =>
    loadHashPages(async (from, to) => {
      const { data, error } = await supabase
        .from("sf_accounts")
        .select("sf_id, content_hash")
        .range(from, to);
      if (error) {
        throw new Error(`Could not load existing hashes: ${error.message}`);
      }
      return data;
    }),
  upsert: async (supabase, rows) => {
    const { error } = await supabase
      .from("sf_accounts")
      .upsert(rows, { onConflict: "sf_id" });
    if (error) throw new Error(`Upsert failed: ${error.message}`);
  },
};

export function pullSalesforceAccounts(
  requestedMode: "full" | "incremental" = "incremental",
): Promise<PullResult> {
  return runObjectPull(accountPullSpec, requestedMode);
}
