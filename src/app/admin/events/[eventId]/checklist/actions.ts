"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  applyChecklistSectionsTemplate,
  deleteEventChecklistSection,
  moveEventChecklistSection,
  saveEventChecklistSection,
  setEventChecklistSectionStatus,
  type ChecklistSectionInput,
} from "@/lib/admin/checklist-sections";
import type { ChecklistSectionStatus } from "@/lib/checklist";
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

function revalidateChecklist(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/checklist`);
  revalidatePath(`/admin/events/${eventId}`);
}

export async function applyChecklistSectionsTemplateAction(eventId: string) {
  await requireCoordinator();
  await applyChecklistSectionsTemplate(eventId);
  revalidateChecklist(eventId);
}

export async function saveEventChecklistSectionAction(
  eventId: string,
  input: ChecklistSectionInput,
) {
  await requireCoordinator();
  await saveEventChecklistSection(eventId, input);
  revalidateChecklist(eventId);
}

export async function deleteEventChecklistSectionAction(
  eventId: string,
  sectionId: string,
) {
  await requireCoordinator();
  await deleteEventChecklistSection(eventId, sectionId);
  revalidateChecklist(eventId);
}

export async function setEventChecklistSectionStatusAction(
  eventId: string,
  sectionId: string,
  status: ChecklistSectionStatus,
) {
  await requireCoordinator();
  await setEventChecklistSectionStatus(eventId, sectionId, status);
  revalidateChecklist(eventId);
}

export async function moveEventChecklistSectionAction(
  eventId: string,
  sectionId: string,
  direction: "up" | "down",
) {
  await requireCoordinator();
  await moveEventChecklistSection(eventId, sectionId, direction);
  revalidateChecklist(eventId);
}
