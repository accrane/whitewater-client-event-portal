import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type {
  EventNote,
  ScheduleBlock,
  ScheduleBlockColor,
  ScheduleGroup,
  ScheduleItem,
  ScheduleTemplateItem,
} from "@/lib/schedule";
import type { Database } from "@/types/database";

type GroupInsert =
  Database["public"]["Tables"]["event_schedule_groups"]["Insert"];
type BlockInsert =
  Database["public"]["Tables"]["event_schedule_blocks"]["Insert"];
type ItemInsert =
  Database["public"]["Tables"]["event_schedule_items"]["Insert"];
type TemplateItemInsert =
  Database["public"]["Tables"]["schedule_template_items"]["Insert"];

export type EventScheduleData = {
  groups: ScheduleGroup[];
  blocks: ScheduleBlock[];
  notes: EventNote[];
};

export async function getEventScheduleData(
  eventId: string,
): Promise<EventScheduleData> {
  const supabase = createServiceRoleSupabaseClient();

  const [groupsResult, blocksResult, notesResult] = await Promise.all([
    supabase
      .from("event_schedule_groups")
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order"),
    supabase
      .from("event_schedule_blocks")
      .select("*")
      .eq("event_id", eventId)
      .order("start_minutes"),
    supabase
      .from("event_notes")
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order"),
  ]);

  if (groupsResult.error) throw groupsResult.error;
  if (blocksResult.error) throw blocksResult.error;
  if (notesResult.error) throw notesResult.error;

  return {
    groups: (groupsResult.data ?? []) as ScheduleGroup[],
    blocks: (blocksResult.data ?? []) as ScheduleBlock[],
    notes: (notesResult.data ?? []) as EventNote[],
  };
}

export type ScheduleGroupInput = {
  id?: string;
  name: string;
  size: number | null;
  sortOrder?: number;
};

export async function saveScheduleGroup(
  eventId: string,
  input: ScheduleGroupInput,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();

  if (input.id) {
    const { error } = await supabase
      .from("event_schedule_groups")
      .update({ name: input.name, size: input.size } as never)
      .eq("id", input.id)
      .eq("event_id", eventId);
    if (error) throw error;
    return;
  }

  const insert: GroupInsert = {
    event_id: eventId,
    name: input.name,
    size: input.size,
    sort_order: input.sortOrder ?? 0,
  };
  const { error } = await supabase
    .from("event_schedule_groups")
    .insert(insert as never);
  if (error) throw error;
}

export async function deleteScheduleGroup(
  eventId: string,
  groupId: string,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase
    .from("event_schedule_groups")
    .delete()
    .eq("id", groupId)
    .eq("event_id", eventId);
  if (error) throw error;
}

export type ScheduleBlockInput = {
  id?: string;
  label: string;
  groupId: string | null;
  startMinutes: number;
  endMinutes: number;
  color: ScheduleBlockColor;
};

export async function saveScheduleBlock(
  eventId: string,
  input: ScheduleBlockInput,
): Promise<void> {
  if (input.endMinutes <= input.startMinutes) {
    throw new Error("End time must be after start time");
  }

  const supabase = createServiceRoleSupabaseClient();
  const values = {
    label: input.label,
    group_id: input.groupId,
    start_minutes: input.startMinutes,
    end_minutes: input.endMinutes,
    color: input.color,
  };

  if (input.id) {
    const { error } = await supabase
      .from("event_schedule_blocks")
      .update(values as never)
      .eq("id", input.id)
      .eq("event_id", eventId);
    if (error) throw error;
    return;
  }

  const insert: BlockInsert = { event_id: eventId, ...values };
  const { error } = await supabase
    .from("event_schedule_blocks")
    .insert(insert as never);
  if (error) throw error;
}

export async function deleteScheduleBlock(
  eventId: string,
  blockId: string,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase
    .from("event_schedule_blocks")
    .delete()
    .eq("id", blockId)
    .eq("event_id", eventId);
  if (error) throw error;
}

export type EventNoteInput = {
  id?: string;
  title: string;
  content: string;
  sortOrder?: number;
};

