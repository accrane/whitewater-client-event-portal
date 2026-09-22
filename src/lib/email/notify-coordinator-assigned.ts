import { buildCoordinatorAssignedEmail } from "@/lib/email/coordinator-assigned";
import { sendEmail } from "@/lib/email";
import { appConfig, getOptionalEnv } from "@/lib/env";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import { listGhlUsers } from "@/lib/ghl/location-data";
import type { Database, Json } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

// Emails a coordinator when they are assigned an event in the portal. Runs
// after the GHL assignment succeeded and never throws: the assignment is
// already recorded, so a mail problem is logged (Integration Logs,
// `coordinator_assigned_email`) rather than surfaced as a failed save.
//
// Skipped, with no log row, when nothing changed (same coordinator as
// before) or when coordinators assign themselves.

type SnapshotBits = {
  previousCoordinatorId: string | null;
  eventName: string | null;
  eventDate: string | null;
  eventType: string | null;
  contactName: string | null;
  guestCount: number | null;
};

// The few snapshot fields the email needs. events.ts has the full parser,
// but it imports the module that calls this one, so the read stays local.
function readSnapshot(snapshot: Json): SnapshotBits {
  const raw =
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? (snapshot as Record<string, Json | undefined>)
      : {};
  const text = (value: Json | undefined) =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  const record = (value: Json | undefined) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, Json | undefined>)
      : null;
  const guests = raw.numberOfGuests;
  return {
    previousCoordinatorId: text(record(raw.planner)?.id),
    eventName: text(raw.eventName),
    eventDate: text(raw.eventDate),
    eventType: text(raw.eventType),
    contactName: text(record(raw.contact)?.name),
    guestCount: typeof guests === "number" && Number.isFinite(guests) ? guests : null,
  };
}

export async function notifyCoordinatorAssigned({
  event,
  ghlUserId,
  assignedByEmail,
}: {
  // The event row as it was before the assignment was written.
  event: Pick<EventRow, "id" | "ghl_location_id" | "ghl_snapshot">;
  ghlUserId: string;
  // Login email of whoever made the assignment; null when unknown.
  assignedByEmail: string | null;
}): Promise<void> {
  const snapshot = readSnapshot(event.ghl_snapshot);
  if (snapshot.previousCoordinatorId === ghlUserId) return;

  const log = (
    status: "success" | "warning" | "error",
    message: string,
    details: Record<string, Json> = {},
  ) =>
    logIntegrationEvent({
      direction: "PORTAL_TO_GHL",
      eventType: "coordinator_assigned_email",
      ghlLocationId: event.ghl_location_id,
      portalEventId: event.id,
      status,
      message,
      details: { ghl_user_id: ghlUserId, ...details },
    });

  try {
    const users = await listGhlUsers();
    const coordinator = users.find((user) => user.id === ghlUserId);
    if (!coordinator) {
      await log("warning", "Coordinator assignment email skipped: the GHL user could not be found.");
      return;
    }
    if (!coordinator.email) {
      await log("warning", "Coordinator assignment email skipped: the GHL user has no email address.", {
        coordinator: coordinator.name,
      });
      return;
    }
    if (
      assignedByEmail &&
      assignedByEmail.trim().toLowerCase() === coordinator.email.trim().toLowerCase()
    ) {
      return;
    }
    if (!getOptionalEnv("MAILGUN_API_KEY") || !getOptionalEnv("EMAIL_FROM")) {
      await log("warning", "Coordinator assignment email skipped: Mailgun is not configured in this environment.", {
        to: coordinator.email,
      });
      return;
    }

    const email = buildCoordinatorAssignedEmail({
      coordinatorName: coordinator.name,
      eventName: snapshot.eventName ?? "Untitled event",
      eventDate: snapshot.eventDate,
      eventType: snapshot.eventType,
      contactName: snapshot.contactName,
      guestCount: snapshot.guestCount,
      eventUrl: `${appConfig.portalBaseUrl.replace(/\/$/, "")}/admin/events/${event.id}`,
      assignedBy: assignedByEmail,
    });
    await sendEmail({ to: coordinator.email, ...email });
    await log("success", `Emailed ${coordinator.name} about the assignment.`, {
      to: coordinator.email,
      subject: email.subject,
    });
  } catch (error) {
    await log("error", "Failed emailing the coordinator about the assignment.", {
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
  }
}
