import { appConfig } from "@/lib/env";
import { getGhlApiHeaders } from "@/lib/ghl/client";
import { htmlToText } from "@/lib/ghl/html-text";

// GHL's two reusable-message features, read for the conversations drawer's
// "Insert" menus:
//
// - Snippets (GHL Settings → Snippets; API "location templates") — short
//   email/SMS bodies staff paste into replies. Their text is inserted into
//   the drawer's compose box so the planner can tweak it before sending.
// - Email templates (GHL Marketing → Emails → Templates; the email builder)
//   — designed HTML emails. These can't be edited in a plain textarea, so
//   the drawer sends them by id and GHL renders the design itself.
//
// Both lists change rarely and are location-wide, so they're cached per
// process for a few minutes: the Opportunities board can open dozens of
// drawers in a session and shouldn't hit GHL for the same list each time.
// Each read needs its own Private Integration scope; a 401 is reported as a
// scope problem so the drawer can say exactly what to enable.

const CACHE_TTL_MS = 5 * 60 * 1000;

export type GhlSnippet = {
  id: string;
  name: string;
  channel: "Email" | "SMS";
  subject: string | null;
  // Plain text — email snippets arrive as HTML and are flattened here.
  body: string;
};

export type GhlEmailTemplate = {
  id: string;
  name: string;
  subject: string | null;
  previewUrl: string | null;
  updatedAt: string | null;
};

export type TemplateListResult<T> =
  | { ok: true; items: T[] }
  | { ok: false; error: string };

type CacheEntry<T> = { expiresAt: number; result: TemplateListResult<T> };

let snippetCache: CacheEntry<GhlSnippet> | null = null;
let emailTemplateCache: CacheEntry<GhlEmailTemplate> | null = null;

