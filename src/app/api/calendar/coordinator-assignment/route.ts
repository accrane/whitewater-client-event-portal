import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import { assignOpportunityCoordinator } from "@/lib/ghl/opportunity-sync";

export async function POST(request: Request) {
  try {
    await requireAdminUser();
    const body = (await request.json()) as {
      event_id?: string;
      ghl_user_id?: string;
    };

    if (!body.event_id || !body.ghl_user_id) {
      return Response.json(
        { error: "event_id and ghl_user_id are required" },
        { status: 400 },
      );
    }

    // Outcome is logged server-side; the reservation save must not fail on
    // a GHL hiccup, so this always answers 200 with the outcome attached.
    const outcome = await assignOpportunityCoordinator(
      body.event_id,
      body.ghl_user_id,
    );

    return Response.json(outcome);
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
