import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import {
  getActiveFollowUpPauses,
  pauseFollowUps,
  resumeFollowUps,
} from "@/lib/ghl/follow-up-pauses";

// Pause / resume GHL's automated follow-ups for one contact. GET reports the
// current pause (if any); POST {action: "pause" | "resume"} flips it. The
// tag on the GHL contact is what the chase workflows check; the portal row
// is what the dashboard's "paused too long" list reads.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    await requireAdminUser();
    const { contactId } = await params;
    const pauses = await getActiveFollowUpPauses([contactId]);
    return Response.json({ pause: pauses.get(contactId) ?? null });
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
    const payload = (await request.json()) as {
      action?: string;
      reason?: string;
      opportunityId?: string;
      contactName?: string;
      eventId?: string;
    };
    const portalEventId = payload.eventId?.trim() || null;

    if (payload.action === "pause") {
      const outcome = await pauseFollowUps({
        contactId,
        opportunityId: payload.opportunityId?.trim() || null,
        contactName: payload.contactName?.trim() || null,
        byEmail: user.email ?? null,
        reason: payload.reason?.trim().slice(0, 300) || null,
        portalEventId,
      });
      if (!outcome.ok) {
        return Response.json({ error: outcome.error }, { status: 502 });
      }
      return Response.json({ pause: outcome.pause });
    }

    if (payload.action === "resume") {
      const outcome = await resumeFollowUps({
        contactId,
        byEmail: user.email ?? null,
        reason: "manual",
        portalEventId,
      });
      if (!outcome.ok) {
        return Response.json({ error: outcome.error }, { status: 502 });
      }
      return Response.json({ pause: null });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
