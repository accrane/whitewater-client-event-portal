import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateContractSubtotal,
  defaultContractName,
  groupContractLineItems,
  isFoodCatalogCategory,
  isFoodTableHeading,
  parseContractLineItems,
} from "../../src/lib/contracts/shared.ts";
import { formatEventDayHeading } from "../../src/lib/dates/index.ts";

test("parseContractLineItems reads rows saved before tables existed", () => {
  const items = parseContractLineItems([
    { name: " Day Pass ", description: "Adult", quantity: 10, unit_price: "79" },
    { name: "", quantity: 1, unit_price: 5 },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].name, "Day Pass");
  assert.equal(items[0].unitPrice, 79);
  assert.equal(items[0].table, null);
  assert.equal(items[0].catalogItemId, null);
  assert.equal(items[0].optional, false);
});

test("parseContractLineItems keeps the table, section, catalog link and option tick", () => {
  const [lunch, option] = parseContractLineItems([
    {
      name: "Youth Boxed Lunch",
      quantity: 100,
      unit_price: 15.5,
      table: "Pricing Table 1",
      table_heading: "Food & Beverage Items",
      section: "Friday, November 20th",
      catalog_item_id: "abc-123",
      sku: "66182415933",
    },
    {
      name: "Team Building",
      quantity: 1,
      unit_price: 0,
      table: "PricingTable2",
      optional: true,
      selected: true,
    },
  ]);

  assert.equal(lunch.table, "Pricing Table 1");
  assert.equal(lunch.tableHeading, "Food & Beverage Items");
  assert.equal(lunch.section, "Friday, November 20th");
  assert.equal(lunch.catalogItemId, "abc-123");
  assert.equal(lunch.sku, "66182415933");
  assert.equal(option.optional, true);
  assert.equal(option.selected, true);
});

test("a tick only counts on an optional row", () => {
  const [item] = parseContractLineItems([
    { name: "Day Pass", quantity: 1, unit_price: 79, selected: true },
  ]);
  assert.equal(item.selected, false);
});

test("calculateContractSubtotal leaves out options that aren't ticked", () => {
  const subtotal = calculateContractSubtotal([
    { name: "Half Day Land", description: "", quantity: 100, unitPrice: 39 },
    {
      name: "Rafting Add-on",
      description: "",
      quantity: 100,
      unitPrice: 30,
      optional: true,
      selected: false,
    },
    {
      name: "Zipline Add On",
      description: "",
      quantity: 10,
      unitPrice: 30,
      optional: true,
      selected: true,
    },
  ]);
  assert.equal(subtotal, 4200);
});

test("groupContractLineItems groups by table, then sub-heading, in order", () => {
  const row = (name, table, section) => ({
    name,
    description: "",
    quantity: 1,
    unitPrice: 1,
    table,
    tableHeading: table === "T1" ? "Item" : "Food & Beverage Items",
    section,
  });
  const groups = groupContractLineItems([
    row("Pass", "T1", "Friday"),
    row("Lunch", "T2", null),
    row("Parking", "T1", "Friday"),
    row("Pass day 2", "T1", "Saturday"),
  ]);

  assert.deepEqual(
    groups.map((group) => group.heading),
    ["Item", "Food & Beverage Items"],
  );
  assert.deepEqual(
    groups[0].sections.map((section) => [
      section.title,
      section.items.map((item) => item.name),
    ]),
    [
      ["Friday", ["Pass", "Parking"]],
      ["Saturday", ["Pass day 2"]],
    ],
  );
});

test("catering categories and the food table are recognised", () => {
  assert.equal(isFoodCatalogCategory("3. Buffets"), true);
  assert.equal(isFoodCatalogCategory("8. Wildwoods Catering"), true);
  assert.equal(isFoodCatalogCategory("Hot Drinks"), true);
  assert.equal(isFoodCatalogCategory("Activity Passes"), false);
  assert.equal(isFoodCatalogCategory("Meeting Spaces"), false);
  assert.equal(isFoodTableHeading("Food & Beverage Items"), true);
  assert.equal(isFoodTableHeading("Item"), false);
  assert.equal(isFoodTableHeading("Rentals"), false);
});

test("formatEventDayHeading writes the day the way coordinators title it", () => {
  assert.equal(formatEventDayHeading("2026-11-20"), "Friday, November 20th");
  assert.equal(formatEventDayHeading("2026-11-21"), "Saturday, November 21st");
  assert.equal(formatEventDayHeading("2026-09-22"), "Tuesday, September 22nd");
  assert.equal(formatEventDayHeading("2026-09-03"), "Thursday, September 3rd");
  assert.equal(formatEventDayHeading("2026-09-11"), "Friday, September 11th");
  assert.equal(formatEventDayHeading(null), "");
  assert.equal(formatEventDayHeading("not a date"), "");
});

test("defaultContractName is date - group - contact, skipping missing pieces", () => {
  assert.equal(
    defaultContractName({
      eventDate: "2026-12-31",
      eventName: "Acme Retreat",
      contactName: "Dana Lee",
    }),
    "12-31-2026 - Acme Retreat - Dana Lee",
  );
  assert.equal(
    defaultContractName({ eventDate: null, eventName: " Acme Retreat ", contactName: "" }),
    "Acme Retreat",
  );
  assert.equal(
    defaultContractName({ eventDate: "2026-01-05T00:00:00Z", eventName: null, contactName: "Dana Lee" }),
    "01-05-2026 - Dana Lee",
  );
  assert.equal(defaultContractName({ eventDate: "soon", eventName: null, contactName: null }), "");
});
