"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { SlideOver, SlideOverCloseButton } from "@/components/admin/slide-over";
import { buttonClasses } from "@/components/ui/button";

// Speech-bubble button + slide-in drawer showing the primary contact's GHL
// conversation history for this event, with a reply box that sends through
// GHL (so replies land in the same Conversations thread staff see there).
// The reply box can pull in GHL snippets (inserted as editable text).

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

type Snippet = {
  id: string;
  name: string;
  channel: "Email" | "SMS";
  subject: string | null;
  body: string;
};

type TemplateList<T> =
  | { ok: true; items: T[] }
  | { ok: false; error: string };

type MessageTemplates = {
  snippets: TemplateList<Snippet>;
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
  const [sentNotice, setSentNotice] = useState<string | null>(null);

  // Snippets load once per drawer open (cached server-side); null until
  // they arrive so the menu can say "Loading…".
  const [templates, setTemplates] = useState<MessageTemplates | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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

  const loadTemplates = useCallback(
    async (refresh = false) => {
      try {
        const res = await fetch(
          `/api/ghl/contacts/${contactId}/message-templates${refresh ? "?refresh=1" : ""}`,
        );
        const data = (await res.json()) as Partial<MessageTemplates> & {
          error?: string;
        };
        if (!res.ok || !data.snippets) {
          throw new Error(data.error || "Unable to load snippets");
        }
        setTemplates({ snippets: data.snippets });
        setTemplatesError(null);
      } catch (error) {
        setTemplatesError(
          error instanceof Error ? error.message : "Unable to load snippets",
        );
      }
    },
    [contactId],
  );

  useEffect(() => {
    (async () => {
      await Promise.all([loadConversations(), loadTemplates()]);
    })();
  }, [loadConversations, loadTemplates]);

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
  const replySubject = lastEmail?.subject
    ? `Re: ${lastEmail.subject.replace(/^Re:\s*/i, "")}`
    : "";

  // Drops the snippet at the cursor (or appends), and fills an empty
  // subject line from an email snippet's own subject.
  const insertSnippet = (snippet: Snippet) => {
    const textarea = bodyRef.current;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    const before = body.slice(0, start);
    const after = body.slice(end);
    const separator = before && !before.endsWith("\n") ? "\n" : "";
    const next = `${before}${separator}${snippet.body}${after}`;
    setBody(next);
    if (snippet.channel === "Email" && snippet.subject && !subject.trim()) {
      setSubject(snippet.subject);
    }
    // Put the caret after the inserted text once React has re-rendered.
    const caret = before.length + separator.length + snippet.body.length;
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(caret, caret);
    });
  };

  const canSend = Boolean(body.trim());

  const handleSend = async () => {
    if (!canSend || sending) return;
    setSending(true);
    setSendError(null);
    setSentNotice(null);
    try {
      const res = await fetch(`/api/ghl/contacts/${contactId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          body,
          eventId,
          subject: channel === "Email" ? subject.trim() || replySubject : undefined,
          replyToEmailMessageId:
            channel === "Email"
              ? (lastEmail?.emailMessageId ?? undefined)
              : undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Unable to send the message");
      }
      setSentNotice(
        "Sent through GHL. It may take a moment to appear in the thread.",
      );
      setBody("");
      setSubject("");
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

  const snippetList: TemplateList<Snippet> | null = templates
    ? templates.snippets.ok
      ? {
          ok: true,
          items: templates.snippets.items.filter(
            (snippet) => snippet.channel === channel,
          ),
        }
      : templates.snippets
    : templatesError
      ? { ok: false, error: templatesError }
      : null;

  return (
    <SlideOver onClose={onClose}>
      {(requestClose) => (
        <>
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <p className="type-label text-slate-500">
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
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    message.direction === "outbound"
                      ? "rounded-br-md bg-slate-900 text-slate-100"
                      : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  <p
                    className={`mb-1 type-label ${
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
              {sentNotice}
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
                placeholder={replySubject || "Subject"}
                type="text"
                value={subject}
              />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <InsertMenu
              emptyLabel={`No ${channel === "SMS" ? "SMS" : "email"} snippets in GHL yet.`}
              label="Insert snippet"
              list={snippetList}
              onPick={insertSnippet}
              onRefresh={() => void loadTemplates(true)}
              renderItem={(snippet) => (
                <>
                  <span className="block truncate font-medium text-slate-800">
                    {snippet.name}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {snippet.subject ?? snippet.body}
                  </span>
                </>
              )}
              searchText={(snippet) =>
                `${snippet.name} ${snippet.subject ?? ""} ${snippet.body}`
              }
            />
          </div>

          <textarea
            className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Reply to ${contactName || "the contact"} by ${channel.toLowerCase()}…`}
            ref={bodyRef}
            value={body}
          />
          <div className="flex justify-end">
            <button
              className={buttonClasses("primary", "sm")}
              disabled={sending || !canSend}
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

// Small upward-opening picker for the snippet menu:
// a filter box over a scrollable list, with the loading / scope-error /
// empty states rendered inside the panel so the trigger is always clickable
// and the planner sees exactly why a list is empty.
function InsertMenu<T extends { id: string }>({
  label,
  list,
  emptyLabel,
  onPick,
  onRefresh,
  renderItem,
  searchText,
}: {
  label: string;
  list: TemplateList<T> | null;
  emptyLabel: string;
  onPick: (item: T) => void;
  onRefresh: () => void;
  renderItem: (item: T) => ReactNode;
  searchText: (item: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      cancelAnimationFrame(frame);
    };
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const items =
    list?.ok
      ? list.items.filter(
          (item) =>
            !normalizedQuery ||
            searchText(item).toLowerCase().includes(normalizedQuery),
        )
      : [];

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${buttonClasses("secondary", "sm")} gap-1`}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {label}
        <ChevronIcon />
      </button>
      {open ? (
        <div
          className="absolute bottom-full left-0 z-10 mb-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white shadow-xl"
          // Escape closes just this menu, not the whole drawer.
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
            }
          }}
          role="menu"
        >
          <div className="border-b border-slate-100 p-2">
            <input
              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-800"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
              ref={searchRef}
              type="search"
              value={query}
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {list === null ? (
              <p className="px-3 py-2 text-xs text-slate-500">Loading…</p>
            ) : !list.ok ? (
              <div className="space-y-2 px-3 py-2">
                <p className="text-xs text-red-800">{list.error}</p>
                <button
                  className="text-xs font-semibold text-slate-600 underline-offset-2 hover:underline"
                  onClick={onRefresh}
                  type="button"
                >
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500">
                {normalizedQuery ? "No matches." : emptyLabel}
              </p>
            ) : (
              items.map((item) => (
                <button
                  className="block w-full px-3 py-2 text-left text-sm transition hover:bg-slate-100"
                  key={item.id}
                  onClick={() => {
                    onPick(item);
                    setOpen(false);
                    setQuery("");
                  }}
                  role="menuitem"
                  type="button"
                >
                  {renderItem(item)}
                </button>
              ))
            )}
          </div>
          {list?.ok ? (
            <div className="border-t border-slate-100 px-3 py-1.5 text-right">
              <button
                className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:underline"
                onClick={onRefresh}
                type="button"
              >
                Refresh from GHL
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg fill="none" height="12" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
