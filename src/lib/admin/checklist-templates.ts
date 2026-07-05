import { buildEventChecklistItemInserts } from "@/lib/admin/checklist-template-builders";
import { buildEventChecklistItemUpdate } from "@/lib/admin/checklist-item-editors";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

import type { ChecklistTemplateItemForInsert } from "./checklist-template-builders";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type ChecklistTemplateRow = Database["public"]["Tables"]["checklist_templates"]["Row"];
type ChecklistTemplateItemRow = Database["public"]["Tables"]["checklist_template_items"]["Row"];
type EventChecklistItemRow = Database["public"]["Tables"]["event_checklist_items"]["Row"];

export type AdminChecklistTemplateOption = {
  id: string;
  name: string;
  eventType: string | null;
  description: string | null;
};

export type AdminEventChecklistItem = {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  clientVisible: boolean;
  clientCompletable: boolean;
  completionMode: string;
  status: EventChecklistItemRow["status"];
  dueDate: string | null;
  sortOrder: number;
};

export type ApplyChecklistTemplateResult = {
  appliedCount: number;
  eventId: string;
  templateId: string;
};

export type UpdateEventChecklistItemInput = {
  clientVisible: boolean;
  completedBy: string | null;
  description: string | null;
  eventId: string;
  itemId: string;
  required: boolean;
  status: string;
  title: string;
};

export async function listActiveChecklistTemplates(): Promise<
  AdminChecklistTemplateOption[]
> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("checklist_templates")
    .select("id, name, event_type, description")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Unable to load checklist templates: ${error.message}`);
  }

  return (data ?? []).map(mapTemplateRowToOption);
}

export async function listEventChecklistItems(
  eventId: string,
): Promise<AdminEventChecklistItem[]> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_checklist_items")
    .select(
      "id, title, description, required, client_visible, client_completable, completion_mode, status, due_date_override, sort_order",
    )
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Unable to load event checklist items: ${error.message}`);
  }

  return (data ?? []).map(mapChecklistItemRowToAdminItem);
}

export async function applyChecklistTemplateToEvent({
  eventId,
  templateId,
}: {
  eventId: string;
  templateId: string;
}): Promise<ApplyChecklistTemplateResult> {
  const supabase = createServiceRoleSupabaseClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    throw new Error(`Unable to load event for checklist setup: ${eventError.message}`);
  }

  if (!event) {
    throw new Error("Unable to apply checklist template: event not found");
  }

  const eventRow = event as EventRow;

  if (eventRow.status !== "draft") {
    throw new Error(
      `Unable to apply checklist template: expected draft event, got ${eventRow.status}`,
    );
  }

  const { count: existingCount, error: existingError } = await supabase
    .from("event_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (existingError) {
    throw new Error(
      `Unable to check existing event checklist items: ${existingError.message}`,
    );
  }

  if ((existingCount ?? 0) > 0) {
    throw new Error(
      "Unable to apply checklist template: this event already has checklist items",
    );
  }

  const { data: templateItems, error: templateItemsError } = await supabase
    .from("checklist_template_items")
    .select(
      "id, title, description, item_type, required, client_visible, client_completable, completion_mode, due_offset_days, sort_order, metadata",
    )
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  if (templateItemsError) {
    throw new Error(
      `Unable to load checklist template items: ${templateItemsError.message}`,
    );
  }

  if (!templateItems || templateItems.length === 0) {
    throw new Error("Unable to apply checklist template: template has no items");
  }

  const inserts = buildEventChecklistItemInserts({
    eventDate: getEventDate(eventRow.ghl_snapshot),
    eventId,
    templateItems: templateItems.map(mapTemplateItemRowToBuilderItem),
  });

  const { error: insertError } = await supabase
    .from("event_checklist_items")
    .insert(inserts as never);

  if (insertError) {
    throw new Error(`Unable to apply checklist template: ${insertError.message}`);
  }

  return {
    appliedCount: inserts.length,
    eventId,
    templateId,
  };
}

export async function updateEventChecklistItem({
  clientVisible,
  completedBy,
  description,
  eventId,
  itemId,
  required,
  status,
  title,
}: UpdateEventChecklistItemInput): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const update = buildEventChecklistItemUpdate({
    clientVisible,
    completedBy,
    description,
    itemId,
    required,
    status,
    title,
  });

  const { data, error } = await supabase
    .from("event_checklist_items")
    .update(update.values as never)
    .eq("id", update.itemId)
    .eq("event_id", eventId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to update checklist item: ${error.message}`);
  }

  if (!data) {
    throw new Error("Unable to update checklist item: item not found for event");
  }
}

function mapTemplateRowToOption(
  row: Pick<ChecklistTemplateRow, "id" | "name" | "event_type" | "description">,
): AdminChecklistTemplateOption {
  return {
    id: row.id,
    name: row.name,
    eventType: row.event_type,
    description: row.description,
  };
}

function mapChecklistItemRowToAdminItem(
  row: Pick<
    EventChecklistItemRow,
    | "id"
    | "title"
    | "description"
    | "required"
    | "client_visible"
    | "client_completable"
    | "completion_mode"
    | "status"
    | "due_date_override"
    | "sort_order"
  >,
): AdminEventChecklistItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    required: row.required,
    clientVisible: row.client_visible,
    clientCompletable: row.client_completable,
    completionMode: row.completion_mode,
    status: row.status,
    dueDate: row.due_date_override,
    sortOrder: row.sort_order,
  };
}

function mapTemplateItemRowToBuilderItem(
  row: Pick<
    ChecklistTemplateItemRow,
    | "id"
    | "title"
    | "description"
    | "item_type"
    | "required"
    | "client_visible"
    | "client_completable"
    | "completion_mode"
    | "due_offset_days"
    | "sort_order"
    | "metadata"
  >,
): ChecklistTemplateItemForInsert {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    item_type: row.item_type,
    required: row.required,
    client_visible: row.client_visible,
    client_completable: row.client_completable,
    completion_mode: row.completion_mode,
    due_offset_days: row.due_offset_days,
    sort_order: row.sort_order,
    metadata: row.metadata,
  };
}

function getEventDate(snapshot: Json): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }

  const value = (snapshot as Record<string, Json | undefined>).eventDate;

  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}
