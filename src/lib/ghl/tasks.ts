import { appConfig } from "@/lib/env";
import { getGhlApiHeaders } from "@/lib/ghl/client";
import { textFromMaybeHtml } from "@/lib/ghl/html-text";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";

// GHL contact tasks for the admin event page's tasks drawer. Tasks live on
// the contact in GHL; the app reads them live (never stored), creates new
// ones, and toggles completion — mirroring what GHL's own task list does.

export type GhlContactTask = {
  id: string;
  title: string;
  body: string;
  dueDate: string | null;
  completed: boolean;
  // GHL user the task is assigned to (null when unassigned).
  assignedTo: string | null;
};

export type GhlTaskWriteOutcome = { ok: true } | { ok: false; error: string };

// All tasks on a contact: open tasks first (soonest due first), then
// completed. Throws on API failures so callers can tell "no tasks" from
// "couldn't load"; empty when GHL is unconfigured.
export async function listContactTasks(
  contactId: string,
): Promise<GhlContactTask[]> {
  const { accessToken, apiBaseUrl } = appConfig.ghl;
  if (!accessToken) return [];

  const response = await fetch(
    `${apiBaseUrl}/contacts/${encodeURIComponent(contactId)}/tasks`,
    { headers: getGhlApiHeaders(accessToken) },
  );

  if (!response.ok) {
    throw new Error(`GHL tasks fetch failed (${response.status})`);
  }

  const data = (await response.json()) as {
    tasks?: {
      id?: string;
      title?: string;
      body?: string;
      dueDate?: string;
      completed?: boolean;
      assignedTo?: string;
    }[];
  };

  return (data.tasks ?? [])
    .filter((task) => task.id)
    .map((task) => ({
      id: task.id as string,
      title: textFromMaybeHtml(task.title ?? ""),
      // GHL's task editor saves rich text; render it as plain text.
      body: textFromMaybeHtml(task.body ?? ""),
      dueDate: task.dueDate ?? null,
      completed: task.completed === true,
      assignedTo: task.assignedTo ?? null,
    }))
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    });
}

// Creates a task on the GHL contact. GHL requires a due date.
export async function createContactTask({
  contactId,
  title,
  body,
  dueDate,
  assignedTo,
  ghlLocationId,
  portalEventId,
}: {
  contactId: string;
  title: string;
  body: string | null;
  dueDate: string;
  assignedTo: string | null;
  ghlLocationId: string | null;
  portalEventId: string | null;
}): Promise<GhlTaskWriteOutcome> {
  const { accessToken, apiBaseUrl } = appConfig.ghl;

  if (!accessToken) {
    return { ok: false, error: "GHL_ACCESS_TOKEN is not configured" };
  }

  const response = await fetch(
    `${apiBaseUrl}/contacts/${encodeURIComponent(contactId)}/tasks`,
    {
      method: "POST",
      headers: getGhlApiHeaders(accessToken),
      body: JSON.stringify({
        title,
        dueDate,
        completed: false,
        ...(body ? { body } : {}),
        ...(assignedTo ? { assignedTo } : {}),
      }),
    },
  );

  const ok = response.ok;
  let error: string | null = null;

  if (!ok) {
    const responseText = await response.text().catch(() => "");
    error = `GHL responded ${response.status}: ${responseText.slice(0, 300)}`;
  }

  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "contact_task_create",
    ghlLocationId,
    portalEventId,
    status: ok ? "success" : "error",
    message: ok
      ? "Task added to the GHL contact from the event page."
      : "Failed adding a task to the GHL contact.",
    details: {
      ghl_contact_id: contactId,
      task_title: title,
      ...(error ? { error } : {}),
    },
  });

  return ok ? { ok: true } : { ok: false, error: error ?? "Unknown GHL error" };
}

// Checks a task off (or reopens it), same as ticking it in GHL.
export async function setContactTaskCompleted({
  contactId,
  taskId,
  completed,
  ghlLocationId,
  portalEventId,
}: {
  contactId: string;
  taskId: string;
  completed: boolean;
  ghlLocationId: string | null;
  portalEventId: string | null;
}): Promise<GhlTaskWriteOutcome> {
  const { accessToken, apiBaseUrl } = appConfig.ghl;

  if (!accessToken) {
    return { ok: false, error: "GHL_ACCESS_TOKEN is not configured" };
  }

  const response = await fetch(
    `${apiBaseUrl}/contacts/${encodeURIComponent(contactId)}/tasks/${encodeURIComponent(taskId)}/completed`,
    {
      method: "PUT",
      headers: getGhlApiHeaders(accessToken),
      body: JSON.stringify({ completed }),
    },
  );

  const ok = response.ok;
  let error: string | null = null;

  if (!ok) {
    const responseText = await response.text().catch(() => "");
    error = `GHL responded ${response.status}: ${responseText.slice(0, 300)}`;
  }

  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "contact_task_toggle",
    ghlLocationId,
    portalEventId,
    status: ok ? "success" : "error",
    message: ok
      ? `Task marked ${completed ? "complete" : "open"} on the GHL contact.`
      : "Failed updating a task on the GHL contact.",
    details: {
      ghl_contact_id: contactId,
      ghl_task_id: taskId,
      completed,
      ...(error ? { error } : {}),
    },
  });

  return ok ? { ok: true } : { ok: false, error: error ?? "Unknown GHL error" };
}
