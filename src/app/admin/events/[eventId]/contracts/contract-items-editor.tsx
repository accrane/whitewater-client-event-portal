"use client";

import { useMemo, useState } from "react";

import { buttonClasses } from "@/components/ui/button";
import {
  customDraftRow,
  draftRowFromCatalog,
  draftTablesToLineItems,
  newDraftKey,
  type DraftRow,
  type DraftSection,
  type DraftTable,
} from "@/lib/contracts/draft-tables";
import {
  calculateContractSubtotal,
  isFoodCatalogCategory,
  isFoodTableHeading,
  type ContractCatalogItem,
} from "@/lib/contracts/shared";

// The "Items and prices" part of the contract form. It mirrors how the
// PandaDoc template is laid out: one group per pricing table under the
// table's own heading, because the table a row sits in decides its tax (the
// Food & Beverage table adds the service fee and tax). Priced tables take
// rows from the PandaDoc catalog (name and price locked — PandaDoc is the
// price list) or typed custom rows, under optional sub-headings such as the
// event day. Checkbox tables ("Choose one of the options below") list the
// template's options for the coordinator to tick.

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800";

export type CatalogState =
  | { status: "loading" }
  | { status: "ready"; items: ContractCatalogItem[] }
  | { status: "error"; error: string };

type ContractItemsEditorProps = {
  tables: DraftTable[];
  onChange: (tables: DraftTable[]) => void;
  catalog: CatalogState;
  loadingLayout: boolean;
  layoutError: string | null;
};

export function ContractItemsEditor({
  tables,
  onChange,
  catalog,
  loadingLayout,
  layoutError,
}: ContractItemsEditorProps) {
  const hasFoodTable = tables.some(
    (table) => table.priced && isFoodTableHeading(table.heading),
  );
  const subtotal = calculateContractSubtotal(draftTablesToLineItems(tables));

  const updateTable = (index: number, next: DraftTable) =>
    onChange(tables.map((table, i) => (i === index ? next : table)));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700">
          Items and prices
        </span>
        <span className="text-xs text-slate-500">
          Grouped the way the PandaDoc template is. Each table carries its own
          taxes and fees.
        </span>
      </div>

      {loadingLayout ? (
        <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Reading the template&apos;s tables from PandaDoc…
        </p>
      ) : null}
      {layoutError ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Couldn&apos;t read the template&apos;s tables ({layoutError}). Items
          entered here go in the template&apos;s first priced table.
        </p>
      ) : null}
      {catalog.status === "error" ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The PandaDoc catalog couldn&apos;t be loaded ({catalog.error}). Custom
          rows still work.
        </p>
      ) : null}

      <div className="mt-3 space-y-4">
        {tables.map((table, index) =>
          table.priced ? (
            <PricedTable
              catalog={catalog}
              hasFoodTable={hasFoodTable}
              key={`${table.name}-${index}`}
              onChange={(next) => updateTable(index, next)}
              table={table}
            />
          ) : (
            <OptionsTable
              key={`${table.name}-${index}`}
              onChange={(next) => updateTable(index, next)}
              table={table}
            />
          ),
        )}
      </div>

      <p className="mt-3 text-right text-sm text-slate-700">
        Subtotal{" "}
        <span className="font-semibold text-slate-950">
          {currency.format(subtotal)}
        </span>
        <span className="block text-xs text-slate-500">
          Before the taxes and fees PandaDoc adds. The full total shows once the
          contract is created.
        </span>
      </p>
    </div>
  );
}

