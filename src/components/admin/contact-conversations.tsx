"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SlideOver, SlideOverCloseButton } from "@/components/admin/slide-over";
import { buttonClasses } from "@/components/ui/button";

// Speech-bubble button + slide-in drawer showing the primary contact's GHL
// conversation history for this event, with a reply box that sends through
// GHL (so replies land in the same Conversations thread staff see there).

type DrawerMessage = {
  id: string;
  direction: "inbound" | "outbound";
  messageType: string;
  body: string;
  subject: string | null;
  dateAdded: string | null;
  emailMessageId: string | null;
};

type DrawerConversation = {
  id: string;
  lastMessageDate: string | null;
  messages: DrawerMessage[];
};

type ContactConversationsButtonProps = {
  // GHL contact id; null renders the button disabled.
  contactId: string | null;
  contactName: string | null;
  // Portal event id, when opened from an event page — links integration log
  // rows for sends back to the event.
  eventId?: string;
  // Smaller trigger for tight spots like opportunity cards.
  compact?: boolean;
};

const channelLabels: Record<string, string> = {
  TYPE_EMAIL: "Email",
  TYPE_CUSTOM_EMAIL: "Email",
  TYPE_SMS: "SMS",
  TYPE_CUSTOM_SMS: "SMS",
  TYPE_LIVE_CHAT: "Chat",
  TYPE_WHATSAPP: "WhatsApp",
  TYPE_FACEBOOK: "Facebook",
  TYPE_INSTAGRAM: "Instagram",
  TYPE_GMB: "Google",
};

function formatMessageDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function ContactConversationsButton({
  contactId,
  contactName,
  eventId,
  compact = false,
}: ContactConversationsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-label="Open conversations with this contact"
        className={`rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 ${
          compact ? "p-1.5" : "p-2"
        }`}
        disabled={!contactId}
        onClick={() => setOpen(true)}
        title={contactId ? "View conversations" : "No GHL contact linked"}
        type="button"
      >
        <SpeechBubbleIcon size={compact ? 15 : 20} />
      </button>
      {open && contactId ? (
        <ConversationsDrawer
          contactId={contactId}
          contactName={contactName}
          eventId={eventId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ConversationsDrawer({
  contactId,
  contactName,
  eventId,
  onClose,
}: {
  contactId: string;
  contactName: string | null;
  eventId?: string;
  onClose: () => void;
}) {
  const [conversations, setConversations] = useState<DrawerConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [channel, setChannel] = useState<"Email" | "SMS">("Email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentNotice, setSentNotice] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);

  // State updates only happen after the fetch resolves (loading starts true),
  // so the initial effect never sets state synchronously.
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/ghl/contacts/${contactId}/conversations`);
      const data = (await res.json()) as {
        conversations?: DrawerConversation[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Unable to load conversations");
      }
      setConversations(data.conversations ?? []);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load conversations",
      );
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    (async () => {
      await loadConversations();
    })();
  }, [loadConversations]);

  // Land at the latest message once the thread renders.
  useEffect(() => {
    if (!loading) {
      threadEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [loading, conversations]);

  const allMessages = conversations.flatMap((c) => c.messages);
  const lastEmail = [...allMessages]
    .reverse()
    .find((m) => m.messageType.includes("EMAIL"));

  const handleSend = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    setSendError(null);
    setSentNotice(false);
    try {
      const res = await fetch(`/api/ghl/contacts/${contactId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          body,
          eventId,
          subject:
            channel === "Email"
              ? subject.trim() ||
                (lastEmail?.subject ? `Re: ${lastEmail.subject.replace(/^Re:\s*/i, "")}` : "")
              : undefined,
          replyToEmailMessageId:
            channel === "Email" ? (lastEmail?.emailMessageId ?? undefined) : undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Unable to send the message");
      }
      setBody("");
      setSubject("");
      setSentNotice(true);
      // GHL can take a moment to index the new message; a short delay makes
      // the refresh actually show it.
      setTimeout(() => void loadConversations(), 1500);
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Unable to send the message",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <SlideOver onClose={onClose}>
      {(requestClose) => (
        <>
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Conversations
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-950">
              {contactName || "Event contact"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Synced live from GoHighLevel. Replies send through GHL and stay
              in the same thread.
            </p>
          </div>
          <SlideOverCloseButton onClick={requestClose} />
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">
          {loading ? (
            <p className="text-sm text-slate-500">Loading conversations…</p>
          ) : loadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {loadError}
            </div>
          ) : allMessages.length === 0 ? (
            <p className="text-sm text-slate-500">
              No email or SMS history with this contact yet.
            </p>
          ) : (
            allMessages.map((message) => (
              <div
                className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
                key={message.id}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    message.direction === "outbound"
                      ? "rounded-br-md bg-slate-900 text-slate-100"
                      : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  <p
                    className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${
                      message.direction === "outbound"
                        ? "text-slate-400"
                        : "text-slate-500"
                    }`}
                  >
                    {message.direction === "outbound" ? "Whitewater" : contactName || "Contact"}
                    {" · "}
                    {channelLabels[message.messageType] ?? "Message"}
                    {" · "}
                    {formatMessageDate(message.dateAdded)}
                  </p>
                  {message.subject ? (
                    <p className="mb-1 text-xs font-semibold">
                      {message.subject}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words leading-5">
                    {message.body || "(no text content)"}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={threadEndRef} />
        </div>

        <footer className="space-y-2 border-t border-slate-200 p-4">
          {sendError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {sendError}
            </p>
          ) : null}
          {sentNotice ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Sent through GHL. It may take a moment to appear in the thread.
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              onChange={(e) => setChannel(e.target.value === "SMS" ? "SMS" : "Email")}
              value={channel}
            >
              <option value="Email">Email</option>
              <option value="SMS">SMS</option>
            </select>
            {channel === "Email" ? (
              <input
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800"
                onChange={(e) => setSubject(e.target.value)}
                placeholder={
                  lastEmail?.subject
                    ? `Re: ${lastEmail.subject.replace(/^Re:\s*/i, "")}`
                    : "Subject"
                }
                type="text"
                value={subject}
              />
            ) : null}
          </div>
          <textarea
            className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Reply to ${contactName || "the contact"} by ${channel.toLowerCase()}…`}
            value={body}
          />
          <div className="flex justify-end">
            <button
              className={buttonClasses("primary", "sm")}
              disabled={sending || !body.trim()}
              onClick={() => void handleSend()}
              type="button"
            >
              {sending ? "Sending…" : `Send ${channel}`}
            </button>
          </div>
        </footer>
        </>
      )}
    </SlideOver>
  );
}

function SpeechBubbleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      fill="none"
      height={size}
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
    >
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