function scopeError(feature: string, scope: string): string {
  return `${feature} are unavailable: the GHL integration token is missing the "${scope}" scope (enable it under Settings → Private Integrations in GHL).`;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Snippets, both channels, sorted by name. Always resolves — the drawer
// renders the error text inside its menu instead of failing to open.
export async function listGhlSnippets(
  options: { refresh?: boolean } = {},
): Promise<TemplateListResult<GhlSnippet>> {
  if (!options.refresh && snippetCache && snippetCache.expiresAt > Date.now()) {
    return snippetCache.result;
  }

  const result = await fetchSnippets();
  // Only cache successes; a scope fix should show up on the next open.
  if (result.ok) {
    snippetCache = { expiresAt: Date.now() + CACHE_TTL_MS, result };
  }
  return result;
}

async function fetchSnippets(): Promise<TemplateListResult<GhlSnippet>> {
  const { accessToken, apiBaseUrl, locationId } = appConfig.ghl;
  if (!accessToken || !locationId) {
    return { ok: false, error: "GHL is not configured." };
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/locations/${encodeURIComponent(locationId)}/templates?originId=${encodeURIComponent(locationId)}&deleted=false&limit=100`,
      { headers: getGhlApiHeaders(accessToken) },
    );

    if (response.status === 401) {
      return {
        ok: false,
        error: scopeError("Snippets", "locations/templates.readonly"),
      };
    }
    if (!response.ok) {
      return { ok: false, error: `GHL snippets lookup failed (${response.status}).` };
    }

    const data = (await response.json()) as {
      templates?: unknown[];
    };

    const snippets: GhlSnippet[] = [];

    for (const raw of data.templates ?? []) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      if (!row.id) continue;

      const type = String(row.type ?? "").toLowerCase();
      const channel: GhlSnippet["channel"] | null =
        type === "email" ? "Email" : type === "sms" ? "SMS" : null;
      if (!channel) continue;

      const template =
        row.template && typeof row.template === "object"
          ? (row.template as Record<string, unknown>)
          : {};

      // SMS snippets carry `body`; email snippets carry `html` (builder) or
      // `body` (plain editor) plus a subject.
      const rawBody =
        stringOrNull(template.html) ??
        stringOrNull(template.body) ??
        stringOrNull(row.body) ??
        "";
      const body = /<[a-z][\s\S]*>/i.test(rawBody) ? htmlToText(rawBody) : rawBody;
      if (!body) continue;

      snippets.push({
        id: String(row.id),
        name: stringOrNull(row.name) ?? "Untitled snippet",
        channel,
        subject: stringOrNull(template.subject),
        body,
      });
    }

    return {
      ok: true,
      items: snippets.sort((a, b) => a.name.localeCompare(b.name)),
    };
  } catch (error) {
    console.error("GHL snippets lookup failed", error);
    return { ok: false, error: "GHL snippets lookup failed." };
  }
}

// Email-builder templates, newest-updated first.
export async function listGhlEmailTemplates(
  options: { refresh?: boolean } = {},
): Promise<TemplateListResult<GhlEmailTemplate>> {
  if (
    !options.refresh &&
    emailTemplateCache &&
    emailTemplateCache.expiresAt > Date.now()
  ) {
    return emailTemplateCache.result;
  }

  const result = await fetchEmailTemplates();
  if (result.ok) {
    emailTemplateCache = { expiresAt: Date.now() + CACHE_TTL_MS, result };
  }
  return result;
}

async function fetchEmailTemplates(): Promise<
  TemplateListResult<GhlEmailTemplate>
> {
  const { accessToken, apiBaseUrl, locationId } = appConfig.ghl;
  if (!accessToken || !locationId) {
    return { ok: false, error: "GHL is not configured." };
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/emails/builder?locationId=${encodeURIComponent(locationId)}&limit=100&offset=0`,
      { headers: getGhlApiHeaders(accessToken) },
    );

    if (response.status === 401) {
      return {
        ok: false,
        error: scopeError("Email templates", "emails/builder.readonly"),
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        error: `GHL email templates lookup failed (${response.status}).`,
      };
    }

    const data = (await response.json()) as unknown;
    // The builder list has shipped both as a bare array and wrapped in
    // {templates|data}; accept either.
    const rows: unknown[] = Array.isArray(data)
      ? data
      : data && typeof data === "object"
        ? ((data as { templates?: unknown[]; data?: unknown[] }).templates ??
          (data as { data?: unknown[] }).data ??
          [])
        : [];

    const templates: GhlEmailTemplate[] = [];

    for (const raw of rows) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const id = stringOrNull(row.id) ?? stringOrNull(row._id);
      if (!id) continue;

      const updatedAt =
        stringOrNull(row.lastUpdated) ??
        stringOrNull(row.updatedAt) ??
        stringOrNull(row.dateAdded);

      templates.push({
        id,
        name: stringOrNull(row.name) ?? "Untitled template",
        subject: stringOrNull(row.subject),
        previewUrl: stringOrNull(row.previewUrl),
        updatedAt,
      });
    }

    return {
      ok: true,
      items: templates.sort((a, b) =>
        (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
      ),
    };
  } catch (error) {
    console.error("GHL email templates lookup failed", error);
    return { ok: false, error: "GHL email templates lookup failed." };
  }
}

// GHL fills merge tags when it sends from its own UI, but messages posted
// through the Conversations API go out verbatim. Snippets are therefore
// rendered here for the contact (and the sending planner) before they land
// in the compose box; anything unknown stays as-is so the planner spots it
// before hitting Send.
export type SnippetMergeContext = {
  contact: {
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  user: { name: string | null; email: string | null } | null;
};

export function renderSnippetMergeTags(
  text: string,
  context: SnippetMergeContext,
): string {
  const contact = context.contact;
  const user = context.user;
  const [userFirst, ...userRest] = (user?.name ?? "").trim().split(/\s+/);

  const values: Record<string, string | null | undefined> = {
    "contact.first_name": contact?.firstName,
    "contact.last_name": contact?.lastName,
    "contact.name": contact?.name,
    "contact.full_name": contact?.name,
    "contact.email": contact?.email,
    "contact.phone": contact?.phone,
    "contact.phone_raw": contact?.phone,
    "user.name": user?.name,
    "user.full_name": user?.name,
    "user.first_name": userFirst || null,
    "user.last_name": userRest.join(" ") || null,
    "user.email": user?.email,
  };

  return text.replace(
    /\{\{\s*([a-z_.]+)\s*\}\}/gi,
    (match, key: string) => {
      const value = values[key.toLowerCase()];
      return value ? value : match;
    },
  );
}
