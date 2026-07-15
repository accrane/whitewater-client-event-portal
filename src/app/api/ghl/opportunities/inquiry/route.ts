import { parseGhlInquiryPayload } from "@/lib/ghl/types";

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

  const parsed = parseGhlInquiryPayload(body);

  if (!parsed.ok) {
    return Response.json(
      { error: "Invalid inquiry payload", details: parsed.errors },
      { status: 400 },
    );
  }

  try {
    const { createOrReuseInquiryEvent } = await import(
      "@/lib/ghl/inquiry-events"
    );
    const result = await createOrReuseInquiryEvent(parsed.payload);

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
