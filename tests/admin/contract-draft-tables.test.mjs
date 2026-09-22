import assert from "node:assert/strict";
import test from "node:test";

import {
  customDraftRow,
  draftRowFromCatalog,
  draftTablesForLayout,
  draftTablesToLineItems,
  fallbackDraftTables,
} from "../../src/lib/contracts/draft-tables.ts";

const option = (name, selected = false) => ({
  name,
  description: "",
  quantity: 1,
  unitPrice: 0,
  optional: true,
  selected,
});

// Shaped like the "EA Group w/ Catering" template.
const eaCatering = {
  templateId: "tpl-ea",
  templateName: "EA Group w/ Catering",
  tables: [
    {
      name: "PricingTable2",
      heading: "Choose One (1) of the Options Below:",
      priced: false,
      rows: [option("Build Your Own Boat"), option("Team Building")],
    },
    { name: "PricingTable1", heading: "Item", priced: true, rows: [] },
    {
      name: "Pricing Table 1",
      heading: "Food & Beverage Items",
      priced: true,
      rows: [],
    },
  ],
};

// Shaped like "Group w/ Catering": same headings, different table names.
const groupCatering = {
  templateId: "tpl-group",
  templateName: "Group w/ Catering",
  tables: [
    { name: "PricingTable1", heading: "Item", priced: true, rows: [] },
    { name: "Pricing Table 1", heading: "Rentals", priced: true, rows: [] },
    {
      name: "PricingTable2",
      heading: "Food & Beverage Items",
      priced: true,
      rows: [],
    },
  ],
};

const lunch = {
  id: "cat-lunch",
  name: "Youth Boxed Lunch",
  description: "Served with water and chips.",
  price: 15.5,
  sku: "66182415933",
  category: "2. Boxed Lunches",
};

test("a new contract starts from the template: options listed, event day on the first priced table", () => {
  const tables = draftTablesForLayout(eaCatering, {
    defaultSectionTitle: "Friday, November 20th - 9:45am arrival",
  });

  assert.deepEqual(
    tables.map((table) => [table.heading, table.priced]),
    [
      ["Choose One (1) of the Options Below:", false],
      ["Item", true],
      ["Food & Beverage Items", true],
    ],
  );
  assert.deepEqual(
    tables[0].sections[0].rows.map((row) => [row.name, row.optional, row.selected]),
    [
      ["Build Your Own Boat", true, false],
      ["Team Building", true, false],
    ],
  );
  assert.equal(tables[1].sections[0].title, "Friday, November 20th - 9:45am arrival");
  assert.equal(tables[2].sections[0].title, "");
});

test("the template's starter rows open as editable custom rows", () => {
  const tables = draftTablesForLayout({
    templateId: "tpl-santee",
    templateName: "Whitewater Santee",
    tables: [
      {
        name: "PricingTable1",
        heading: "Accommodation",
        priced: true,
        rows: [
          { name: "Cleaning Fee", description: "", quantity: 1, unitPrice: 250 },
        ],
      },
    ],
  });
  const [row] = tables[0].sections[0].rows;
  assert.equal(row.name, "Cleaning Fee");
  assert.equal(row.unitPrice, "250");
  assert.equal(row.catalogItemId, null);
});

