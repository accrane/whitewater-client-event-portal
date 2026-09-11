import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import { appConfig } from "@/lib/env";
import { fetchGhlContact, type GhlContactDnd } from "@/lib/ghl/contacts";
import {
  listContactConversations,
  sendConversationMessage,
} from "@/lib/ghl/conversations";

// Conversations drawer backend, keyed by GHL contact id so the drawer works
// anywhere a contact appears (admin event page, opportunities board). GET
// loads the contact's full GHL conversation history plus the contact's Do
// Not Disturb state; POST sends a typed reply through GHL, refusing a
// channel the contact has DND on (the drawer hides it, but this is the
// backstop). An optional eventId in the POST body links the integration log
// row to a portal event when the drawer was opened from one.

const NO_DND: GhlContactDnd = { all: false, sms: false, email: false };

function dndBlocks(dnd: GhlContactDnd, channel: "Email" | "SMS"): boolean {
  return channel === "SMS" ? dnd.sms : dnd.email;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    await requireAdminUser();
    const { contactId } = await params;
    const [conversations, contact] = await Promise.all([
      listContactConversations(contactId),
      fetchGhlContact(contactId),
    ]);
    return Response.json({ conversations, dnd: contact?.dnd ?? NO_DND });
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
      eventId?: string;
    };

    const channel = payload.channel === "SMS" ? "SMS" : "Email";
    const body = (payload.body ?? "").trim();

    if (!body) {
      return Response.json({ error: "Enter a message to send." }, { status: 400 });
    }

    const contact = await fetchGhlContact(contactId);
    if (contact && dndBlocks(contact.dnd, channel)) {
      return Response.json(
        {
          error: `This contact has Do Not Disturb for ${channel} in GoHighLevel, so the message was not sent.`,
        },
        { status: 409 },
      );
    }

    const outcome = await sendConversationMessage({
      contactId,
      channel,
      body,
      subject: payload.subject?.trim() || null,
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
