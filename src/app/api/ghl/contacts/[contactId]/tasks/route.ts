import { after } from "next/server";

import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import { appConfig } from "@/lib/env";
import { storeContactBadgeCounts } from "@/lib/ghl/badge-cache";
import { listGhlUsers } from "@/lib/ghl/location-data";
import {
  createContactTask,
  listContactTasks,
  setContactTaskCompleted,
} from "@/lib/ghl/tasks";

// Tasks drawer backend, keyed by GHL contact id so the drawer works anywhere
// a contact appears (admin event page, opportunities board). GET lists the
// contact's GHL tasks (with assignee names, plus the location's users for
// the create form's assignee picker); POST creates a task; PATCH checks one
// off or reopens it — all straight against GHL.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const user = await requireAdminUser();
    const { contactId } = await params;

    const [tasks, users] = await Promise.all([
      listContactTasks(contactId),
      listGhlUsers(),
    ]);
    const userNames = new Map(users.map((ghlUser) => [ghlUser.id, ghlUser.name]));

    // We just loaded the live count anyway — freshen the badge cache free.
    after(() =>
      storeContactBadgeCounts(contactId, {
        openTaskCount: tasks.filter((task) => !task.completed).length,
      }),
    );
    const currentGhlUserId =
      users.find(
        (ghlUser) =>
          ghlUser.email &&
          user.email &&
          ghlUser.email.toLowerCase() === user.email.toLowerCase(),
      )?.id ?? null;

    return Response.json({
      currentGhlUserId,
      users: users.map((ghlUser) => ({ id: ghlUser.id, name: ghlUser.name })),
      tasks: tasks.map((task) => ({
        ...task,
        assigneeName: task.assignedTo
          ? (userNames.get(task.assignedTo) ?? null)
          : null,
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
    await requireAdminUser();
    const { contactId } = await params;

    const payload = (await request.json()) as {
      title?: string;
      body?: string;
      dueDate?: string;
      assignedTo?: string;
      eventId?: string;
    };

    const title = (payload.title ?? "").trim();
    const dueDate = (payload.dueDate ?? "").trim();

    if (!title) {
      return Response.json({ error: "Enter a task title." }, { status: 400 });
    }

    if (!dueDate || Number.isNaN(new Date(dueDate).getTime())) {
      return Response.json(
        { error: "Pick a due date — GHL requires one." },
        { status: 400 },
      );
    }

    const outcome = await createContactTask({
      contactId,
      title,
      body: payload.body?.trim() || null,
      dueDate: new Date(dueDate).toISOString(),
      assignedTo: payload.assignedTo?.trim() || null,
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    await requireAdminUser();
    const { contactId } = await params;

    const payload = (await request.json()) as {
      taskId?: string;
      completed?: boolean;
      eventId?: string;
    };

    if (!payload.taskId) {
      return Response.json({ error: "Missing task id." }, { status: 400 });
    }

    const outcome = await setContactTaskCompleted({
      contactId,
      taskId: payload.taskId,
      completed: payload.completed === true,
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
