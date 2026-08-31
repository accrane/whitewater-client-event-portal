import type { SoqlRecord } from "@/lib/salesforce/client";
import {
  bool,
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

// Salesforce Opportunity → sf_opportunities staging pull
// (docs/ecosystem-manual.md §4). Beyond the flattened columns, the query
// keeps their event-detail custom fields (rentals, adventures, catering
// totals, program times) in `raw` for anything the app wants to surface
// later — raw only ever contains what this query selects.

const OPPORTUNITY_FIELDS = [
  "Id",
  "Name",
  "AccountId",
  "ContactId",
  "StageName",
  "Amount",
  "Total_Opportunity_Amount__c",
  "CloseDate",
  "Date__c", // "Date of Event"
  "Head_Count__c",
  "Type",
  "LeadSource",
  "IsClosed",
  "IsWon",
  "OwnerId",
  "Owner.Name",
  "Notes__c",
  "Site_Tour__c",
  "Initial_Contact__c",
  "Adventures__c",
  "Facility_Rental__c",
  "Rental_Start__c",
  "Rental_End__c",
  "Program_Start__c",
  "Program_End__c",
  "Amount_Invoiced__c",
  "Payments_Made__c",
  "Contact_Phone__c",
  "Made_it_to_Proposal_Sent__c",
  "CreatedDate",
  "LastModifiedDate",
  "SystemModstamp",
] as const;

type SfOpportunityInsert =
  Database["public"]["Tables"]["sf_opportunities"]["Insert"];

function mapOpportunity(record: SoqlRecord): SfOpportunityInsert {
  const mapped = {
    sf_id: String(record.Id),
    name: str(record.Name),
    account_id: str(record.AccountId),
    contact_id: str(record.ContactId),
    stage_name: str(record.StageName),
    amount: num(record.Amount),
    total_amount: num(record.Total_Opportunity_Amount__c),
    close_date: str(record.CloseDate),
    event_date: str(record.Date__c),
    head_count: num(record.Head_Count__c),
    opportunity_type: str(record.Type),
    lead_source: str(record.LeadSource),
    is_closed: bool(record.IsClosed),
    is_won: bool(record.IsWon),
    owner_id: str(record.OwnerId),
    owner_name: relationName(record, "Owner"),
    sf_created_at: str(record.CreatedDate),
    sf_modified_at: str(record.LastModifiedDate),
  };

  return {
    ...mapped,
    raw: rawRecord(record) as SfOpportunityInsert["raw"],
    content_hash: contentHash(mapped),
    pulled_at: new Date().toISOString(),
  };
}

const opportunityPullSpec: ObjectPullSpec<SfOpportunityInsert> = {
  sfObject: "Opportunity",
  runObject: "opportunity",
  fields: OPPORTUNITY_FIELDS,
  map: mapOpportunity,
  loadExistingHashes: (supabase) =>
    loadHashPages(async (from, to) => {
      const { data, error } = await supabase
        .from("sf_opportunities")
        .select("sf_id, content_hash")
        .range(from, to);
      if (error) {
        throw new Error(`Could not load existing hashes: ${error.message}`);
      }
      return data;
    }),
  upsert: async (supabase, rows) => {
    const { error } = await supabase
      .from("sf_opportunities")
      .upsert(rows, { onConflict: "sf_id" });
    if (error) throw new Error(`Upsert failed: ${error.message}`);
  },
};

export function pullSalesforceOpportunities(
  requestedMode: "full" | "incremental" = "incremental",
): Promise<PullResult> {
  return runObjectPull(opportunityPullSpec, requestedMode);
}
