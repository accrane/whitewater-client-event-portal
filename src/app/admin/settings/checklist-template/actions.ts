"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteChecklistTemplateSection,
  moveChecklistTemplateSection,
  saveChecklistTemplateSection,
  type ChecklistSectionInput,
} from "@/lib/admin/checklist-sections";
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
  revalidatePath("/admin/settings/checklist-template");
}

export async function saveChecklistTemplateSectionAction(
  input: ChecklistSectionInput,
) {
  await requireCoordinator();
  await saveChecklistTemplateSection(input);
  revalidateTemplate();
}

export async function deleteChecklistTemplateSectionAction(sectionId: string) {
  await requireCoordinator();
  await deleteChecklistTemplateSection(sectionId);
  revalidateTemplate();
}

export async function moveChecklistTemplateSectionAction(
  sectionId: string,
  direction: "up" | "down",
) {
  await requireCoordinator();
  await moveChecklistTemplateSection(sectionId, direction);
  revalidateTemplate();
}
