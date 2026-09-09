import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import { appConfig } from "@/lib/env";
import {
  listContactConversations,
  sendConversationMessage,
} from "@/lib/ghl/conversations";

// Conversations drawer backend, keyed by GHL contact id so the drawer works
// anywhere a contact appears (admin event page, opportunities board). GET
// loads the contact's full GHL conversation history; POST sends a reply
// through GHL — either a typed body or, for email, a GHL email-builder
// template by id (emailTemplateId; GHL renders it). An optional eventId in
// the POST body links the integration log row to a portal event when the
// drawer was opened from one.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    await requireAdminUser();
    const { contactId } = await params;
    const conversations = await listContactConversations(contactId);
    return Response.json({ conversations });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    await requireAdminUser();
    const { contactId } = await params;

    const payload = (await request.json()) as {
      channel?: string;
      body?: string;
      subject?: string;
      replyToEmailMessageId?: string;
      emailTemplateId?: string;
      eventId?: string;
    };

    const channel = payload.channel === "SMS" ? "SMS" : "Email";
    const body = (payload.body ?? "").trim();
    const emailTemplateId =
      channel === "Email" ? payload.emailTemplateId?.trim() || null : null;

    if (!body && !emailTemplateId) {
      return Response.json({ error: "Enter a message to send." }, { status: 400 });
    }

    const outcome = await sendConversationMessage({
      contactId,
      channel,
      body,
      subject: payload.subject?.trim() || null,
      emailTemplateId,
      replyToEmailMessageId: payload.replyToEmailMessageId || null,
      ghlLocationId: appConfig.ghl.locationId || null,
      portalEventId: payload.eventId?.trim() || null,
    });

    if (!outcome.ok) {
      return Response.json({ error: outcome.error }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
