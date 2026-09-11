import { appConfig } from "@/lib/env";
import { getGhlApiHeaders } from "@/lib/ghl/client";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import { listGhlUsers } from "@/lib/ghl/location-data";
import { createContactNote } from "@/lib/ghl/notes";
import { fetchConfiguredPipeline } from "@/lib/ghl/opportunities";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// "Pause follow-ups": stops GHL's automated chase messages for a contact
// after an off-system conversation (a phone call, a hallway chat) that GHL
// never saw. The switch both systems understand is a tag on the GHL
// contact — every chase workflow checks for it before each send — and the
// portal keeps its own record here so it can show who paused, flag pauses
// that have lingered, and lift the pause when the deal books or is lost.
// Tags are per contact, so one pause covers every open opportunity that
// person has; that's intended (one sales pipeline).

export const FOLLOW_UP_PAUSE_TAG = "follow-ups-paused";
// A pause older than this lands on the dashboard's "check in" list.
export const STALE_PAUSE_DAYS = 14;

type PauseRow = Database["public"]["Tables"]["follow_up_pauses"]["Row"];

export type FollowUpPause = {
  id: string;
  ghlContactId: string;
  ghlOpportunityId: string | null;
  contactName: string | null;
  pausedBy: string | null;
  reason: string | null;
  pausedAt: string;
};

export type ResumeReason = "manual" | "booked" | "lost" | "won";

const RESUME_LABELS: Record<ResumeReason, string> = {
  manual: "resumed by a planner",
  booked: "the opportunity was booked",
  lost: "the opportunity was marked lost",
  won: "the opportunity was won",
};

function toPause(row: PauseRow): FollowUpPause {
  return {
    id: row.id,
    ghlContactId: row.ghl_contact_id,
    ghlOpportunityId: row.ghl_opportunity_id,
    contactName: row.contact_name,
    pausedBy: row.paused_by,
    reason: row.reason,
    pausedAt: row.paused_at,
  };
}

