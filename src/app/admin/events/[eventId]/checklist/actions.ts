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

async function requirePlanner() {
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
  await requirePlanner();
  await applyChecklistSectionsTemplate(eventId);
  revalidateChecklist(eventId);
}

export async function saveEventChecklistSectionAction(
  eventId: string,
  input: ChecklistSectionInput,
) {
  await requirePlanner();
  await saveEventChecklistSection(eventId, input);
  revalidateChecklist(eventId);
}

export async function deleteEventChecklistSectionAction(
  eventId: string,
  sectionId: string,
) {
  await requirePlanner();
  await deleteEventChecklistSection(eventId, sectionId);
  revalidateChecklist(eventId);
}

export async function setEventChecklistSectionStatusAction(
  eventId: string,
  sectionId: string,
  status: ChecklistSectionStatus,
) {
  await requirePlanner();
  await setEventChecklistSectionStatus(eventId, sectionId, status);
  revalidateChecklist(eventId);
}

export async function moveEventChecklistSectionAction(
  eventId: string,
  sectionId: string,
  direction: "up" | "down",
) {
  await requirePlanner();
  await moveEventChecklistSection(eventId, sectionId, direction);
  revalidateChecklist(eventId);
}
