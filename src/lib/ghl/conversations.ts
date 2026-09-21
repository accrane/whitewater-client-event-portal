import { appConfig } from "@/lib/env";
import { getGhlApiHeaders } from "@/lib/ghl/client";
import { htmlToText, stripQuotedReply } from "@/lib/ghl/html-text";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";

// GHL Conversations API (message history + replies) for the admin event
// page's conversations drawer. Conversations live per GHL contact, so the
// event's primary contact id is the anchor. The Conversations endpoints use
// their own API version header.
const CONVERSATIONS_API_VERSION = "2021-04-15";

// Real correspondence only — GHL conversations also carry activity noise
// (TYPE_ACTIVITY_OPPORTUNITY, TYPE_ACTIVITY_CONTACT, ...) that coordinators
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
  const threads: Promise<GhlConversationMessage[] | null>[] = [];

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

    const collapsed: GhlConversationMessage = {
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
    };

    // GHL folds a whole email thread into one message row whose body is the
    // first email's — so a client's reply to a portal email would never show.
    // Expand threads into one message per email; a single-email row is
    // already accurate. Falls back to the collapsed row if a fetch fails.
    if (emailMessageIds.length > 1) {
      threads.push(
        listThreadEmails(collapsed, emailMessageIds).then(
          (emails) => emails ?? [collapsed],
        ),
      );
    } else {
      messages.push(collapsed);
    }
  }

  for (const emails of await Promise.all(threads)) {
    if (emails) messages.push(...emails);
  }

  // The endpoint returns newest first; the drawer reads top-to-bottom.
  return messages.sort((a, b) =>
    (a.dateAdded ?? "").localeCompare(b.dateAdded ?? ""),
  );
}

// Longest thread tail fetched per message row; older emails in a longer
// thread are left out rather than fanning out unbounded GHL calls.
const MAX_THREAD_EMAILS = 20;

// The individual emails behind a threaded message row, each as its own
// message with its real direction and only the newly typed text. Null when
// any fetch fails, so the caller can keep the collapsed row instead.
async function listThreadEmails(
  collapsed: GhlConversationMessage,
  emailMessageIds: string[],
): Promise<GhlConversationMessage[] | null> {
  const { accessToken, apiBaseUrl } = appConfig.ghl;
  if (!accessToken) return null;

  try {
    return await Promise.all(
      emailMessageIds.slice(-MAX_THREAD_EMAILS).map(async (emailId) => {
        const response = await fetch(
          `${apiBaseUrl}/conversations/messages/email/${encodeURIComponent(emailId)}`,
          { headers: conversationsHeaders(accessToken) },
        );
        if (!response.ok) {
          throw new Error(`GHL email message fetch failed (${response.status})`);
        }
        const data = (await response.json()) as {
          emailMessage?: Record<string, unknown>;
        } & Record<string, unknown>;
        const email = data.emailMessage ?? data;
        const text = htmlToText(typeof email.body === "string" ? email.body : "");
        // The thread's first email has no quote to strip; replies do.
        const body =
          emailId === emailMessageIds[0] ? text : stripQuotedReply(text);

        return {
          id: `${collapsed.id}:${emailId}`,
          direction: email.direction === "inbound" ? "inbound" : "outbound",
          messageType: collapsed.messageType,
          body: body || "(No new text in this reply.)",
          subject:
            typeof email.subject === "string" && email.subject
              ? email.subject
              : collapsed.subject,
          dateAdded: toIsoDate(email.dateAdded) ?? collapsed.dateAdded,
          emailMessageId: emailId,
        } satisfies GhlConversationMessage;
      }),
    );
  } catch (error) {
    console.error("GHL email thread expansion failed", error);
    return null;
  }
}

export type SendConversationMessageInput = {
  contactId: string;
  channel: "Email" | "SMS";
  // Plain-text message.
  body: string;
  subject?: string | null;
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
              html: `<p>${input.body
                .split(/\n{2,}/)
                .map((paragraph) => paragraph.replace(/\n/g, "<br/>"))
                .join("</p><p>")}</p>`,
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
      ? `Sent a ${input.channel} reply to the contact's GHL conversation.`
      : "Failed sending a conversation reply through GHL.",
    details: {
      ghl_contact_id: input.contactId,
      channel: input.channel,
      ...(error ? { error } : {}),
    },
  });

  return ok ? { ok: true } : { ok: false, error: error ?? "Unknown GHL error" };
}
