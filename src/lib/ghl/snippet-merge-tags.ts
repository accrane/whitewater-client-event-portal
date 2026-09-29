// GHL does fill merge tags on messages posted through the Conversations API,
// but only from what the send tells it: the contact, and the contact's
// assigned user standing in for {{user.*}} (the send's userId is ignored for
// email — verified 2026-09-24). Opportunity tags have no context there and go
// out blank. Snippets are therefore rendered here for the contact, the event,
// and the coordinator before they land in the compose box; anything unknown
// stays as-is so the drawer can flag it before the coordinator hits Send.
//
// Kept free of app imports so the node test runner can load it directly.
export type SnippetMergeContext = {
  contact: {
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    companyName: string | null;
  } | null;
  // The signed-in portal user, matched to a GHL user by email.
  user: { name: string | null; email: string | null } | null;
  // The portal event the drawer was opened from (or that the opportunity
  // card belongs to). Null when the contact has no portal event yet.
  event: {
    name: string | null;
    // Already formatted for a sentence ("November 20, 2026").
    date: string | null;
    portalLink: string | null;
    // The Proposal Link field (the client's PandaDoc link), as last synced.
    proposalLink: string | null;
    coordinator: { name: string | null; email: string | null } | null;
  } | null;
};

function splitName(name: string | null | undefined): {
  first: string | null;
  last: string | null;
} {
  const [first, ...rest] = (name ?? "").trim().split(/\s+/);
  return { first: first || null, last: rest.join(" ") || null };
}

export function renderSnippetMergeTags(
  text: string,
  context: SnippetMergeContext,
): string {
  const contact = context.contact;
  const event = context.event;
  const coordinator = event?.coordinator ?? null;
  // {{user.*}} is "the person writing to you". That's the signed-in
  // coordinator; when their login has no GHL user match (a manager sending on
  // someone's behalf), the event's assigned coordinator stands in.
  const sender = context.user?.name
    ? context.user
    : coordinator?.name
      ? coordinator
      : context.user;
  const senderName = splitName(sender?.name);

  const values: Record<string, string | null | undefined> = {
    "contact.first_name": contact?.firstName,
    "contact.last_name": contact?.lastName,
    "contact.name": contact?.name,
    "contact.full_name": contact?.name,
    "contact.email": contact?.email,
    "contact.phone": contact?.phone,
    "contact.phone_raw": contact?.phone,
    "contact.company_name": contact?.companyName,
    "user.name": sender?.name,
    "user.full_name": sender?.name,
    "user.first_name": senderName.first,
    "user.last_name": senderName.last,
    "user.email": sender?.email,
    "opportunity.assigned_to": coordinator?.name,
    "opportunity.groupevent_name": event?.name,
    "opportunity.name": event?.name,
    "opportunity.event_date": event?.date,
    "opportunity.portal_link": event?.portalLink,
    "opportunity.proposal_link": event?.proposalLink,
  };

  return text.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (match, key: string) => {
    const value = values[key.toLowerCase()];
    return value ? value : match;
  });
}

// GHL's own tag for a user's email signature. The API has no way to read a
// signature, so the app never renders this one: it's appended to outgoing
// emails and GHL fills it with the contact's assigned user's signature.
export const EMAIL_SIGNATURE_TAG = "{{user.email_signature}}";

const EMAIL_SIGNATURE_PATTERN = /\{\{\s*user\.email_signature\s*\}\}/i;

// The email's HTML ending with the signature tag, unless the message already
// places the tag itself.
export function appendEmailSignature(html: string): string {
  return EMAIL_SIGNATURE_PATTERN.test(html) ? html : `${html}${EMAIL_SIGNATURE_TAG}`;
}

// Merge tags still sitting in a message ("{{opportunity.portal_link}}"),
// deduped in order of appearance. GHL would send each one as a blank — all
// but the signature tag, which GHL fills itself.
export function findUnfilledMergeTags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(/\{\{\s*[^{}]*?\s*\}\}/g)) {
    if (!EMAIL_SIGNATURE_PATTERN.test(match[0])) tags.add(match[0]);
  }
  return [...tags];
}
