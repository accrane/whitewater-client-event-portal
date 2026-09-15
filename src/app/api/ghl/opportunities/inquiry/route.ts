import { appConfig } from "@/lib/env";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import type { InquiryPayload } from "@/lib/ghl/types";
import { parseGhlInquiryPayload } from "@/lib/ghl/types";

// Inbound door for website inquiries: a GHL workflow webhook posts here after
// the form creates the opportunity. GHL's webhook action can only send flat
// custom data, so the delivery may carry nothing but `ghl_opportunity_id` —
// the location falls back to config and the contact + event details are read
// from GHL when the delivery doesn't include them. Values GHL does send win.
//
// Every delivery the route turns away is written to the integration log as
// `inquiry_webhook_rejected` so a missing draft can be diagnosed from the
// portal, without server logs. A delivery with no opportunity id but a
// contact id is resolved to that contact's newest open opportunity — GHL's
// form-submission trigger doesn't reliably fill `{{opportunity.id}}`.
export async function POST(request: Request) {
  const expectedSecret = process.env.GHL_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-portal-webhook-secret");

  if (!expectedSecret) {
    return Response.json(
      { error: "Webhook secret is not configured" },
      { status: 500 },
    );
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    await logRejected("Unauthorized: the x-portal-webhook-secret header is missing or wrong.", {
      status: 401,
      secret_header_present: Boolean(providedSecret),
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    await logRejected("Invalid JSON body.", { status: 400 });
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (isRecord(body)) {
    if (!body.ghl_location_id && appConfig.ghl.locationId) {
      body = { ...body, ghl_location_id: appConfig.ghl.locationId };
    }
    body = await resolveOpportunityFromContact(body as Record<string, unknown>);
  }

  const parsed = parseGhlInquiryPayload(body);

  if (!parsed.ok) {
    await logRejected("Invalid inquiry payload.", {
      status: 400,
      errors: parsed.errors,
      received: summarize(body),
    });
    return Response.json(
      { error: "Invalid inquiry payload", details: parsed.errors },
      { status: 400 },
    );
  }

  try {
    const payload = await enrichFromGhl(parsed.payload);
    const { createOrReuseInquiryEvent } = await import(
      "@/lib/ghl/inquiry-events"
    );
    const result = await createOrReuseInquiryEvent(payload);

    return Response.json(
      {
        created: result.created,
        portal_event_id: result.event.id,
        status: result.event.status,
        ghl_write_back: result.ghl_write_back,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    console.error("Failed processing GHL inquiry webhook", error);
    await logRejected("Failed creating the inquiry event.", {
      status: 500,
      error: error instanceof Error ? error.message : String(error),
      received: summarize(body),
    });

    return Response.json(
      { error: "Failed creating inquiry event" },
      { status: 500 },
    );
  }
}

// A delivery whose `ghl_opportunity_id` merge field came through empty still
// names the contact; the form just created that contact's newest open
// opportunity in the sales pipeline, so use it.
async function resolveOpportunityFromContact(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const opportunityId = optionalString(body.ghl_opportunity_id);
  if (opportunityId) return body;

  const contactId =
    optionalString(body.ghl_contact_id) ?? optionalString(body.contact_id);
  if (!contactId) return body;

  const { findNewestOpenOpportunityIdForContact } = await import(
    "@/lib/ghl/phone-inquiries"
  );
  const resolved = await findNewestOpenOpportunityIdForContact(contactId);
  if (!resolved) return body;

  await logIntegrationEvent({
    eventType: "create_inquiry_event",
    ghlLocationId: optionalString(body.ghl_location_id) ?? null,
    status: "warning",
    message:
      "Webhook delivery had no opportunity id; used the contact's newest open opportunity.",
    details: { ghl_contact_id: contactId, ghl_opportunity_id: resolved },
  });

  return { ...body, ghl_opportunity_id: resolved, ghl_contact_id: contactId };
}

async function enrichFromGhl(payload: InquiryPayload): Promise<InquiryPayload> {
  if (payload.event?.name && payload.contact?.name) return payload;

  const { buildInquiryPayloadFromOpportunity } = await import(
    "@/lib/ghl/phone-inquiries"
  );
  const built = await buildInquiryPayloadFromOpportunity(
    payload.ghl_opportunity_id,
  );

  if (!built.ok) {
    await logIntegrationEvent({
      eventType: "create_inquiry_event",
      ghlLocationId: payload.ghl_location_id,
      status: "warning",
      message:
        "Webhook delivery had no event details and GHL could not be read; draft created from the delivery alone.",
      details: {
        ghl_opportunity_id: payload.ghl_opportunity_id,
        error: built.error,
      },
    });
    return payload;
  }

  return {
    ...built.payload,
    ...definedOnly(payload),
    contact: { ...built.payload.contact, ...definedOnly(payload.contact) },
    event: { ...built.payload.event, ...definedOnly(payload.event) },
  };
}

async function logRejected(
  message: string,
  details: Record<string, unknown>,
) {
  await logIntegrationEvent({
    eventType: "inquiry_webhook_rejected",
    ghlLocationId: appConfig.ghl.locationId ?? null,
    status: "error",
    message: `Inquiry webhook delivery rejected. ${message}`,
    details: JSON.parse(JSON.stringify(details)),
  });
}

// What the delivery carried, minus anything long: enough to see which
// merge fields GHL filled and which came through empty.
function summarize(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) return { type: typeof body };
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [
      key,
      typeof value === "string"
        ? value.slice(0, 80)
        : isRecord(value)
          ? Object.keys(value)
          : value,
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function definedOnly<T extends object>(value: T | undefined): Partial<T> {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as Partial<T>;
}
