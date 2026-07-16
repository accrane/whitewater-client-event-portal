import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type {
  ChecklistSectionStatus,
  ChecklistTemplateSection,
  EventChecklistSection,
} from "@/lib/checklist";
import type { Database } from "@/types/database";

type SectionInsert =
  Database["public"]["Tables"]["checklist_template_sections"]["Insert"];
type EventSectionInsert =
  Database["public"]["Tables"]["event_checklist_sections"]["Insert"];

export async function getChecklistTemplateSections(): Promise<
  ChecklistTemplateSection[]
> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("checklist_template_sections")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ChecklistTemplateSection[];
}

export type ChecklistSectionInput = {
  id?: string;
  title: string;
  contentHtml: string;
  sortOrder?: number;
};

export async function saveChecklistTemplateSection(
  input: ChecklistSectionInput,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const values = {
    title: input.title,
    content_html: input.contentHtml,
  };

  if (input.id) {
    const { error } = await supabase
      .from("checklist_template_sections")
      .update(values as never)
      .eq("id", input.id);
    if (error) throw error;
    return;
  }

  const insert: SectionInsert = {
    ...values,
    sort_order: input.sortOrder ?? 0,
  };
  const { error } = await supabase
    .from("checklist_template_sections")
    .insert(insert as never);
  if (error) throw error;
}

export async function deleteChecklistTemplateSection(
  sectionId: string,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase
    .from("checklist_template_sections")
    .delete()
    .eq("id", sectionId);
  if (error) throw error;
}

export async function getEventChecklistSections(
  eventId: string,
): Promise<EventChecklistSection[]> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_checklist_sections")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as EventChecklistSection[];
}

export async function saveEventChecklistSection(
  eventId: string,
  input: ChecklistSectionInput,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const values = {
    title: input.title,
    content_html: input.contentHtml,
  };

  if (input.id) {
    const { error } = await supabase
      .from("event_checklist_sections")
      .update(values as never)
      .eq("id", input.id)
      .eq("event_id", eventId);
    if (error) throw error;
    return;
  }

  const insert: EventSectionInsert = {
    event_id: eventId,
    ...values,
    sort_order: input.sortOrder ?? 0,
  };
  const { error } = await supabase
    .from("event_checklist_sections")
    .insert(insert as never);
  if (error) throw error;
}

export async function deleteEventChecklistSection(
  eventId: string,
  sectionId: string,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase
    .from("event_checklist_sections")
    .delete()
    .eq("id", sectionId)
    .eq("event_id", eventId);
  if (error) throw error;
}

// Planner review controls: check a client-submitted section off as complete,
// or reopen it so the client can look at it again.
export async function setEventChecklistSectionStatus(
  eventId: string,
  sectionId: string,
  status: ChecklistSectionStatus,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase
    .from("event_checklist_sections")
    .update({ status } as never)
    .eq("id", sectionId)
    .eq("event_id", eventId);
  if (error) throw error;
}

// Same renumber-and-swap approach as moveScheduleItem: ordering survives gaps
// or duplicate sort values.
export async function moveEventChecklistSection(
  eventId: string,
  sectionId: string,
  direction: "up" | "down",
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const sections = await getEventChecklistSections(eventId);
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index === -1) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sections.length) return;

  const reordered = [...sections];
  [reordered[index], reordered[targetIndex]] = [
    reordered[targetIndex],
    reordered[index],
  ];

  for (const [sortOrder, section] of reordered.entries()) {
    if (section.sort_order === sortOrder) continue;
    const { error } = await supabase
      .from("event_checklist_sections")
      .update({ sort_order: sortOrder } as never)
      .eq("id", section.id)
      .eq("event_id", eventId);
    if (error) throw error;
  }
}

// Replaces the event's checklist sections with copies of the template.
// Copies, not references: later template edits never touch existing events,
// and per-event sections added on the fly never touch the template.
export async function applyChecklistSectionsTemplate(
  eventId: string,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const templateSections = await getChecklistTemplateSections();

  const { error: clearError } = await supabase
    .from("event_checklist_sections")
    .delete()
    .eq("event_id", eventId);
  if (clearError) throw clearError;

  if (templateSections.length === 0) return;

  const inserts: EventSectionInsert[] = templateSections.map(
    (section, index) => ({
      event_id: eventId,
      title: section.title,
      content_html: section.content_html,
      sort_order: index,
    }),
  );

  const { error } = await supabase
    .from("event_checklist_sections")
    .insert(inserts as never);
  if (error) throw error;
}

// Same renumber-and-swap approach as moveScheduleTemplateItem: ordering
// survives gaps or duplicate sort values.
export async function moveChecklistTemplateSection(
  sectionId: string,
  direction: "up" | "down",
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const sections = await getChecklistTemplateSections();
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index === -1) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sections.length) return;

  const reordered = [...sections];
  [reordered[index], reordered[targetIndex]] = [
    reordered[targetIndex],
    reordered[index],
  ];

  for (const [sortOrder, section] of reordered.entries()) {
    if (section.sort_order === sortOrder) continue;
    const { error } = await supabase
      .from("checklist_template_sections")
      .update({ sort_order: sortOrder } as never)
      .eq("id", section.id);
    if (error) throw error;
  }
}
