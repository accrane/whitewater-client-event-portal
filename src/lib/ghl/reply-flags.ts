import { createHash, timingSafeEqual } from "node:crypto";

// Pure rules behind the pipeline's "New reply" flag (src/lib/ghl/replies.ts,
// POST /api/ghl/replies). Import-free apart from node:crypto so they stay
// testable (tests/ghl/reply-flags.test.mjs).

// GHL ids are short alphanumeric strings; anything else isn't a contact.
const GHL_ID = /^[A-Za-z0-9]{8,64}$/;

// The contact a "Customer Replied" webhook delivery is about. The workflow's
// custom data sends `ghl_contact_id` (same convention as the inquiry
// webhook); GHL's default payload also carries `contact_id`.
export function readReplyContactId(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  for (const key of ["ghl_contact_id", "contact_id", "contactId"]) {
    const value = record[key];
    if (typeof value === "string" && GHL_ID.test(value.trim())) {
      return value.trim();
    }
  }
  return null;
}

// A reply is new until someone opens the contact's conversations after it.
export function hasUnseenReply(row: {
  last_inbound_at: string;
  seen_at: string | null;
}): boolean {
  if (!row.seen_at) return true;
  return Date.parse(row.last_inbound_at) > Date.parse(row.seen_at);
}

// Constant-time check of the x-portal-webhook-secret header. Hashing first
// makes both sides the same length, which timingSafeEqual requires.
export function webhookSecretMatches(
  provided: string | null,
  expected: string,
): boolean {
  if (!provided) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}
