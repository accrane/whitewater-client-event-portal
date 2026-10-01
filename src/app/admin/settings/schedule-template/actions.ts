"use server";

import { revalidatePath } from "next/cache";

import {
  deleteScheduleTemplateItem,
  moveScheduleTemplateItem,
  saveScheduleTemplateItem,
  type ScheduleItemInput,
} from "@/lib/admin/event-schedule";
import { requireAdminUser } from "@/lib/admin/users";

function revalidateTemplate() {
  revalidatePath("/admin/settings/schedule-template");
}

export async function saveScheduleTemplateItemAction(
  input: ScheduleItemInput,
) {
  await requireAdminUser();
  await saveScheduleTemplateItem(input);
  revalidateTemplate();
}

export async function deleteScheduleTemplateItemAction(itemId: string) {
  await requireAdminUser();
  await deleteScheduleTemplateItem(itemId);
  revalidateTemplate();
}

export async function moveScheduleTemplateItemAction(
  itemId: string,
  direction: "up" | "down",
) {
  await requireAdminUser();
  await moveScheduleTemplateItem(itemId, direction);
  revalidateTemplate();
}
