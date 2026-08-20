import type { Database } from "@/types/database";

// Maps a staged Salesforce contact to the GHL contact-upsert payload. This
// is the single source of truth for the field mapping: the review screen
// renders exactly what a future push will send.

export type SfContactRow = Database["public"]["Tables"]["sf_contacts"]["Row"];

export const SF_MIGRATION_TAG = "sf-migration";

export type GhlContactPayload = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  source: string;
  tags: string[];
};

export function buildGhlContactPayload(row: SfContactRow): GhlContactPayload {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email ? row.email.trim().toLowerCase() : null,
    phone: row.phone,
    companyName: row.account_name,
    address1: row.mailing_street,
    city: row.mailing_city,
    state: row.mailing_state,
    postalCode: row.mailing_postal_code,
    country: row.mailing_country,
    source: "Salesforce migration",
    tags: [SF_MIGRATION_TAG],
  };
}
