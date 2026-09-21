// GHL fills merge tags when it sends from its own UI, but messages posted
// through the Conversations API go out verbatim — GHL blanks whatever tag is
// left. Snippets are therefore rendered here for the contact, the event, and
// the coordinator before they land in the compose box; anything unknown stays
// as-is so the drawer can flag it before the coordinator hits Send.
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
  };

  return text.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (match, key: string) => {
    const value = values[key.toLowerCase()];
    return value ? value : match;
  });
}

// Merge tags still sitting in a message ("{{opportunity.portal_link}}"),
// deduped in order of appearance. GHL would send each one as a blank.
export function findUnfilledMergeTags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(/\{\{\s*[^{}]*?\s*\}\}/g)) {
    tags.add(match[0]);
  }
  return [...tags];
}
