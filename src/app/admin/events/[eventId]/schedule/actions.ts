"use server";

import { revalidatePath } from "next/cache";

import {
  applyScheduleItemsTemplate,
  deleteScheduleItem,
  moveScheduleItem,
  saveScheduleItem,
  type ScheduleItemInput,
} from "@/lib/admin/event-schedule";
import { requireStaffUser } from "@/lib/admin/session";

function revalidateSchedule(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/schedule`);
  revalidatePath(`/admin/events/${eventId}`);
}

export async function applyScheduleItemsTemplateAction(eventId: string) {
  await requireStaffUser();
  await applyScheduleItemsTemplate(eventId);
  revalidateSchedule(eventId);
}

export async function saveScheduleItemAction(
  eventId: string,
  input: ScheduleItemInput,
) {
  await requireStaffUser();
  await saveScheduleItem(eventId, input);
  revalidateSchedule(eventId);
}

export async function deleteScheduleItemAction(eventId: string, itemId: string) {
  await requireStaffUser();
  await deleteScheduleItem(eventId, itemId);
  revalidateSchedule(eventId);
}

export async function moveScheduleItemAction(
  eventId: string,
  itemId: string,
  direction: "up" | "down",
) {
  await requireStaffUser();
  await moveScheduleItem(eventId, itemId, direction);
  revalidateSchedule(eventId);
}