export async function saveEventNote(
  eventId: string,
  input: EventNoteInput,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();

  if (input.id) {
    const { error } = await supabase
      .from("event_notes")
      .update({ title: input.title, content: input.content } as never)
      .eq("id", input.id)
      .eq("event_id", eventId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("event_notes").insert({
    event_id: eventId,
    title: input.title,
    content: input.content,
    sort_order: input.sortOrder ?? 0,
  } as never);
  if (error) throw error;
}

export async function deleteEventNote(
  eventId: string,
  noteId: string,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase
    .from("event_notes")
    .delete()
    .eq("id", noteId)
    .eq("event_id", eventId);
  if (error) throw error;
}

export async function getScheduleItems(
  eventId: string,
): Promise<ScheduleItem[]> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_schedule_items")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ScheduleItem[];
}

export type ScheduleItemInput = {
  id?: string;
  title: string;
  description: string;
  noteHtml: string;
  sortOrder?: number;
};

export async function saveScheduleItem(
  eventId: string,
  input: ScheduleItemInput,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const values = {
    title: input.title,
    description: input.description,
    note_html: input.noteHtml,
  };

  if (input.id) {
    const { error } = await supabase
      .from("event_schedule_items")
      .update(values as never)
      .eq("id", input.id)
      .eq("event_id", eventId);
    if (error) throw error;
    return;
  }

  const insert: ItemInsert = {
    event_id: eventId,
    ...values,
    sort_order: input.sortOrder ?? 0,
  };
  const { error } = await supabase
    .from("event_schedule_items")
    .insert(insert as never);
  if (error) throw error;
}

export async function deleteScheduleItem(
  eventId: string,
  itemId: string,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase
    .from("event_schedule_items")
    .delete()
    .eq("id", itemId)
    .eq("event_id", eventId);
  if (error) throw error;
}

// Swaps sort_order with the neighboring tile so ordering survives gaps or
// duplicate sort values (items are renumbered 0..n before the swap).
export async function moveScheduleItem(
  eventId: string,
  itemId: string,
  direction: "up" | "down",
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const items = await getScheduleItems(eventId);
  const index = items.findIndex((item) => item.id === itemId);
  if (index === -1) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) return;

  const reordered = [...items];
  [reordered[index], reordered[targetIndex]] = [
    reordered[targetIndex],
    reordered[index],
  ];

  for (const [sortOrder, item] of reordered.entries()) {
    if (item.sort_order === sortOrder) continue;
    const { error } = await supabase
      .from("event_schedule_items")
      .update({ sort_order: sortOrder } as never)
      .eq("id", item.id)
      .eq("event_id", eventId);
    if (error) throw error;
  }
}

// Replaces the event's timeline tiles with copies of the skeleton template.
// Copies, not references: later template edits never touch existing events,
// and per-event tiles added on the fly never touch the template.
export async function applyScheduleItemsTemplate(
  eventId: string,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const templateItems = await getScheduleTemplateItems();

  const { error: clearError } = await supabase
    .from("event_schedule_items")
    .delete()
    .eq("event_id", eventId);
  if (clearError) throw clearError;

  if (templateItems.length === 0) return;

  const inserts: ItemInsert[] = templateItems.map((item, index) => ({
    event_id: eventId,
    title: item.title,
    description: item.description,
    note_html: item.note_html,
    sort_order: index,
  }));

  const { error } = await supabase
    .from("event_schedule_items")
    .insert(inserts as never);
  if (error) throw error;
}

export async function getScheduleTemplateItems(): Promise<
  ScheduleTemplateItem[]
> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("schedule_template_items")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ScheduleTemplateItem[];
}

export async function saveScheduleTemplateItem(
  input: ScheduleItemInput,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const values = {
    title: input.title,
    description: input.description,
    note_html: input.noteHtml,
  };

  if (input.id) {
    const { error } = await supabase
      .from("schedule_template_items")
      .update(values as never)
      .eq("id", input.id);
    if (error) throw error;
    return;
  }

  const insert: TemplateItemInsert = {
    ...values,
    sort_order: input.sortOrder ?? 0,
  };
  const { error } = await supabase
    .from("schedule_template_items")
    .insert(insert as never);
  if (error) throw error;
}

export async function deleteScheduleTemplateItem(itemId: string): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase
    .from("schedule_template_items")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
}

