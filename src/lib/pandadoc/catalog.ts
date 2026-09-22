import { pandaDocRequest, type PandaDocResult } from "@/lib/pandadoc/client";

// PandaDoc's product catalog (passes, venues, parking, catering, ...). The
// catalog is the price list: managers maintain it in PandaDoc and the app
// only reads it, so a price change there reaches the contract form without
// anything to keep in step here.

export type PandaDocCatalogItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  sku: string | null;
  category: string;
};

const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const PAGE_SIZE = 100;
// Far above the real catalog (about 300 items); stops a runaway loop.
const MAX_PAGES = 20;
const UNCATEGORIZED = "Other";

let catalogCache: { expiresAt: number; items: PandaDocCatalogItem[] } | null =
  null;

// Catalog titles arrive HTML-escaped ("Sweet &amp; Salty Snack").
function decodeEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

export async function listPandaDocCatalogItems(
  options: { refresh?: boolean } = {},
): Promise<PandaDocResult<PandaDocCatalogItem[]>> {
  if (!options.refresh && catalogCache && catalogCache.expiresAt > Date.now()) {
    return { ok: true, data: catalogCache.items };
  }

  const items: PandaDocCatalogItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await pandaDocRequest<{
      items?: {
        uuid?: string;
        title?: string;
        description?: string | null;
        price?: number | string | null;
        sku?: string | null;
        category_name?: string | null;
      }[];
    }>(`/product-catalog/items/search?page=${page}&per_page=${PAGE_SIZE}`, {
      version: "v2",
    });
    if (!result.ok) return result;

    const rows = result.data.items ?? [];
    for (const row of rows) {
      const name = decodeEntities(row.title ?? "").trim();
      if (!row.uuid || !name) continue;
      const price = Number(row.price);
      items.push({
        id: row.uuid,
        name,
        description: decodeEntities(row.description ?? "").trim(),
        price: Number.isFinite(price) ? price : 0,
        sku: row.sku?.trim() || null,
        category: decodeEntities(row.category_name ?? "").trim() || UNCATEGORIZED,
      });
    }
    if (rows.length < PAGE_SIZE) break;
  }

  items.sort(
    (a, b) =>
      a.category.localeCompare(b.category, undefined, { numeric: true }) ||
      a.name.localeCompare(b.name),
  );
  catalogCache = { expiresAt: Date.now() + CATALOG_CACHE_TTL_MS, items };
  return { ok: true, data: items };
}
