import { appConfig } from "@/lib/env";
import { getGhlApiHeaders } from "@/lib/ghl/client";
import { createOrReuseInquiryEvent } from "@/lib/ghl/inquiry-events";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import { listGhlUsers } from "@/lib/ghl/location-data";
import { createContactNote } from "@/lib/ghl/notes";
import {
  fetchConfiguredPipeline,
  searchPipelineOpportunities,
  type GhlPipelineOpportunity,
} from "@/lib/ghl/opportunities";
import { assignOpportunityCoordinator } from "@/lib/ghl/opportunity-sync";
import type { InquiryPayload } from "@/lib/ghl/types";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";

// The second door into the pipeline. Website inquiries arrive through the
// GHL form → workflow → webhook chain; a phone inquiry is typed into the
// portal's New inquiry page instead. The portal then does what the form
// path does, in the same order GHL expects: upsert the contact, create the
// opportunity in New Inquiry with the same custom fields the form fills,
// create the draft event directly (no webhook to wait on), and write the
// event id back. Expedited inquiries (event inside two weeks, or ticked)
// are flagged on the event so the deadline rules and badges treat them as
// a rush. Neither path enters GHL's chase workflows: those trigger on form
// submission, and a phone lead is owned by the planner who took the call.

export const PHONE_INQUIRY_CONTACT_TAG = "inquiry-phone";
export { EXPEDITED_WINDOW_DAYS, isInsideExpeditedWindow } from "@/lib/ghl/expedited";

// Opportunity custom fields the website form fills, by GHL field id (this
// location's ids; see docs/ghl-custom-fields.md). Date of Interest comes
// from env because the app already reads it elsewhere.
export const INQUIRY_FIELD_IDS = {
  inquiryType: "STQPdRrIfVqX3Sbqleew",
  groupEventName: "Yz2CcYRaCRvjHK3FlekO",
  companyName: "BurRW64PbpWhzSd8M3To",
  numberOfGuests: "WxC5gg3NuLHGBrdMx9YX",
  location: "r8hIpkhPXXCqxW2jRWRY",
  activityInterest: "PPoj8o6YqJepvZ0tWb7K",
  message: "qkRcSQCMM154RyxMY7qk",
  catering: "40ZnHRqKXvMWJdKfwRgo",
  venueRental: "gEXbzg2PVYwZz8atUvOa",
  visitedPrior: "0IJUpiCD9Kc9VM79SVBk",
  dateFlexibility: "5pycOyTRrNdm9WtZX6G1",
  accommodationInterest: "pZkLs15V95Zm4KDgXM5T",
} as const;

// Fallbacks when the live option lists can't be read.
export const DEFAULT_INQUIRY_TYPES = [
  "General Inquiry",
  "Adventure Lodging Inquiry",
  "Wedding Inquiry",
];
export const DEFAULT_LOCATIONS = [
  "Whitewater Center - Charlotte, NC",
  "Middleburg - Charleston, SC",
  "Windfall - Lansing, NC",
  "Big Creek Lodge - Mills River, NC",
  "High Top - Whitetop, VA",
];

export type YesNo = "Yes" | "No";

export type PhoneInquiryInput = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  groupEventName: string | null;
  inquiryType: string | null;
  location: string | null;
  dateOfInterest: string | null;
  numberOfGuests: number | null;
  activityInterest: string | null;
  message: string | null;
  catering: YesNo | null;
  venueRental: YesNo | null;
  visitedPrior: YesNo | null;
  dateFlexibility: YesNo | null;
  accommodationInterest: YesNo | null;
  coordinatorGhlUserId: string | null;
  expedited: boolean;
  takenByEmail: string | null;
};

export type ExistingOpportunity = {
  opportunityId: string;
  opportunityName: string;
  portalEventId: string | null;
};

export type PhoneInquiryResult =
  | { ok: true; eventId: string; opportunityId: string; contactId: string }
  | { ok: false; error: string; existing?: ExistingOpportunity };

// Option lists for the two picklist fields, read live so a new choice added
// in GHL shows up without a deploy.
export async function fetchInquiryFieldOptions(): Promise<{
  inquiryTypes: string[];
  locations: string[];
}> {
  const { accessToken, apiBaseUrl, locationId } = appConfig.ghl;
  const fallback = {
    inquiryTypes: DEFAULT_INQUIRY_TYPES,
    locations: DEFAULT_LOCATIONS,
  };
  if (!accessToken || !locationId) return fallback;
  try {
    const response = await fetch(
      `${apiBaseUrl}/locations/${encodeURIComponent(locationId)}/customFields?model=opportunity`,
      { headers: getGhlApiHeaders(accessToken) },
    );
    if (!response.ok) return fallback;
    const data = (await response.json()) as {
      customFields?: { id?: string; picklistOptions?: string[] }[];
    };
    const options = (id: string) =>
      data.customFields?.find((field) => field.id === id)?.picklistOptions ?? [];
    const inquiryTypes = options(INQUIRY_FIELD_IDS.inquiryType);
    const locations = options(INQUIRY_FIELD_IDS.location);
    return {
      inquiryTypes: inquiryTypes.length > 0 ? inquiryTypes : fallback.inquiryTypes,
      locations: locations.length > 0 ? locations : fallback.locations,
    };
  } catch {
    return fallback;
  }
}

