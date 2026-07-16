import type { Database } from "@/types/database";

export type ChecklistTemplateSection =
  Database["public"]["Tables"]["checklist_template_sections"]["Row"];
export type EventChecklistSection =
  Database["public"]["Tables"]["event_checklist_sections"]["Row"];
export type ChecklistSectionStatus =
  Database["public"]["Enums"]["checklist_section_status"];

// The shared shape rendered by the FAQ accordion and edited by the section
// editor UI, common to template sections and per-event copies.
export type ChecklistSectionFields = {
  id: string;
  title: string;
  content_html: string;
};
