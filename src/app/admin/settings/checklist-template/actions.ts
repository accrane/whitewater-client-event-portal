"use server";

import { revalidatePath } from "next/cache";

import {
  deleteChecklistTemplateSection,
  moveChecklistTemplateSection,
  saveChecklistTemplateSection,
  type ChecklistSectionInput,
} from "@/lib/admin/checklist-sections";
import { requireAdminUser } from "@/lib/admin/users";

function revalidateTemplate() {
  revalidatePath("/admin/settings/checklist-template");
}

export async function saveChecklistTemplateSectionAction(
  input: ChecklistSectionInput,
) {
  await requireAdminUser();
  await saveChecklistTemplateSection(input);
  revalidateTemplate();
}

export async function deleteChecklistTemplateSectionAction(sectionId: string) {
  await requireAdminUser();
  await deleteChecklistTemplateSection(sectionId);
  revalidateTemplate();
}

export async function moveChecklistTemplateSectionAction(
  sectionId: string,
  direction: "up" | "down",
) {
  await requireAdminUser();
  await moveChecklistTemplateSection(sectionId, direction);
  revalidateTemplate();
}
