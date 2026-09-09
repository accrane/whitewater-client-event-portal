import { appConfig } from "@/lib/env";
import { getGhlApiHeaders } from "@/lib/ghl/client";
import { htmlToText } from "@/lib/ghl/html-text";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";

// GHL Conversations API (message history + replies) for the admin event
// page's conversations drawer. Conversations live per GHL contact, so the
// event's primary contact id is the anchor. The Conversations endpoints use
// their own API version header.
const CONVERSATIONS_API_VERSION = "2021-04-15";

// Real correspondence only — GHL conversations also carry activity noise
// (TYPE_ACTIVITY_OPPORTUNITY, TYPE_ACTIVITY_CONTACT, ...) that planners
// don't need in a message thread.
const DISPLAYABLE_MESSAGE_TYPES = new Set([
  "TYPE_EMAIL",
  "TYPE_SMS",
  "TYPE_LIVE_CHAT",
  "TYPE_WHATSAPP",
  "TYPE_FACEBOOK",
  "TYPE_INSTAGRAM",
  "TYPE_GMB",
  "TYPE_CUSTOM_EMAIL",
  "TYPE_CUSTOM_SMS",
]);

export type GhlConversationMessage = {
  id: string;
  direction: "inbound" | "outbound";
  messageType: string;
  body: string;
  subject: string | null;
  dateAdded: string | null;
  // Underlying email id (meta.email.messageIds tail) for reply threading.
  emailMessageId: string | null;
};

export type GhlContactConversation = {
  id: string;
  lastMessageDate: string | null;
  messages: GhlConversationMessage[];
};

function conversationsHeaders(accessToken: string): HeadersInit {
  return {
    ...getGhlApiHeaders(accessToken),
    Version: CONVERSATIONS_API_VERSION,
  };
}

function toIsoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

// All of a contact's conversations with their displayable messages, oldest
// message first within each conversation. Degrades to an empty list when GHL
// is unconfigured; throws on API failures so callers can tell "no messages"
// from "couldn't load".
export async function listContactConversations(
  contactId: string,
): Promise<GhlContactConversation[]> {
  const { accessToken, apiBaseUrl, locationId } = appConfig.ghl;
  if (!accessToken || !locationId) return [];

  const searchResponse = await fetch(
    `${apiBaseUrl}/conversations/search?locationId=${encodeURIComponent(locationId)}&contactId=${encodeURIComponent(contactId)}&limit=20`,
    { headers: conversationsHeaders(accessToken) },
  );

  if (!searchResponse.ok) {
    throw new Error(`GHL conversations search failed (${searchResponse.status})`);
  }

  const searchData = (await searchResponse.json()) as {
    conversations?: { id?: string; lastMessageDate?: number }[];
  };
  const conversationRows = (searchData.conversations ?? []).filter(
    (conversation) => conversation.id,
  );

  const conversations = await Promise.all(
    conversationRows.map(async (conversation) => ({
      id: conversation.id as string,
      lastMessageDate: toIsoDate(conversation.lastMessageDate),
      messages: await listConversationMessages(conversation.id as string),
    })),
  );

  // Most recently active conversation first.
  return conversations.sort((a, b) =>
    (b.lastMessageDate ?? "").localeCompare(a.lastMessageDate ?? ""),
  );
}

async function listConversationMessages(
  conversationId: string,
): Promise<GhlConversationMessage[]> {
  const { accessToken, apiBaseUrl } = appConfig.ghl;
  if (!accessToken) return [];

  const response = await fetch(
    `${apiBaseUrl}/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`,
    { headers: conversationsHeaders(accessToken) },
  );

  if (!response.ok) {
    throw new Error(`GHL conversation messages fetch failed (${response.status})`);
  }

  const data = (await response.json()) as {
    messages?: { messages?: unknown[] } | unknown[];
  };
  const rawMessages = Array.isArray(data.messages)
    ? data.messages
    : (data.messages?.messages ?? []);

  const messages: GhlConversationMessage[] = [];

  for (const raw of rawMessages) {
    if (!raw || typeof raw !== "object") continue;
    const message = raw as Record<string, unknown>;
    const messageType = String(message.messageType ?? "");
    if (!message.id || !DISPLAYABLE_MESSAGE_TYPES.has(messageType)) continue;

    const meta =
      message.meta && typeof message.meta === "object"
        ? (message.meta as Record<string, unknown>)
        : {};
    const emailMeta =
      meta.email && typeof meta.email === "object"
        ? (meta.email as Record<string, unknown>)
        : {};
    const emailMessageIds = Array.isArray(emailMeta.messageIds)
      ? emailMeta.messageIds.filter((id): id is string => typeof id === "string")
      : [];

    const rawBody = typeof message.body === "string" ? message.body : "";
    const contentType = String(message.contentType ?? "");

    messages.push({
      id: String(message.id),
      direction: message.direction === "inbound" ? "inbound" : "outbound",
      messageType,
      body: contentType.includes("html") ? htmlToText(rawBody) : rawBody.trim(),
      subject:
        typeof emailMeta.subject === "string" && emailMeta.subject
          ? emailMeta.subject
          : null,
      dateAdded: toIsoDate(message.dateAdded),
      emailMessageId: emailMessageIds.at(-1) ?? null,
    });
  }

  // The endpoint returns newest first; the drawer reads top-to-bottom.
  return messages.sort((a, b) =>
    (a.dateAdded ?? "").localeCompare(b.dateAdded ?? ""),
  );
}

