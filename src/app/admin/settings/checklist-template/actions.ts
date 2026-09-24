"use server";

import { revalidatePath } from "next/cache";

import {
  deleteChecklistTemplateSection,
  moveChecklistTemplateSection,
  saveChecklistTemplateSection,
  type ChecklistSectionInput,
} from "@/lib/admin/checklist-sections";
import { requireStaffUser } from "@/lib/admin/session";

function revalidateTemplate() {
  revalidatePath("/admin/settings/checklist-template");
}

export async function saveChecklistTemplateSectionAction(
  input: ChecklistSectionInput,
) {
  await requireStaffUser();
  await saveChecklistTemplateSection(input);
  revalidateTemplate();
}

export async function deleteChecklistTemplateSectionAction(sectionId: string) {
  await requireStaffUser();
  await deleteChecklistTemplateSection(sectionId);
  revalidateTemplate();
}

export async function moveChecklistTemplateSectionAction(
  sectionId: string,
  direction: "up" | "down",
) {
  await requireStaffUser();
  await moveChecklistTemplateSection(sectionId, direction);
  revalidateTemplate();
}
