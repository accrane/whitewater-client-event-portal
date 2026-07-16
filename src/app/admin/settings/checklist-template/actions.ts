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

async function requirePlanner() {
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
  await requirePlanner();
  await saveChecklistTemplateSection(input);
  revalidateTemplate();
}

export async function deleteChecklistTemplateSectionAction(sectionId: string) {
  await requirePlanner();
  await deleteChecklistTemplateSection(sectionId);
  revalidateTemplate();
}

export async function moveChecklistTemplateSectionAction(
  sectionId: string,
  direction: "up" | "down",
) {
  await requirePlanner();
  await moveChecklistTemplateSection(sectionId, direction);
  revalidateTemplate();
}
