"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  applyScheduleItemsTemplate,
  deleteScheduleItem,
  moveScheduleItem,
  saveScheduleItem,
  type ScheduleItemInput,
} from "@/lib/admin/event-schedule";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function requirePlanner() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }
}

function revalidateSchedule(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/schedule`);
  revalidatePath(`/admin/events/${eventId}`);
}

export async function applyScheduleItemsTemplateAction(eventId: string) {
  await requirePlanner();
  await applyScheduleItemsTemplate(eventId);
  revalidateSchedule(eventId);
}

export async function saveScheduleItemAction(
  eventId: string,
  input: ScheduleItemInput,
) {
  await requirePlanner();
  await saveScheduleItem(eventId, input);
  revalidateSchedule(eventId);
}

export async function deleteScheduleItemAction(eventId: string, itemId: string) {
  await requirePlanner();
  await deleteScheduleItem(eventId, itemId);
  revalidateSchedule(eventId);
}

export async function moveScheduleItemAction(
  eventId: string,
  itemId: string,
  direction: "up" | "down",
) {
  await requirePlanner();
  await moveScheduleItem(eventId, itemId, direction);
  revalidateSchedule(eventId);
}
