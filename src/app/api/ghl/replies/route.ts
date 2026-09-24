import { recordInboundReply } from "@/lib/ghl/replies";
import { readReplyContactId, webhookSecretMatches } from "@/lib/ghl/reply-flags";

// "New reply" door: a GHL workflow ("Customer Replied" trigger → Webhook
// action) posts here whenever a client writes in, so the Opportunities board
// can flag the card without polling GHL. Setup: developer-notes.md §5. Same
// x-portal-webhook-secret header as the inquiry webhook. Deliberately quiet:
// this fires on every inbound message, so rejections go to the server log
// rather than integration_logs.
export async function POST(request: Request) {
  const expectedSecret = process.env.GHL_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return Response.json(
      { error: "Webhook secret is not configured" },
      { status: 500 },
    );
  }

  if (
    !webhookSecretMatches(
      request.headers.get("x-portal-webhook-secret"),
      expectedSecret,
    )
  ) {
    console.warn("Reply webhook rejected: x-portal-webhook-secret missing or wrong");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contactId = readReplyContactId(body);
  if (!contactId) {
    console.warn("Reply webhook rejected: no ghl_contact_id / contact_id");
    return Response.json(
      { error: "Send the contact id as ghl_contact_id" },
      { status: 400 },
    );
  }

  try {
    await recordInboundReply(contactId);
  } catch (error) {
    console.error("Reply webhook failed", contactId, error);
    // 5xx so GHL's webhook retry has a chance.
    return Response.json({ error: "Could not record the reply" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
