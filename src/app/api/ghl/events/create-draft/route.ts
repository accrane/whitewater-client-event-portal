import { parseGhlDraftEventPayload } from "@/lib/ghl/types";

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

  const parsed = parseGhlDraftEventPayload(body);

  if (!parsed.ok) {
    return Response.json(
      { error: "Invalid draft event payload", details: parsed.errors },
      { status: 400 },
    );
  }

  try {
    const { createOrReuseDraftEvent } = await import("@/lib/ghl/draft-events");
    const result = await createOrReuseDraftEvent(parsed.payload);

    return Response.json(
      {
        created: result.created,
        portal_event_id: result.event.id,
        status: result.event.status,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    console.error("Failed processing GHL draft event webhook", error);

    return Response.json(
      { error: "Failed creating draft portal event" },
      { status: 500 },
    );
  }
}