async function upsertInquiryContact(
  input: PhoneInquiryInput,
): Promise<{ ok: true; contactId: string } | { ok: false; error: string }> {
  const { accessToken, apiBaseUrl, locationId } = appConfig.ghl;
  if (!accessToken || !locationId) {
    return { ok: false, error: "GHL is not configured." };
  }
  const response = await fetch(`${apiBaseUrl}/contacts/upsert`, {
    method: "POST",
    headers: getGhlApiHeaders(accessToken),
    body: JSON.stringify({
      locationId,
      firstName: input.firstName,
      ...(input.lastName ? { lastName: input.lastName } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.companyName ? { companyName: input.companyName } : {}),
      source: "Phone inquiry (portal)",
      tags: [PHONE_INQUIRY_CONTACT_TAG],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      error: `GHL could not save the contact (${response.status}): ${text.slice(0, 200)}`,
    };
  }
  const data = (await response.json()) as { contact?: { id?: string } };
  if (!data.contact?.id) return { ok: false, error: "GHL returned no contact id." };
  return { ok: true, contactId: data.contact.id };
}

// Open opportunities this contact already has in the sales pipeline. A
// repeat caller should be attached to their existing deal, not given a
// second one.
async function findOpenOpportunityForContact(
  contactId: string,
): Promise<ExistingOpportunity | null> {
  const { accessToken, apiBaseUrl, locationId, pipelineId } = appConfig.ghl;
  if (!accessToken || !locationId) return null;
  const params = new URLSearchParams({
    location_id: locationId,
    contact_id: contactId,
    status: "open",
    limit: "20",
  });
  if (pipelineId) params.set("pipeline_id", pipelineId);
  const response = await fetch(
    `${apiBaseUrl}/opportunities/search?${params.toString()}`,
    { headers: getGhlApiHeaders(accessToken) },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as {
    opportunities?: { id?: string; name?: string }[];
  };
  const first = (data.opportunities ?? []).find((o) => o.id);
  if (!first?.id) return null;

  const supabase = createServiceRoleSupabaseClient();
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("ghl_opportunity_id", first.id)
    .maybeSingle();
  return {
    opportunityId: first.id,
    opportunityName: first.name?.trim() || "Untitled opportunity",
    portalEventId: (event as { id: string } | null)?.id ?? null,
  };
}

async function newInquiryStageId(): Promise<string | null> {
  const pipeline = await fetchConfiguredPipeline();
  if (!pipeline || pipeline.stages.length === 0) return null;
  return (
    pipeline.stages.find(
      (stage) => stage.name.trim().toLowerCase() === "new inquiry",
    )?.id ?? pipeline.stages[0].id
  );
}

export async function createPhoneInquiry(
  input: PhoneInquiryInput,
): Promise<PhoneInquiryResult> {
  const { accessToken, apiBaseUrl, locationId, pipelineId, dateOfInterestFieldId } =
    appConfig.ghl;
  if (!accessToken || !locationId || !pipelineId) {
    return { ok: false, error: "GHL is not configured (token, location, or pipeline id missing)." };
  }

  const contact = await upsertInquiryContact(input);
  if (!contact.ok) return contact;

  const existing = await findOpenOpportunityForContact(contact.contactId);
  if (existing) {
    return {
      ok: false,
      error: `${input.firstName} ${input.lastName}`.trim() +
        ` already has an open opportunity ("${existing.opportunityName}"). Open it instead of creating a second one.`,
      existing,
    };
  }

  const stageId = await newInquiryStageId();
  if (!stageId) {
    return { ok: false, error: "The GHL pipeline has no stages to place the inquiry in." };
  }

  const contactName = `${input.firstName} ${input.lastName}`.trim();
  const opportunityName = input.groupEventName || input.companyName || contactName;
  const field = (id: string | undefined, value: string | number | null) =>
    id && value !== null && value !== "" ? [{ id, field_value: value }] : [];
  const customFields = [
    ...field(INQUIRY_FIELD_IDS.inquiryType, input.inquiryType),
    ...field(INQUIRY_FIELD_IDS.groupEventName, input.groupEventName),
    ...field(INQUIRY_FIELD_IDS.companyName, input.companyName),
    ...field(INQUIRY_FIELD_IDS.numberOfGuests, input.numberOfGuests),
    ...field(INQUIRY_FIELD_IDS.location, input.location),
    ...field(INQUIRY_FIELD_IDS.activityInterest, input.activityInterest),
    ...field(INQUIRY_FIELD_IDS.message, input.message),
    ...field(INQUIRY_FIELD_IDS.catering, input.catering),
    ...field(INQUIRY_FIELD_IDS.venueRental, input.venueRental),
    ...field(INQUIRY_FIELD_IDS.visitedPrior, input.visitedPrior),
    ...field(INQUIRY_FIELD_IDS.dateFlexibility, input.dateFlexibility),
    ...field(INQUIRY_FIELD_IDS.accommodationInterest, input.accommodationInterest),
    ...field(dateOfInterestFieldId, input.dateOfInterest),
  ];

  const response = await fetch(`${apiBaseUrl}/opportunities/`, {
    method: "POST",
    headers: getGhlApiHeaders(accessToken),
    body: JSON.stringify({
      pipelineId,
      locationId,
      name: opportunityName,
      pipelineStageId: stageId,
      status: "open",
      contactId: contact.contactId,
      source: "phone",
      ...(input.coordinatorGhlUserId ? { assignedTo: input.coordinatorGhlUserId } : {}),
      customFields,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    await logIntegrationEvent({
      direction: "PORTAL_TO_GHL",
      eventType: "phone_inquiry_create",
      ghlLocationId: locationId,
      status: "error",
      message: "Failed creating the GHL opportunity for a phone inquiry.",
      details: { ghl_contact_id: contact.contactId, error: `GHL responded ${response.status}: ${text.slice(0, 300)}` },
    });
    return {
      ok: false,
      error: `GHL could not create the opportunity (${response.status}): ${text.slice(0, 200)}`,
    };
  }
  const created = (await response.json()) as { opportunity?: { id?: string } };
  const opportunityId = created.opportunity?.id;
  if (!opportunityId) return { ok: false, error: "GHL returned no opportunity id." };

  const payload: InquiryPayload = {
    ghl_location_id: locationId,
    ghl_opportunity_id: opportunityId,
    ghl_contact_id: contact.contactId,
    contact: {
      name: contactName,
      ...(input.email ? { email: input.email } : {}),
      phone: input.phone,
    },
    event: {
      name: opportunityName,
      ...(input.inquiryType ? { type: input.inquiryType } : {}),
      ...(input.dateOfInterest ? { date: input.dateOfInterest } : {}),
    },
  };
  const result = await createOrReuseInquiryEvent(payload);
  const eventId = result.event.id;

  const supabase = createServiceRoleSupabaseClient();
  await supabase
    .from("events")
    .update({ inquiry_source: "phone", expedited: input.expedited })
    .eq("id", eventId);

  if (input.coordinatorGhlUserId) {
    await assignOpportunityCoordinator(eventId, input.coordinatorGhlUserId);
  }

  const users = await listGhlUsers();
  const takenBy = input.takenByEmail ?? "the portal";
  await createContactNote({
    contactId: contact.contactId,
    body: `Phone inquiry taken in the portal by ${takenBy}${
      input.expedited ? " — EXPEDITED" : ""
    }${input.dateOfInterest ? ` (date of interest ${input.dateOfInterest})` : ""}.${
      input.message ? `\n\n${input.message}` : ""
    }`,
    userId:
      users.find(
        (user) =>
          user.email &&
          input.takenByEmail &&
          user.email.toLowerCase() === input.takenByEmail.toLowerCase(),
      )?.id ?? null,
    ghlLocationId: locationId,
    portalEventId: eventId,
  });

  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "phone_inquiry_create",
    ghlLocationId: locationId,
    portalEventId: eventId,
    status: "success",
    message: `Phone inquiry created in GHL (contact, opportunity in New Inquiry) and as a draft event${input.expedited ? ", flagged expedited" : ""}.`,
    details: {
      ghl_contact_id: contact.contactId,
      ghl_opportunity_id: opportunityId,
      expedited: input.expedited,
      taken_by: input.takenByEmail,
    },
  });

  return { ok: true, eventId, opportunityId, contactId: contact.contactId };
}

// --- Backfill: draft events for opportunities the webhook never delivered ---

export type OpportunityWithoutEvent = {
  id: string;
  name: string;
  contactName: string | null;
  eventDate: string | null;
  stageName: string | null;
  createdAt: string | null;
};

export async function listOpportunitiesWithoutPortalEvent(): Promise<
  OpportunityWithoutEvent[]
> {
  const [open, pipeline] = await Promise.all([
    searchPipelineOpportunities("open"),
    fetchConfiguredPipeline(),
  ]);
  if (open.length === 0) return [];

  const supabase = createServiceRoleSupabaseClient();
  const { data } = await supabase
    .from("events")
    .select("ghl_opportunity_id")
    .in(
      "ghl_opportunity_id",
      open.map((o) => o.id),
    );
  const covered = new Set(
    ((data ?? []) as { ghl_opportunity_id: string | null }[])
      .map((row) => row.ghl_opportunity_id)
      .filter(Boolean),
  );
  const stageName = new Map(
    (pipeline?.stages ?? []).map((stage) => [stage.id, stage.name]),
  );

  return open
    .filter((o) => !covered.has(o.id))
    .map((o) => ({
      id: o.id,
      name: o.name ?? "Untitled opportunity",
      contactName: o.contact?.name ?? null,
      eventDate: o.eventDate,
      stageName: o.pipelineStageId ? (stageName.get(o.pipelineStageId) ?? null) : null,
      createdAt: o.createdAt,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

function customFieldValue(customFields: unknown, id: string): string | null {
  if (!Array.isArray(customFields)) return null;
  for (const entry of customFields) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { id?: string; fieldValue?: unknown; fieldValueString?: unknown; value?: unknown };
    if (row.id !== id) continue;
    const value = row.fieldValue ?? row.fieldValueString ?? row.value;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
  return null;
}

// Creates the draft event for an existing GHL opportunity, exactly as the
// webhook would have: same payload shape, same idempotent creator.
export async function backfillInquiryEvent(
  opportunityId: string,
  byEmail: string | null,
): Promise<{ ok: true; eventId: string; created: boolean } | { ok: false; error: string }> {
  const { accessToken, apiBaseUrl, locationId, dateOfInterestFieldId } = appConfig.ghl;
  if (!accessToken || !locationId) return { ok: false, error: "GHL is not configured." };

  const response = await fetch(
    `${apiBaseUrl}/opportunities/${encodeURIComponent(opportunityId)}`,
    { headers: getGhlApiHeaders(accessToken) },
  );
  if (!response.ok) {
    return { ok: false, error: `GHL could not load the opportunity (${response.status}).` };
  }
  const data = (await response.json()) as {
    opportunity?: {
      id?: string;
      name?: string;
      contactId?: string;
      contact?: { id?: string; name?: string; email?: string; phone?: string };
      customFields?: unknown;
    };
  };
  const opportunity = data.opportunity;
  if (!opportunity?.id) return { ok: false, error: "GHL returned no opportunity." };

  const rawDate = customFieldValue(opportunity.customFields, dateOfInterestFieldId ?? "");
  const date = rawDate && /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : undefined;
  const contactId = opportunity.contact?.id ?? opportunity.contactId;
  const contactName = opportunity.contact?.name?.trim();

  const payload: InquiryPayload = {
    ghl_location_id: locationId,
    ghl_opportunity_id: opportunity.id,
    ...(contactId ? { ghl_contact_id: contactId } : {}),
    ...(contactName || opportunity.contact?.email || opportunity.contact?.phone
      ? {
          contact: {
            ...(contactName ? { name: contactName } : {}),
            ...(opportunity.contact?.email ? { email: opportunity.contact.email } : {}),
            phone: opportunity.contact?.phone ?? null,
          },
        }
      : {}),
    event: {
      name:
        customFieldValue(opportunity.customFields, INQUIRY_FIELD_IDS.groupEventName) ??
        opportunity.name?.trim() ??
        undefined,
      ...(customFieldValue(opportunity.customFields, INQUIRY_FIELD_IDS.inquiryType)
        ? { type: customFieldValue(opportunity.customFields, INQUIRY_FIELD_IDS.inquiryType)! }
        : {}),
      ...(date ? { date } : {}),
    },
  };

  const result = await createOrReuseInquiryEvent(payload);
  await logIntegrationEvent({
    direction: "GHL_TO_PORTAL",
    eventType: "inquiry_event_backfill",
    ghlLocationId: locationId,
    portalEventId: result.event.id,
    status: "success",
    message: result.created
      ? "Draft event created for an existing GHL opportunity from the New inquiry page."
      : "Backfill found an existing draft event for this opportunity.",
    details: { ghl_opportunity_id: opportunity.id, by: byEmail },
  });
  return { ok: true, eventId: result.event.id, created: result.created };
}

export type { GhlPipelineOpportunity };
