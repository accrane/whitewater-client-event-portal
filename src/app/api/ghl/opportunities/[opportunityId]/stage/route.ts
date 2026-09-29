import {
  calendarErrorResponse,
  requireStaffApiUser,
} from "@/lib/admin/calendar-api";
import { moveOpportunityStage } from "@/lib/ghl/opportunity-sync";

// Move an opportunity to another stage in the configured pipeline, from the
// pipeline board's "Move to…" menu. POST {stageId, fromStageId?, contactId?,
// reason?, eventId?}; the reason is only used for a move to Lost.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  try {
    const user = await requireStaffApiUser();
    const { opportunityId } = await params;
    const payload = (await request.json()) as {
      stageId?: string;
      fromStageId?: string;
      contactId?: string;
      reason?: string;
      eventId?: string;
    };
    const stageId = payload.stageId?.trim();
    if (!stageId) {
      return Response.json({ error: "Pick a stage." }, { status: 400 });
    }

    const outcome = await moveOpportunityStage({
      opportunityId,
      stageId,
      fromStageId: payload.fromStageId?.trim() || null,
      contactId: payload.contactId?.trim() || null,
      reason: payload.reason?.trim().slice(0, 500) || null,
      byEmail: user.email ?? null,
      portalEventId: payload.eventId?.trim() || null,
    });
    if (!outcome.ok) {
      return Response.json({ error: outcome.error }, { status: 502 });
    }
    return Response.json({ noteError: outcome.noteError });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