// Adds or removes one tag on a GHL contact. Removing a tag the contact
// doesn't carry is a no-op in GHL, so resume is safe to call blind.
async function setContactTag(
  contactId: string,
  present: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { accessToken, apiBaseUrl } = appConfig.ghl;
  if (!accessToken) return { ok: false, error: "GHL_ACCESS_TOKEN is not configured" };

  try {
    const response = await fetch(
      `${apiBaseUrl}/contacts/${encodeURIComponent(contactId)}/tags`,
      {
        method: present ? "POST" : "DELETE",
        headers: getGhlApiHeaders(accessToken),
        body: JSON.stringify({ tags: [FOLLOW_UP_PAUSE_TAG] }),
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        error:
          response.status === 401
            ? "GHL rejected the tag change: the integration token is missing the contacts write scope."
            : `GHL responded ${response.status}: ${text.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "GHL tag change failed",
    };
  }
}

async function ghlUserIdForEmail(email: string | null): Promise<string | null> {
  if (!email) return null;
  const users = await listGhlUsers();
  return (
    users.find(
      (user) => user.email && user.email.toLowerCase() === email.toLowerCase(),
    )?.id ?? null
  );
}

// Active pauses for a set of contacts — one query, however many cards.
export async function getActiveFollowUpPauses(
  contactIds: string[],
): Promise<Map<string, FollowUpPause>> {
  const unique = [...new Set(contactIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("follow_up_pauses")
    .select("*")
    .is("resumed_at", null)
    .in("ghl_contact_id", unique);
  if (error) throw error;

  return new Map(
    ((data ?? []) as PauseRow[]).map((row) => [row.ghl_contact_id, toPause(row)]),
  );
}

export async function listActiveFollowUpPauses(): Promise<FollowUpPause[]> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("follow_up_pauses")
    .select("*")
    .is("resumed_at", null)
    .order("paused_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as PauseRow[]).map(toPause);
}

export async function pauseFollowUps({
  contactId,
  opportunityId,
  contactName,
  byEmail,
  reason,
  portalEventId,
}: {
  contactId: string;
  opportunityId: string | null;
  contactName: string | null;
  byEmail: string | null;
  reason: string | null;
  portalEventId: string | null;
}): Promise<{ ok: true; pause: FollowUpPause } | { ok: false; error: string }> {
  const existing = await getActiveFollowUpPauses([contactId]);
  const current = existing.get(contactId);
  if (current) return { ok: true, pause: current };

  // The tag is the part GHL acts on, so it goes first; no record without it.
  const tagged = await setContactTag(contactId, true);
  if (!tagged.ok) {
    await logIntegrationEvent({
      direction: "PORTAL_TO_GHL",
      eventType: "follow_ups_pause",
      ghlLocationId: appConfig.ghl.locationId || null,
      portalEventId,
      status: "error",
      message: "Failed adding the follow-ups-paused tag to the GHL contact.",
      details: { ghl_contact_id: contactId, error: tagged.error },
    });
    return tagged;
  }

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("follow_up_pauses")
    .insert({
      ghl_contact_id: contactId,
      ghl_opportunity_id: opportunityId,
      contact_name: contactName,
      paused_by: byEmail,
      reason,
    })
    .select("*")
    .single();
  if (error) throw error;

  // The note is the call log GHL never got: who paused and why, visible to
  // anyone reading the contact in GHL.
  await createContactNote({
    contactId,
    body: `Follow-ups paused${reason ? `: ${reason}` : ""} (by ${byEmail ?? "the portal"}). Automated chase messages skip this contact until follow-ups are resumed in the portal.`,
    userId: await ghlUserIdForEmail(byEmail),
    ghlLocationId: appConfig.ghl.locationId || null,
    portalEventId,
  });

  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "follow_ups_pause",
    ghlLocationId: appConfig.ghl.locationId || null,
    portalEventId,
    status: "success",
    message: "Follow-ups paused: tag added to the GHL contact and a note written.",
    details: {
      ghl_contact_id: contactId,
      ...(opportunityId ? { ghl_opportunity_id: opportunityId } : {}),
      ...(reason ? { reason } : {}),
    },
  });

  return { ok: true, pause: toPause(data as PauseRow) };
}

export async function resumeFollowUps({
  contactId,
  byEmail,
  reason,
  portalEventId,
}: {
  contactId: string;
  byEmail: string | null;
  reason: ResumeReason;
  portalEventId: string | null;
}): Promise<{ ok: true; resumed: boolean } | { ok: false; error: string }> {
  const untagged = await setContactTag(contactId, false);
  if (!untagged.ok) {
    await logIntegrationEvent({
      direction: "PORTAL_TO_GHL",
      eventType: "follow_ups_resume",
      ghlLocationId: appConfig.ghl.locationId || null,
      portalEventId,
      status: "error",
      message: "Failed removing the follow-ups-paused tag from the GHL contact.",
      details: { ghl_contact_id: contactId, resume_reason: reason, error: untagged.error },
    });
    return untagged;
  }

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("follow_up_pauses")
    .update({
      resumed_at: new Date().toISOString(),
      resumed_by: byEmail,
      resumed_reason: reason,
    })
    .eq("ghl_contact_id", contactId)
    .is("resumed_at", null)
    .select("id");
  if (error) throw error;
  const resumed = (data ?? []).length > 0;

  if (resumed) {
    await createContactNote({
      contactId,
      body: `Follow-ups resumed — ${RESUME_LABELS[reason]}${reason === "manual" && byEmail ? ` (${byEmail})` : ""}. Automated chase messages apply again.`,
      userId: await ghlUserIdForEmail(byEmail),
      ghlLocationId: appConfig.ghl.locationId || null,
      portalEventId,
    });
    await logIntegrationEvent({
      direction: "PORTAL_TO_GHL",
      eventType: "follow_ups_resume",
      ghlLocationId: appConfig.ghl.locationId || null,
      portalEventId,
      status: "success",
      message: `Follow-ups resumed (${RESUME_LABELS[reason]}): tag removed from the GHL contact.`,
      details: { ghl_contact_id: contactId, resume_reason: reason },
    });
  }

  return { ok: true, resumed };
}

// Lifts a pause when the portal itself moves the deal on (contract signed
// → Booked). Never throws: the caller's action is the primary one.
export async function resumeFollowUpsForEvent(
  event: { id: string; ghl_contact_id: string | null },
  reason: ResumeReason,
): Promise<string> {
  if (!event.ghl_contact_id) return "skipped: no GHL contact";
  try {
    const outcome = await resumeFollowUps({
      contactId: event.ghl_contact_id,
      byEmail: null,
      reason,
      portalEventId: event.id,
    });
    if (!outcome.ok) return `error: ${outcome.error}`;
    return outcome.resumed ? "resumed" : "not paused";
  } catch (error) {
    return `error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Deals that book or die inside GHL (no portal action) still need their
// pause lifted. This checks each active pause's opportunity against GHL —
// a handful of calls, since pauses are rare — and resumes the ones whose
// opportunity is won, lost, or sitting in the Booked/Lost stage. Returns
// how many were lifted. GHL workflows on those stages are the other
// backstop (see the manual's GHL checklist).
export async function reconcileFollowUpPauses(limit = 25): Promise<number> {
  const { accessToken, apiBaseUrl, bookedStageId } = appConfig.ghl;
  if (!accessToken) return 0;

  const active = (await listActiveFollowUpPauses()).filter(
    (pause) => pause.ghlOpportunityId,
  );
  if (active.length === 0) return 0;

  const pipeline = await fetchConfiguredPipeline();
  const lostStageId =
    pipeline?.stages.find((stage) => stage.name.trim().toLowerCase() === "lost")
      ?.id ?? null;

  let lifted = 0;
  for (const pause of active.slice(0, limit)) {
    try {
      const response = await fetch(
        `${apiBaseUrl}/opportunities/${encodeURIComponent(pause.ghlOpportunityId!)}`,
        { headers: getGhlApiHeaders(accessToken) },
      );
      if (!response.ok) continue;
      const data = (await response.json()) as {
        opportunity?: { status?: string; pipelineStageId?: string };
      };
      const status = (data.opportunity?.status ?? "").toLowerCase();
      const stageId = data.opportunity?.pipelineStageId ?? null;

      const reason: ResumeReason | null =
        status === "won"
          ? "won"
          : status === "lost" || status === "abandoned"
            ? "lost"
            : stageId && bookedStageId && stageId === bookedStageId
              ? "booked"
              : stageId && lostStageId && stageId === lostStageId
                ? "lost"
                : null;
      if (!reason) continue;

      const outcome = await resumeFollowUps({
        contactId: pause.ghlContactId,
        byEmail: null,
        reason,
        portalEventId: null,
      });
      if (outcome.ok && outcome.resumed) lifted += 1;
    } catch (error) {
      console.error("Follow-up pause reconcile failed", error);
    }
  }
  return lifted;
}

export type StaleFollowUpPause = FollowUpPause & {
  daysPaused: number;
  portalEventId: string | null;
};

// Pauses older than `days`, with the portal event (if one exists for the
// opportunity) so the dashboard can link straight to it.
export async function listStaleFollowUpPauses(
  days = STALE_PAUSE_DAYS,
): Promise<StaleFollowUpPause[]> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const stale = (await listActiveFollowUpPauses()).filter(
    (pause) => new Date(pause.pausedAt).getTime() <= cutoff,
  );
  if (stale.length === 0) return [];

  const opportunityIds = stale
    .map((pause) => pause.ghlOpportunityId)
    .filter((id): id is string => Boolean(id));
  const eventByOpportunity = new Map<string, string>();
  if (opportunityIds.length > 0) {
    const supabase = createServiceRoleSupabaseClient();
    const { data } = await supabase
      .from("events")
      .select("id, ghl_opportunity_id")
      .in("ghl_opportunity_id", opportunityIds);
    for (const row of (data ?? []) as { id: string; ghl_opportunity_id: string | null }[]) {
      if (row.ghl_opportunity_id) eventByOpportunity.set(row.ghl_opportunity_id, row.id);
    }
  }

  return stale.map((pause) => ({
    ...pause,
    daysPaused: Math.floor(
      (Date.now() - new Date(pause.pausedAt).getTime()) / (24 * 60 * 60 * 1000),
    ),
    portalEventId: pause.ghlOpportunityId
      ? (eventByOpportunity.get(pause.ghlOpportunityId) ?? null)
      : null,
  }));
}
