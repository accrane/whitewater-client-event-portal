import type {
  ContractCatalogItem,
  ContractLineItem,
  ContractTemplateLayout,
} from "@/lib/contracts/shared";

// The contract form's working copy of the items: the template's pricing
// tables, each split into sub-headed sections of rows. Pure functions, kept
// apart from the form component so they can be tested.

export type DraftRow = {
  key: number;
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
  catalogItemId: string | null;
  sku: string | null;
  optional: boolean;
  selected: boolean;
};

export type DraftSection = { key: number; title: string; rows: DraftRow[] };

export type DraftTable = {
  // PandaDoc's table name; "" while the template's tables are unknown, in
  // which case the server files the rows under the first priced table.
  name: string;
  heading: string;
  priced: boolean;
  sections: DraftSection[];
};

let nextKey = 1;
export const newDraftKey = () => nextKey++;

export function customDraftRow(): DraftRow {
  return {
    key: newDraftKey(),
    name: "",
    description: "",
    quantity: "1",
    unitPrice: "",
    catalogItemId: null,
    sku: null,
    optional: false,
    selected: false,
  };
}

function rowFromLineItem(item: ContractLineItem): DraftRow {
  return {
    key: newDraftKey(),
    name: item.name,
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: String(item.unitPrice),
    catalogItemId: item.catalogItemId ?? null,
    sku: item.sku ?? null,
    optional: item.optional === true,
    selected: item.selected === true,
  };
}

export function draftRowFromCatalog(item: ContractCatalogItem): DraftRow {
  return {
    key: newDraftKey(),
    name: item.name,
    description: item.description,
    quantity: "1",
    unitPrice: String(item.price),
    catalogItemId: item.id,
    sku: item.sku,
    optional: false,
    selected: false,
  };
}

// Used until (or unless) the template's tables can be read.
export function fallbackDraftTables(items: ContractLineItem[]): DraftTable[] {
  return [
    {
      name: "",
      heading: "Items",
      priced: true,
      sections: sectionsFromLineItems(items),
    },
  ];
}

function sectionsFromLineItems(items: ContractLineItem[]): DraftSection[] {
  const sections: DraftSection[] = [];
  for (const item of items) {
    const title = item.section ?? "";
    let section = sections.find((candidate) => candidate.title === title);
    if (!section) {
      section = { key: newDraftKey(), title, rows: [] };
      sections.push(section);
    }
    section.rows.push(rowFromLineItem(item));
  }
  return sections.length > 0
    ? sections
    : [{ key: newDraftKey(), title: "", rows: [] }];
}

function hasEnteredRows(tables: DraftTable[]): boolean {
  return tables.some(
    (table) =>
      table.priced &&
      table.sections.some((section) =>
        section.rows.some((row) => row.name.trim()),
      ),
  );
}

// Lays the form out for a template. `saved` are a contract's stored rows
// (editing); `previous` is what the coordinator had entered before switching
// templates, carried into the table with the same heading (else the first
// priced table) so a template change doesn't throw their work away. A fresh
// form starts from the template's own rows and the event-day sub-heading.
export function draftTablesForLayout(
  layout: ContractTemplateLayout,
  options: {
    saved?: ContractLineItem[];
    previous?: DraftTable[];
    defaultSectionTitle?: string;
  } = {},
): DraftTable[] {
  const firstPriced = layout.tables.find((table) => table.priced);

  if (options.saved) {
    const saved = options.saved;
    return layout.tables.map((table) => {
      const own = saved.filter(
        (item) =>
          item.table === table.name ||
          // Rows from before tables were chosen belong to the first priced one.
          (table === firstPriced &&
            !layout.tables.some((candidate) => candidate.name === item.table)),
      );
      return {
        name: table.name,
        heading: table.heading,
        priced: table.priced,
        sections: sectionsFromLineItems(
          !table.priced && own.length === 0 ? table.rows : own,
        ),
      };
    });
  }

  const carried =
    options.previous && hasEnteredRows(options.previous)
      ? options.previous.filter((table) => table.priced)
      : null;

  return layout.tables.map((table) => {
    if (!table.priced) {
      return {
        name: table.name,
        heading: table.heading,
        priced: false,
        sections: sectionsFromLineItems(table.rows),
      };
    }

    if (carried) {
      const sections = carried
        .filter((from) =>
          layout.tables.some(
            (candidate) => candidate.priced && candidate.heading === from.heading,
          )
            ? from.heading === table.heading
            : table === firstPriced,
        )
        .flatMap((from) => from.sections)
        .filter((section) => section.rows.length > 0);
      return {
        name: table.name,
        heading: table.heading,
        priced: true,
        sections:
          sections.length > 0
            ? sections
            : [{ key: newDraftKey(), title: "", rows: [] }],
      };
    }

    const sections = sectionsFromLineItems(table.rows);
    if (table === firstPriced && options.defaultSectionTitle) {
      sections[0].title = options.defaultSectionTitle;
    }
    return {
      name: table.name,
      heading: table.heading,
      priced: true,
      sections,
    };
  });
}

export function draftTablesToLineItems(tables: DraftTable[]): ContractLineItem[] {
  const items: ContractLineItem[] = [];
  for (const table of tables) {
    for (const section of table.sections) {
      for (const row of section.rows) {
        if (!row.name.trim()) continue;
        items.push({
          name: row.name.trim(),
          description: row.description.trim(),
          quantity: Number(row.quantity) > 0 ? Number(row.quantity) : 1,
          unitPrice: Number.isFinite(Number(row.unitPrice))
            ? Number(row.unitPrice)
            : 0,
          table: table.name || null,
          tableHeading: table.name ? table.heading : null,
          section: table.priced ? section.title.trim() || null : null,
          catalogItemId: row.catalogItemId,
          sku: row.sku,
          optional: row.optional,
          selected: row.selected,
        });
      }
    }
  }
  return items;
}