// Same renumber-and-swap approach as moveScheduleItem.
export async function moveScheduleTemplateItem(
  itemId: string,
  direction: "up" | "down",
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const items = await getScheduleTemplateItems();
  const index = items.findIndex((item) => item.id === itemId);
  if (index === -1) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) return;

  const reordered = [...items];
  [reordered[index], reordered[targetIndex]] = [
    reordered[targetIndex],
    reordered[index],
  ];

  for (const [sortOrder, item] of reordered.entries()) {
    if (item.sort_order === sortOrder) continue;
    const { error } = await supabase
      .from("schedule_template_items")
      .update({ sort_order: sortOrder } as never)
      .eq("id", item.id);
    if (error) throw error;
  }
}

// Standard whitewater group-event day, from the planners' spreadsheet template.
// Times are minutes from midnight; null group = spans all groups.
const TEMPLATE_GROUPS: Array<Pick<GroupInsert, "name" | "size" | "sort_order">> = [
  { name: "Group 1", size: 10, sort_order: 0 },
  { name: "Group 2", size: 11, sort_order: 1 },
];

type TemplateBlock = {
  label: string;
  start: number;
  end: number;
  color: ScheduleBlockColor;
  /** Index into TEMPLATE_GROUPS, or null for all groups. */
  group: number | null;
};

const TEMPLATE_BLOCKS: TemplateBlock[] = [
  { label: "Welcome Talk & Land Orientation", start: 630, end: 660, color: "green", group: null },
  { label: "Team Building", start: 660, end: 720, color: "purple", group: 0 },
  { label: "Team Building", start: 660, end: 720, color: "purple", group: 1 },
  { label: "Lunch", start: 720, end: 750, color: "green", group: null },
  { label: "Gear Up", start: 750, end: 780, color: "plain", group: null },
  { label: "Activities", start: 780, end: 870, color: "yellow", group: 0 },
  { label: "Activities", start: 780, end: 870, color: "yellow", group: 1 },
  { label: "Change", start: 870, end: 885, color: "plain", group: null },
  { label: "Rafting Orientation", start: 885, end: 900, color: "plain", group: null },
  { label: "Rafting", start: 900, end: 990, color: "blue", group: null },
  { label: "Activities", start: 990, end: 1050, color: "yellow", group: 0 },
  { label: "Activities", start: 990, end: 1050, color: "yellow", group: 1 },
  { label: "Dismissal", start: 1050, end: 1065, color: "green", group: null },
];

const TEMPLATE_NOTE_SECTIONS = [
  "Arrival/Departure",
  "Activities",
  "Banquet",
  "Food and Beverages",
  "Group",
];

// Replaces any existing groups/blocks with the standard day template.
// Note sections are only seeded when the event has none yet.
export async function applyScheduleTemplate(eventId: string): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();

  const { error: clearError } = await supabase
    .from("event_schedule_groups")
    .delete()
    .eq("event_id", eventId);
  if (clearError) throw clearError;

  // Blocks spanning all groups aren't cascade-deleted with groups.
  const { error: clearBlocksError } = await supabase
    .from("event_schedule_blocks")
    .delete()
    .eq("event_id", eventId);
  if (clearBlocksError) throw clearBlocksError;

  const { data: groupRows, error: groupsError } = await supabase
    .from("event_schedule_groups")
    .insert(
      TEMPLATE_GROUPS.map((group) => ({ ...group, event_id: eventId })) as never,
    )
    .select("id, sort_order");
  if (groupsError) throw groupsError;

  const orderedGroups = ((groupRows ?? []) as Array<{ id: string; sort_order: number }>)
    .sort((a, b) => a.sort_order - b.sort_order);

  const blockInserts: BlockInsert[] = TEMPLATE_BLOCKS.map((block) => ({
    event_id: eventId,
    group_id: block.group === null ? null : (orderedGroups[block.group]?.id ?? null),
    label: block.label,
    start_minutes: block.start,
    end_minutes: block.end,
    color: block.color,
  }));

  const { error: blocksError } = await supabase
    .from("event_schedule_blocks")
    .insert(blockInserts as never);
  if (blocksError) throw blocksError;

  const { count, error: notesCountError } = await supabase
    .from("event_notes")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (notesCountError) throw notesCountError;

  if ((count ?? 0) === 0) {
    const { error: notesError } = await supabase.from("event_notes").insert(
      TEMPLATE_NOTE_SECTIONS.map((title, index) => ({
        event_id: eventId,
        title,
        content: "",
        sort_order: index,
      })) as never,
    );
    if (notesError) throw notesError;
  }
}
