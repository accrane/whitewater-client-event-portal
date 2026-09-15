import { appConfig } from "@/lib/env";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import type { InquiryPayload } from "@/lib/ghl/types";
import { parseGhlInquiryPayload } from "@/lib/ghl/types";

// Inbound door for website inquiries: a GHL workflow webhook posts here after
// the form creates the opportunity. GHL's webhook action can only send flat
// custom data, so the delivery may carry nothing but `ghl_opportunity_id` —
// the location falls back to config and the contact + event details are read
// from GHL when the delivery doesn't include them. Values GHL does send win.
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
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    body &&
    typeof body === "object" &&
    !(body as Record<string, unknown>).ghl_location_id &&
    appConfig.ghl.locationId
  ) {
    body = { ...body, ghl_location_id: appConfig.ghl.locationId };
  }

  const parsed = parseGhlInquiryPayload(body);

  if (!parsed.ok) {
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

    return Response.json(
      { error: "Failed creating inquiry event" },
      { status: 500 },
    );
  }
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

function definedOnly<T extends object>(value: T | undefined): Partial<T> {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as Partial<T>;
}
