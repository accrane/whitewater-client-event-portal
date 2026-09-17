"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteScheduleTemplateItem,
  moveScheduleTemplateItem,
  saveScheduleTemplateItem,
  type ScheduleItemInput,
} from "@/lib/admin/event-schedule";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function requireCoordinator() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }
}

function revalidateTemplate() {
  revalidatePath("/admin/settings/schedule-template");
}

export async function saveScheduleTemplateItemAction(
  input: ScheduleItemInput,
) {
  await requireCoordinator();
  await saveScheduleTemplateItem(input);
  revalidateTemplate();
}

export async function deleteScheduleTemplateItemAction(itemId: string) {
  await requireCoordinator();
  await deleteScheduleTemplateItem(itemId);
  revalidateTemplate();
}

export async function moveScheduleTemplateItemAction(
  itemId: string,
  direction: "up" | "down",
) {
  await requireCoordinator();
  await moveScheduleTemplateItem(itemId, direction);
  revalidateTemplate();
}