test("line items carry their table, sub-heading, catalog link and tick", () => {
  const tables = draftTablesForLayout(eaCatering, {
    defaultSectionTitle: "Friday, November 20th",
  });
  tables[0].sections[0].rows[1].selected = true;
  tables[1].sections[0].rows.push({
    ...customDraftRow(),
    name: "Outside food fee",
    quantity: "140",
    unitPrice: "1",
  });
  tables[2].sections[0].rows.push({
    ...draftRowFromCatalog(lunch),
    quantity: "100",
  });
  // A custom row nobody named is dropped.
  tables[1].sections[0].rows.push(customDraftRow());

  const items = draftTablesToLineItems(tables);
  assert.equal(items.length, 4);

  const ticked = items.find((item) => item.name === "Team Building");
  assert.equal(ticked.table, "PricingTable2");
  assert.equal(ticked.optional, true);
  assert.equal(ticked.selected, true);
  assert.equal(ticked.section, null);

  const fee = items.find((item) => item.name === "Outside food fee");
  assert.equal(fee.table, "PricingTable1");
  assert.equal(fee.tableHeading, "Item");
  assert.equal(fee.section, "Friday, November 20th");
  assert.equal(fee.catalogItemId, null);
  assert.equal(fee.quantity, 140);

  const food = items.find((item) => item.name === "Youth Boxed Lunch");
  assert.equal(food.table, "Pricing Table 1");
  assert.equal(food.tableHeading, "Food & Beverage Items");
  assert.equal(food.catalogItemId, "cat-lunch");
  assert.equal(food.sku, "66182415933");
  assert.equal(food.unitPrice, 15.5);
  assert.equal(food.quantity, 100);
});

test("switching templates keeps entered rows under the matching heading", () => {
  const before = draftTablesForLayout(eaCatering);
  before[1].sections[0].rows.push({ ...customDraftRow(), name: "Day Pass" });
  before[2].sections[0].rows.push(draftRowFromCatalog(lunch));

  const after = draftTablesForLayout(groupCatering, { previous: before });
  const items = draftTablesToLineItems(after);

  // Same headings, but the food table is "PricingTable2" in this template.
  assert.equal(items.find((item) => item.name === "Day Pass").table, "PricingTable1");
  assert.equal(
    items.find((item) => item.name === "Youth Boxed Lunch").table,
    "PricingTable2",
  );
  // The old template's options don't follow.
  assert.equal(items.some((item) => item.optional), false);
});

test("rows under a heading the new template lacks go to its first priced table", () => {
  const before = draftTablesForLayout(groupCatering);
  before[1].sections[0].rows.push({ ...customDraftRow(), name: "Pavilion rental" });

  const after = draftTablesForLayout(eaCatering, { previous: before });
  const moved = draftTablesToLineItems(after).find(
    (item) => item.name === "Pavilion rental",
  );
  assert.equal(moved.table, "PricingTable1");
  assert.equal(moved.tableHeading, "Item");
});

test("editing restores saved rows to their tables, sections and ticks", () => {
  const saved = [
    { ...option("Team Building", true), table: "PricingTable2" },
    { ...option("Build Your Own Boat"), table: "PricingTable2" },
    {
      name: "Half Day Land",
      description: "",
      quantity: 100,
      unitPrice: 39,
      table: "PricingTable1",
      section: "Friday",
      catalogItemId: "cat-land",
    },
    {
      name: "Full Day Land",
      description: "",
      quantity: 50,
      unitPrice: 59,
      table: "PricingTable1",
      section: "Saturday",
    },
  ];
  const tables = draftTablesForLayout(eaCatering, { saved });

  assert.equal(tables[0].sections[0].rows.find((row) => row.selected).name, "Team Building");
  assert.deepEqual(
    tables[1].sections.map((section) => section.title),
    ["Friday", "Saturday"],
  );
  assert.equal(tables[1].sections[0].rows[0].catalogItemId, "cat-land");
  assert.equal(tables[2].sections[0].rows.length, 0);
});

test("a contract saved before tables existed opens in the first priced table, with the template's options", () => {
  const saved = [{ name: "Team building session", description: "", quantity: 1, unitPrice: 500 }];
  const tables = draftTablesForLayout(eaCatering, { saved });

  assert.equal(tables[1].sections[0].rows[0].name, "Team building session");
  assert.equal(tables[0].sections[0].rows.length, 2);

  const items = draftTablesToLineItems(tables);
  assert.equal(
    items.find((item) => item.name === "Team building session").table,
    "PricingTable1",
  );
});

test("without a template layout the rows stay untabled for the server to place", () => {
  const tables = fallbackDraftTables([]);
  tables[0].sections[0].rows.push({ ...customDraftRow(), name: "Deposit", unitPrice: "100" });
  const [item] = draftTablesToLineItems(tables);
  assert.equal(item.table, null);
  assert.equal(item.tableHeading, null);
});
