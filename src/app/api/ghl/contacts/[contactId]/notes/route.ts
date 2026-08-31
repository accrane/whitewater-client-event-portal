import { after } from "next/server";

import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import { appConfig } from "@/lib/env";
import { storeContactBadgeCounts } from "@/lib/ghl/badge-cache";
import { listGhlUsers } from "@/lib/ghl/location-data";
import { createContactNote, listContactNotes } from "@/lib/ghl/notes";

// Notes drawer backend, keyed by GHL contact id so the drawer works anywhere
// a contact appears (admin event page, opportunities board). GET lists the
// contact's GHL notes with author names resolved; POST adds a note to GHL,
// attributed to the GHL user whose email matches the signed-in portal user.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    await requireAdminUser();
    const { contactId } = await params;

    const [notes, users] = await Promise.all([
      listContactNotes(contactId),
      listGhlUsers(),
    ]);
    const userNames = new Map(users.map((user) => [user.id, user.name]));

    // We just loaded the live count anyway — freshen the badge cache free.
    after(() => storeContactBadgeCounts(contactId, { noteCount: notes.length }));

    return Response.json({
      notes: notes.map((note) => ({
        id: note.id,
        body: note.body,
        dateAdded: note.dateAdded,
        authorName: note.userId ? (userNames.get(note.userId) ?? null) : null,
      })),
    });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const user = await requireAdminUser();
    const { contactId } = await params;

    const payload = (await request.json()) as { body?: string; eventId?: string };
    const body = (payload.body ?? "").trim();

    if (!body) {
      return Response.json({ error: "Enter a note to save." }, { status: 400 });
    }

    const users = await listGhlUsers();
    const ghlUserId =
      users.find(
        (ghlUser) =>
          ghlUser.email &&
          user.email &&
          ghlUser.email.toLowerCase() === user.email.toLowerCase(),
      )?.id ?? null;

    const outcome = await createContactNote({
      contactId,
      body,
      userId: ghlUserId,
      ghlLocationId: appConfig.ghl.locationId || null,
      portalEventId: payload.eventId?.trim() || null,
    });

    if (!outcome.ok) {
      return Response.json({ error: outcome.error }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
