import type { Database } from "@/types/database";

type VendorInsert = Database["public"]["Tables"]["vendors"]["Insert"];

export type ClientVendorSubmissionInput = {
  companyName: string;
  contactName: string;
  email: string;
  eventId: string;
  notes: string;
  phone: string;
  vendorType: string;
};

export function buildClientVendorInsert(
  input: ClientVendorSubmissionInput,
): VendorInsert {
  const eventId = input.eventId.trim();

  if (!eventId) {
    throw new Error("Unable to submit vendor: missing event ID");
  }

  const companyName = normalizeOptionalText(input.companyName);
  const contactName = normalizeOptionalText(input.contactName);

  if (!companyName && !contactName) {
    throw new Error("Unable to submit vendor: company or contact name is required");
  }

  return {
    event_id: eventId,
    vendor_type: normalizeOptionalText(input.vendorType),
    company_name: companyName,
    contact_name: contactName,
    email: normalizeEmail(input.email),
    phone: normalizeOptionalText(input.phone),
    notes: normalizeOptionalText(input.notes),
    metadata: {
      source: "client_portal",
      status: "needs_review",
    },
  };
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function normalizeEmail(value: string): string | null {
  const trimmed = value.trim().toLowerCase();

  return trimmed ? trimmed : null;
}
