import type { GhlEventSnapshot } from "@/types/portal";

export type CreateDraftEventPayload = {
  ghl_location_id: string;
  ghl_event_record_id: string;
  ghl_contact_id?: string;
  ghl_opportunity_id?: string;
  event: {
    name?: string;
    type?: string;
    date?: string;
    arrival_time?: string;
    meeting_location?: string;
  };
  planner?: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string | null;
  };
  links?: {
    proposal?: string;
    contract?: string;
    invoice?: string;
    payment?: string;
  };
  payment_status?: string;
};

export type ParseGhlDraftEventPayloadResult =
  | {
      ok: true;
      payload: CreateDraftEventPayload;
      snapshot: GhlEventSnapshot;
    }
  | {
      ok: false;
      errors: string[];
    };

export function parseGhlDraftEventPayload(
  input: unknown,
): ParseGhlDraftEventPayloadResult {
  if (!isRecord(input)) {
    return { ok: false, errors: ["payload must be an object"] };
  }

  const errors: string[] = [];
  const event = isRecord(input.event) ? input.event : undefined;
  const planner = isRecord(input.planner) ? input.planner : undefined;
  const links = isRecord(input.links) ? input.links : undefined;

  const payload: CreateDraftEventPayload = {
    ghl_location_id: requireString(input.ghl_location_id, "ghl_location_id", errors),
    ghl_event_record_id: requireString(
      input.ghl_event_record_id,
      "ghl_event_record_id",
      errors,
    ),
    ...(optionalString(input.ghl_contact_id) && {
      ghl_contact_id: optionalString(input.ghl_contact_id),
    }),
    ...(optionalString(input.ghl_opportunity_id) && {
      ghl_opportunity_id: optionalString(input.ghl_opportunity_id),
    }),
    event: {
      name: requireString(event?.name, "event.name", errors),
      type: optionalString(event?.type),
      date: requireDateString(event?.date, "event.date", errors),
      arrival_time: optionalString(event?.arrival_time),
      meeting_location: optionalString(event?.meeting_location),
    },
    ...(planner && {
      planner: {
        id: optionalString(planner.id),
        name: optionalString(planner.name),
        email: optionalString(planner.email),
        phone: optionalString(planner.phone) ?? null,
      },
    }),
    ...(links && {
      links: {
        proposal: optionalString(links.proposal),
        contract: optionalString(links.contract),
        invoice: optionalString(links.invoice),
        payment: optionalString(links.payment),
      },
    }),
    payment_status: optionalString(input.payment_status),
  };

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload,
    snapshot: normalizeGhlEventSnapshot(payload),
  };
}

export function normalizeGhlEventSnapshot(
  payload: CreateDraftEventPayload,
): GhlEventSnapshot {
  return {
    eventName: payload.event.name,
    eventType: payload.event.type,
    eventDate: payload.event.date,
    arrivalTime: payload.event.arrival_time,
    meetingLocation: payload.event.meeting_location,
    planner: payload.planner,
    links: payload.links,
    paymentStatus: payload.payment_status,
  };
}

// Sent by the GHL workflow when a new inquiry opportunity is created.
// Only the location and opportunity IDs are required — inquiry-stage
// opportunities may have sparse event details.
export type InquiryPayload = {
  ghl_location_id: string;
  ghl_opportunity_id: string;
  ghl_contact_id?: string;
  contact?: {
    name?: string;
    email?: string;
    phone?: string | null;
  };
  event?: {
    name?: string;
    type?: string;
    date?: string;
  };
};

export type ParseGhlInquiryPayloadResult =
  | {
      ok: true;
      payload: InquiryPayload;
    }
  | {
      ok: false;
      errors: string[];
    };

export function parseGhlInquiryPayload(
  input: unknown,
): ParseGhlInquiryPayloadResult {
  if (!isRecord(input)) {
    return { ok: false, errors: ["payload must be an object"] };
  }

  const errors: string[] = [];
  const contact = isRecord(input.contact) ? input.contact : undefined;
  const event = isRecord(input.event) ? input.event : undefined;

  const eventDate = optionalString(event?.date);

  if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    errors.push("event.date must use YYYY-MM-DD format");
  }

  const payload: InquiryPayload = {
    ghl_location_id: requireString(input.ghl_location_id, "ghl_location_id", errors),
    ghl_opportunity_id: requireString(
      input.ghl_opportunity_id,
      "ghl_opportunity_id",
      errors,
    ),
    ...(optionalString(input.ghl_contact_id) && {
      ghl_contact_id: optionalString(input.ghl_contact_id),
    }),
    ...(contact && {
      contact: {
        name: optionalString(contact.name),
        email: optionalString(contact.email),
        phone: optionalString(contact.phone) ?? null,
      },
    }),
    ...(event && {
      event: {
        name: optionalString(event.name),
        type: optionalString(event.type),
        date: eventDate,
      },
    }),
  };

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, payload };
}

export function buildInquiryEventSnapshot(
  payload: InquiryPayload,
): GhlEventSnapshot {
  return {
    eventName:
      payload.event?.name ??
      (payload.contact?.name
        ? `Inquiry — ${payload.contact.name}`
        : "New inquiry"),
    eventType: payload.event?.type,
    eventDate: payload.event?.date,
    contact: payload.contact,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(
  value: unknown,
  fieldName: string,
  errors: string[],
): string {
  const parsed = optionalString(value);

  if (!parsed) {
    errors.push(`${fieldName} is required`);
  }

  return parsed ?? "";
}

function requireDateString(
  value: unknown,
  fieldName: string,
  errors: string[],
): string {
  const parsed = requireString(value, fieldName, errors);

  if (parsed && !/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
    errors.push(`${fieldName} must use YYYY-MM-DD format`);
  }

  return parsed;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
