import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import { fetchGhlContact } from "@/lib/ghl/contacts";
import { listGhlUsers } from "@/lib/ghl/location-data";
import {
  listGhlEmailTemplates,
  listGhlSnippets,
  renderSnippetMergeTags,
} from "@/lib/ghl/message-templates";

// Feeds the conversations drawer's "Insert snippet" / "Use email template"
// menus. Keyed by contact so snippet merge tags ({{contact.first_name}},
// {{user.name}}, …) come back already filled in for this contact and the
// signed-in planner. Each list carries its own ok/error so a missing scope
// on one feature doesn't hide the other. `?refresh=1` bypasses the cache
// after someone edits snippets in GHL.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const user = await requireAdminUser();
    const { contactId } = await params;
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";

    const [snippets, emailTemplates, contact, ghlUsers] = await Promise.all([
      listGhlSnippets({ refresh }),
      listGhlEmailTemplates({ refresh }),
      fetchGhlContact(contactId),
      listGhlUsers(),
    ]);

    const ghlUser = ghlUsers.find(
      (candidate) =>
        candidate.email &&
        user.email &&
        candidate.email.toLowerCase() === user.email.toLowerCase(),
    );
    const mergeContext = {
      contact,
      user: {
        name: ghlUser?.name ?? null,
        email: ghlUser?.email ?? user.email ?? null,
      },
    };

    return Response.json({
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
      emailTemplates,
    });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