export type SendConversationMessageInput = {
  contactId: string;
  channel: "Email" | "SMS";
  // Plain-text message; ignored (may be empty) when emailTemplateId is set.
  body: string;
  subject?: string | null;
  // GHL email-builder template id. GHL renders the designed email and its
  // merge tags itself, so no html is sent alongside it.
  emailTemplateId?: string | null;
  // Email id of the message being replied to; keeps the client's inbox
  // thread intact. Dropped automatically if GHL rejects it.
  replyToEmailMessageId?: string | null;
  ghlLocationId: string | null;
  portalEventId: string | null;
};

export type SendConversationMessageOutcome =
  | { ok: true }
  | { ok: false; error: string };

// Sends a reply through GHL (as the location), so it lands in the same GHL
// conversation staff see in Conversations. Requires the Private
// Integration's "write conversation messages" scope — a 401 here means that
// checkbox isn't ticked in GHL yet.
export async function sendConversationMessage(
  input: SendConversationMessageInput,
): Promise<SendConversationMessageOutcome> {
  const { accessToken, apiBaseUrl } = appConfig.ghl;

  if (!accessToken) {
    return { ok: false, error: "GHL_ACCESS_TOKEN is not configured" };
  }

  const send = async (withThreading: boolean) =>
    fetch(`${apiBaseUrl}/conversations/messages`, {
      method: "POST",
      headers: conversationsHeaders(accessToken),
      body: JSON.stringify({
        type: input.channel,
        contactId: input.contactId,
        ...(input.channel === "Email"
          ? {
              ...(input.emailTemplateId
                ? { templateId: input.emailTemplateId }
                : {
                    html: `<p>${input.body
                      .split(/\n{2,}/)
                      .map((paragraph) => paragraph.replace(/\n/g, "<br/>"))
                      .join("</p><p>")}</p>`,
                  }),
              ...(input.subject ? { subject: input.subject } : {}),
              ...(withThreading && input.replyToEmailMessageId
                ? {
                    replyMessageId: input.replyToEmailMessageId,
                    emailReplyMode: "reply",
                  }
                : {}),
            }
          : { message: input.body }),
      }),
    });

  let response = await send(true);

  // A stale or unexpected reply id shouldn't block the message — retry once
  // as a fresh send.
  if (!response.ok && input.replyToEmailMessageId) {
    response = await send(false);
  }

  const ok = response.ok;
  let error: string | null = null;

  if (!ok) {
    const responseText = await response.text().catch(() => "");
    error =
      response.status === 401
        ? "GHL rejected the send: the integration token is missing the write-conversations scope (enable it under Settings → Private Integrations in GHL)."
        : `GHL responded ${response.status}: ${responseText.slice(0, 300)}`;
  }

  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "conversation_message_send",
    ghlLocationId: input.ghlLocationId,
    portalEventId: input.portalEventId,
    status: ok ? "success" : "error",
    message: ok
      ? input.emailTemplateId
        ? "Sent a GHL email template to the contact's GHL conversation."
        : `Sent a ${input.channel} reply to the contact's GHL conversation.`
      : "Failed sending a conversation reply through GHL.",
    details: {
      ghl_contact_id: input.contactId,
      channel: input.channel,
      ...(input.emailTemplateId
        ? { ghl_email_template_id: input.emailTemplateId }
        : {}),
      ...(error ? { error } : {}),
    },
  });

  return ok ? { ok: true } : { ok: false, error: error ?? "Unknown GHL error" };
}
