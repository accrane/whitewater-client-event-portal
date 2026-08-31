import type { SoqlRecord } from "@/lib/salesforce/client";
import {
  contentHash,
  loadHashPages,
  rawRecord,
  relationName,
  runObjectPull,
  str,
  type ObjectPullSpec,
  type PullResult,
} from "@/lib/salesforce/pull-engine";
import type { Database } from "@/types/database";

// Salesforce Contact → sf_contacts staging pull (docs/ecosystem-manual.md §4).

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

  return {
    ...mapped,
    raw: rawRecord(record) as SfContactInsert["raw"],
    content_hash: contentHash(mapped),
    pulled_at: new Date().toISOString(),
  };
}

const contactPullSpec: ObjectPullSpec<SfContactInsert> = {
  sfObject: "Contact",
  runObject: "contact",
  fields: CONTACT_FIELDS,
  map: mapContact,
  loadExistingHashes: (supabase) =>
    loadHashPages(async (from, to) => {
      const { data, error } = await supabase
        .from("sf_contacts")
        .select("sf_id, content_hash")
        .range(from, to);
      if (error) {
        throw new Error(`Could not load existing hashes: ${error.message}`);
      }
      return data;
    }),
  upsert: async (supabase, rows) => {
    const { error } = await supabase
      .from("sf_contacts")
      .upsert(rows, { onConflict: "sf_id" });
    if (error) throw new Error(`Upsert failed: ${error.message}`);
  },
};

export function pullSalesforceContacts(
  requestedMode: "full" | "incremental" = "incremental",
): Promise<PullResult> {
  return runObjectPull(contactPullSpec, requestedMode);
}
