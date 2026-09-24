import {
  calendarErrorResponse,
  requireStaffApiUser,
} from "@/lib/admin/calendar-api";
import { parseGhlSnapshot } from "@/lib/admin/events";
import { formatEventDates } from "@/lib/dates/event-dates";
import { fetchGhlContact } from "@/lib/ghl/contacts";
import { listGhlUsers } from "@/lib/ghl/location-data";
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
// coordinator, plus the event name, date, and portal link), read from the
// stored snapshot — no extra GHL call. The list carries its own ok/error so a
// missing scope renders inside the menu. `?refresh=1` bypasses the cache
// after someone edits snippets in GHL.

async function loadEventMergeContext(
  eventId: string | null,
): Promise<SnippetMergeContext["event"]> {
  if (!eventId) return null;
  const supabase = createServiceRoleSupabaseClient();
  const { data } = await supabase
    .from("events")
    .select("client_portal_url, ghl_snapshot")
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;

  const snapshot = parseGhlSnapshot(data.ghl_snapshot);
  // The whole span for a multi-day event ("October 16–17, 2026").
  const date = formatEventDates(snapshot.eventDate, snapshot.eventEndDate) || null;

  return {
    name: snapshot.eventName ?? null,
    date,
    portalLink: data.client_portal_url,
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
