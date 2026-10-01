import {
  calendarErrorResponse,
  requireStaffApiUser,
} from "@/lib/admin/calendar-api";
import { parseGhlSnapshot } from "@/lib/admin/events";
import { buildPortalUrlForOrigin } from "@/lib/admin/portal-urls";
import { formatEventDates } from "@/lib/dates/event-dates";
import { appConfig } from "@/lib/env";
import { fetchGhlContact } from "@/lib/ghl/contacts";
import { listGhlUsers } from "@/lib/ghl/location-data";
import { syncProposalLinksFromContracts } from "@/lib/admin/contracts";
import { listGhlSnippets } from "@/lib/ghl/message-templates";
import {
  renderSnippetMergeTags,
  type SnippetMergeContext,
} from "@/lib/ghl/snippet-merge-tags";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";

// Feeds the conversations drawer's compose box: the "Insert snippet" menu
// and whose email signature GHL will add. Keyed by contact so snippet merge
// tags ({{contact.first_name}}, {{user.name}}, …) come back already filled in
// for this contact and the signed-in coordinator. With `?eventId=` the
// event's tags fill in too ({{opportunity.assigned_to}} is the event's
// coordinator, plus the event name, date, portal link, and proposal link),
// read from the stored snapshot — no GHL call, except when the proposal
// link is missing: it's then worked out from the event's own contracts
// (one DB read; a GHL write only if a link is found). Every proposal comes
// from the portal now, so there's nothing to fetch from GHL itself. The list carries its own ok/error so a
// missing scope renders inside the menu. `?refresh=1` bypasses the cache
// after someone edits snippets in GHL.

async function loadEventMergeContext(
  eventId: string | null,
): Promise<SnippetMergeContext["event"]> {
  if (!eventId) return null;
  const supabase = createServiceRoleSupabaseClient();
  const read = () =>
    supabase
      .from("events")
      .select("client_portal_url, ghl_opportunity_id, ghl_snapshot")
      .eq("id", eventId)
      .maybeSingle();
  let { data } = await read();
  if (!data) return null;

  if (!parseGhlSnapshot(data.ghl_snapshot).links?.proposal && data.ghl_opportunity_id) {
    await syncProposalLinksFromContracts(eventId);
    data = (await read()).data ?? data;
  }

  const snapshot = parseGhlSnapshot(data.ghl_snapshot);
  // The whole span for a multi-day event ("October 16–17, 2026").
  const date = formatEventDates(snapshot.eventDate, snapshot.eventEndDate) || null;

  return {
    name: snapshot.eventName ?? null,
    date,
    // Stored as a path ("/e/<token>"); the email needs the full address,
    // the same one launch writes to GHL's Portal Link field.
    portalLink: buildPortalUrlForOrigin({
      origin: appConfig.portalBaseUrl,
      portalUrl: data.client_portal_url,
    }),
    proposalLink: snapshot.links?.proposal ?? null,
    revisedProposalLink: snapshot.links?.revisedProposal ?? null,
    coordinator: snapshot.planner?.name
      ? { name: snapshot.planner.name, email: snapshot.planner.email ?? null }
      : null,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const user = await requireStaffApiUser();
    const { contactId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const refresh = searchParams.get("refresh") === "1";

    const [snippets, contact, ghlUsers, event] = await Promise.all([
      listGhlSnippets({ refresh }),
      fetchGhlContact(contactId),
      listGhlUsers(),
      loadEventMergeContext(searchParams.get("eventId")?.trim() || null),
    ]);

    const ghlUser = ghlUsers.find(
      (candidate) =>
        candidate.email &&
        user.email &&
        candidate.email.toLowerCase() === user.email.toLowerCase(),
    );
    const mergeContext: SnippetMergeContext = {
      contact,
      event,
      user: {
        name: ghlUser?.name ?? null,
        email: ghlUser?.email ?? user.email ?? null,
      },
    };

    // GHL signs drawer emails with the contact's assigned user, whoever
    // sends them; null when nobody is assigned (no signature goes out).
    const assignedTo = contact?.assignedTo ?? null;
    const signer = assignedTo
      ? {
          name:
            ghlUsers.find((candidate) => candidate.id === assignedTo)?.name ??
            null,
          isSender: ghlUser?.id === assignedTo,
        }
      : null;

    return Response.json({
      signer,
      snippets: snippets.ok
        ? {
            ok: true,
            items: snippets.items.map((snippet) => ({
              ...snippet,
              subject: snippet.subject
                ? renderSnippetMergeTags(snippet.subject, mergeContext)
                : null,
              body: renderSnippetMergeTags(snippet.body, mergeContext),
            })),
          }
        : snippets,
    });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
