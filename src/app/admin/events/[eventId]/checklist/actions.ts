"use server";

import { revalidatePath } from "next/cache";

import {
  applyChecklistSectionsTemplate,
  deleteEventChecklistSection,
  moveEventChecklistSection,
  saveEventChecklistSection,
  setEventChecklistSectionStatus,
  type ChecklistSectionInput,
} from "@/lib/admin/checklist-sections";
import type { ChecklistSectionStatus } from "@/lib/checklist";
import { requireStaffUser } from "@/lib/admin/session";

function revalidateChecklist(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/checklist`);
  revalidatePath(`/admin/events/${eventId}`);
}

export async function applyChecklistSectionsTemplateAction(eventId: string) {
  await requireStaffUser();
  await applyChecklistSectionsTemplate(eventId);
  revalidateChecklist(eventId);
}

export async function saveEventChecklistSectionAction(
  eventId: string,
  input: ChecklistSectionInput,
) {
  await requireStaffUser();
  await saveEventChecklistSection(eventId, input);
  revalidateChecklist(eventId);
}

export async function deleteEventChecklistSectionAction(
  eventId: string,
  sectionId: string,
) {
  await requireStaffUser();
  await deleteEventChecklistSection(eventId, sectionId);
  revalidateChecklist(eventId);
}

export async function setEventChecklistSectionStatusAction(
  eventId: string,
  sectionId: string,
  status: ChecklistSectionStatus,
) {
  await requireStaffUser();
  await setEventChecklistSectionStatus(eventId, sectionId, status);
  revalidateChecklist(eventId);
}

export async function moveEventChecklistSectionAction(
  eventId: string,
  sectionId: string,
  direction: "up" | "down",
) {
  await requireStaffUser();
  await moveEventChecklistSection(eventId, sectionId, direction);
  revalidateChecklist(eventId);
}
