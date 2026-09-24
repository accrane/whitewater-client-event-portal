"use server";

import { revalidatePath } from "next/cache";

import {
  deleteScheduleTemplateItem,
  moveScheduleTemplateItem,
  saveScheduleTemplateItem,
  type ScheduleItemInput,
} from "@/lib/admin/event-schedule";
import { requireStaffUser } from "@/lib/admin/session";

function revalidateTemplate() {
  revalidatePath("/admin/settings/schedule-template");
}

export async function saveScheduleTemplateItemAction(
  input: ScheduleItemInput,
) {
  await requireStaffUser();
  await saveScheduleTemplateItem(input);
  revalidateTemplate();
}

export async function deleteScheduleTemplateItemAction(itemId: string) {
  await requireStaffUser();
  await deleteScheduleTemplateItem(itemId);
  revalidateTemplate();
}

export async function moveScheduleTemplateItemAction(
  itemId: string,
  direction: "up" | "down",
) {
  await requireStaffUser();
  await moveScheduleTemplateItem(itemId, direction);
  revalidateTemplate();
}