// A checkbox table: the template's options, ticked by the coordinator.
function OptionsTable({
  table,
  onChange,
}: {
  table: DraftTable;
  onChange: (table: DraftTable) => void;
}) {
  const rows = table.sections.flatMap((section) => section.rows);
  if (rows.length === 0) return null;

  const toggle = (key: number, selected: boolean) =>
    onChange({
      ...table,
      sections: table.sections.map((section) => ({
        ...section,
        rows: section.rows.map((row) =>
          row.key === key ? { ...row, selected } : row,
        ),
      })),
    });

  return (
    <fieldset className="rounded-lg border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-800">
        {table.heading}
      </legend>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map((row) =>
          row.optional ? (
            <label
              className="flex items-start gap-2 text-sm text-slate-700"
              key={row.key}
            >
              <input
                checked={row.selected}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                onChange={(event) => toggle(row.key, event.target.checked)}
                type="checkbox"
              />
              <span>{row.name}</span>
            </label>
          ) : (
            <span className="text-sm text-slate-700" key={row.key}>
              {row.name}
            </span>
          ),
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Ticked here, the choice arrives already made on the contract.
      </p>
    </fieldset>
  );
}

function PricedTable({
  table,
  onChange,
  catalog,
  hasFoodTable,
}: {
  table: DraftTable;
  onChange: (table: DraftTable) => void;
  catalog: CatalogState;
  hasFoodTable: boolean;
}) {
  // Which section's catalog picker is open, if any.
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const isFoodTable = isFoodTableHeading(table.heading);

  const categoryById = useMemo(() => {
    const map = new Map<string, string>();
    if (catalog.status === "ready") {
      for (const item of catalog.items) map.set(item.id, item.category);
    }
    return map;
  }, [catalog]);

  const updateSection = (key: number, patch: Partial<DraftSection>) =>
    onChange({
      ...table,
      sections: table.sections.map((section) =>
        section.key === key ? { ...section, ...patch } : section,
      ),
    });

  const updateRow = (
    sectionKey: number,
    rowKey: number,
    patch: Partial<DraftRow>,
  ) =>
    onChange({
      ...table,
      sections: table.sections.map((section) =>
        section.key === sectionKey
          ? {
              ...section,
              rows: section.rows.map((row) =>
                row.key === rowKey ? { ...row, ...patch } : row,
              ),
            }
          : section,
      ),
    });

  const tableSubtotal = calculateContractSubtotal(
    draftTablesToLineItems([table]),
  );

  return (
    <fieldset className="rounded-lg border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-800">
        {table.heading}
      </legend>

      <div className="space-y-4">
        {table.sections.map((section, sectionIndex) => (
          <div key={section.key}>
            <div className="flex items-center gap-2">
              <input
                aria-label="Sub-heading"
                className={inputClass}
                onChange={(event) =>
                  updateSection(section.key, { title: event.target.value })
                }
                placeholder="Sub-heading (optional), e.g. Friday, November 20th - 9:45am arrival"
                value={section.title}
              />
              {table.sections.length > 1 ? (
                <button
                  className={buttonClasses("ghost", "sm")}
                  onClick={() =>
                    onChange({
                      ...table,
                      sections: table.sections.filter(
                        (candidate) => candidate.key !== section.key,
                      ),
                    })
                  }
                  type="button"
                >
                  Remove group
                </button>
              ) : null}
            </div>

            <div className="mt-2 space-y-2">
              {section.rows.map((row) => {
                const locked = row.catalogItemId !== null;
                const misplacedFood =
                  locked &&
                  hasFoodTable &&
                  !isFoodTable &&
                  isFoodCatalogCategory(
                    categoryById.get(row.catalogItemId ?? "") ?? "",
                  );
                return (
                  <div
                    className="rounded-lg border border-slate-200 p-3"
                    key={row.key}
                  >
                    <div className="grid gap-2 sm:grid-cols-[2fr_2fr_70px_110px_auto] sm:items-start">
                      {locked ? (
                        <div className="px-1 py-2 text-sm">
                          <span className="font-medium text-slate-800">
                            {row.name}
                          </span>
                          <span className="block text-xs text-slate-500">
                            PandaDoc catalog
                            {row.sku ? ` · SKU ${row.sku}` : ""}
                          </span>
                        </div>
                      ) : (
                        <input
                          aria-label="Item name"
                          className={inputClass}
                          onChange={(event) =>
                            updateRow(section.key, row.key, {
                              name: event.target.value,
                            })
                          }
                          placeholder="Custom item (e.g. Outside food fee)"
                          value={row.name}
                        />
                      )}
                      <input
                        aria-label="Item description"
                        className={inputClass}
                        onChange={(event) =>
                          updateRow(section.key, row.key, {
                            description: event.target.value,
                          })
                        }
                        placeholder="Description (optional)"
                        value={row.description}
                      />
                      <input
                        aria-label="Quantity"
                        className={inputClass}
                        inputMode="decimal"
                        min="0"
                        onChange={(event) =>
                          updateRow(section.key, row.key, {
                            quantity: event.target.value,
                          })
                        }
                        placeholder="Qty"
                        step="any"
                        type="number"
                        value={row.quantity}
                      />
                      {locked ? (
                        <div
                          className="px-1 py-2 text-right text-sm text-slate-700"
                          title="Catalog prices are set in PandaDoc"
                        >
                          {currency.format(Number(row.unitPrice) || 0)}
                        </div>
                      ) : (
                        <input
                          aria-label="Unit price"
                          className={inputClass}
                          inputMode="decimal"
                          min="0"
                          onChange={(event) =>
                            updateRow(section.key, row.key, {
                              unitPrice: event.target.value,
                            })
                          }
                          placeholder="Price"
                          step="0.01"
                          type="number"
                          value={row.unitPrice}
                        />
                      )}
                      <button
                        aria-label="Remove item"
                        className="rounded-lg px-2 py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-red-700"
                        onClick={() =>
                          updateSection(section.key, {
                            rows: section.rows.filter(
                              (candidate) => candidate.key !== row.key,
                            ),
                          })
                        }
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                    {misplacedFood ? (
                      <p className="mt-2 text-xs text-amber-800">
                        This is a catering item. In the Food &amp; Beverage
                        table it would get that table&apos;s service fee and
                        tax; here it won&apos;t.
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {section.rows.length === 0 ? (
                <p className="text-xs text-slate-500">No items yet.</p>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className={buttonClasses("secondary", "sm")}
                disabled={catalog.status !== "ready"}
                onClick={() =>
                  setPickerFor((current) =>
                    current === section.key ? null : section.key,
                  )
                }
                type="button"
              >
                {catalog.status === "loading"
                  ? "Loading catalog…"
                  : pickerFor === section.key
                    ? "Close catalog"
                    : "Add from catalog"}
              </button>
              <button
                className={buttonClasses("ghost", "sm")}
                onClick={() =>
                  updateSection(section.key, {
                    rows: [...section.rows, customDraftRow()],
                  })
                }
                type="button"
              >
                Add custom row
              </button>
              {sectionIndex === table.sections.length - 1 ? (
                <button
                  className={buttonClasses("ghost", "sm")}
                  onClick={() =>
                    onChange({
                      ...table,
                      sections: [
                        ...table.sections,
                        { key: newDraftKey(), title: "", rows: [] },
                      ],
                    })
                  }
                  type="button"
                >
                  Add another group (e.g. a second day)
                </button>
              ) : null}
            </div>

            {pickerFor === section.key && catalog.status === "ready" ? (
              <CatalogPicker
                foodFirst={isFoodTable}
                items={catalog.items}
                onAdd={(item) =>
                  updateSection(section.key, {
                    rows: [...section.rows, draftRowFromCatalog(item)],
                  })
                }
              />
            ) : null}
          </div>
        ))}
      </div>

      <p className="mt-3 text-right text-xs text-slate-600">
        {table.heading} subtotal{" "}
        <span className="font-semibold text-slate-900">
          {currency.format(tableSubtotal)}
        </span>
      </p>
    </fieldset>
  );
}

const ALL = "__all__";
const ALL_FOOD = "__food__";

function CatalogPicker({
  items,
  onAdd,
  foodFirst,
}: {
  items: ContractCatalogItem[];
  onAdd: (item: ContractCatalogItem) => void;
  // The Food & Beverage table opens on the catering categories.
  foodFirst: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(foodFirst ? ALL_FOOD : ALL);
  const [added, setAdded] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(items.map((item) => item.category))],
    [items],
  );

  const term = query.trim().toLowerCase();
  const matches = items.filter((item) => {
    if (category === ALL_FOOD && !isFoodCatalogCategory(item.category)) {
      return false;
    }
    if (category !== ALL && category !== ALL_FOOD && item.category !== category) {
      return false;
    }
    return (
      !term ||
      item.name.toLowerCase().includes(term) ||
      item.category.toLowerCase().includes(term) ||
      (item.sku ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="mt-2 rounded-lg border border-slate-300 bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
        <input
          aria-label="Search the catalog"
          autoFocus
          className={`${inputClass} bg-white`}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the PandaDoc catalog…"
          value={query}
        />
        <select
          aria-label="Catalog category"
          className={`${inputClass} bg-white`}
          onChange={(event) => setCategory(event.target.value)}
          value={category}
        >
          <option value={ALL}>All categories</option>
          <option value={ALL_FOOD}>All catering</option>
          {categories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <ul className="mt-2 max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {matches.map((item) => (
          <li
            className="flex items-center justify-between gap-3 px-3 py-2"
            key={item.id}
          >
            <span className="min-w-0 text-sm">
              <span className="font-medium text-slate-800">{item.name}</span>
              <span className="block truncate text-xs text-slate-500">
                {item.category}
                {item.description ? ` · ${item.description}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="text-sm text-slate-700">
                {currency.format(item.price)}
              </span>
              <button
                className={buttonClasses("secondary", "sm")}
                onClick={() => {
                  onAdd(item);
                  setAdded(item.id);
                }}
                type="button"
              >
                {added === item.id ? "Added ✓" : "Add"}
              </button>
            </span>
          </li>
        ))}
        {matches.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-slate-500">
            Nothing in the catalog matches.
          </li>
        ) : null}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        Names and prices come from PandaDoc and can&apos;t be changed here. Set
        the quantity on the row after adding.
      </p>
    </div>
  );
}
