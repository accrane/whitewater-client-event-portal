type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue | undefined }
  | JsonValue[];

export type ChecklistTemplateItemForInsert = {
  id: string;
  title: string;
  description: string | null;
  item_type: string;
  required: boolean;
  client_visible: boolean;
  client_completable: boolean;
  completion_mode: string;
  due_offset_days: number | null;
  sort_order: number;
  metadata: JsonValue;
};

export type EventChecklistItemInsertFromTemplate = {
  event_id: string;
  source_template_item_id: string;
  title: string;
  description: string | null;
  item_type: string;
  required: boolean;
  client_visible: boolean;
  client_completable: boolean;
  completion_mode: string;
  due_offset_days: number | null;
  due_date_override: string | null;
  sort_order: number;
  metadata: JsonValue;
};

export function buildEventChecklistItemInserts({
  eventDate,
  eventId,
  templateItems,
}: {
  eventDate: string | null;
  eventId: string;
  templateItems: ChecklistTemplateItemForInsert[];
}): EventChecklistItemInsertFromTemplate[] {
  return templateItems.map((item) => ({
    event_id: eventId,
    source_template_item_id: item.id,
    title: item.title,
    description: item.description,
    item_type: item.item_type,
    required: item.required,
    client_visible: item.client_visible,
    client_completable: item.client_completable,
    completion_mode: item.completion_mode,
    due_offset_days: item.due_offset_days,
    due_date_override: calculateDueDate(eventDate, item.due_offset_days),
    sort_order: item.sort_order,
    metadata: item.metadata,
  }));
}

function calculateDueDate(
  eventDate: string | null,
  dueOffsetDays: number | null,
): string | null {
  if (!eventDate || dueOffsetDays === null || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return null;
  }

  const [year, month, day] = eventDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() - dueOffsetDays);

  return date.toISOString().slice(0, 10);
}
