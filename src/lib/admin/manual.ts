import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { Marked, type Tokens } from "marked";

// The user guide lives in docs/manual.md so it stays next to the code that
// changes it (see docs/developer-notes.md §6). This renders it for the
// in-app Manual page: only allowlisted docs are served (the developer
// notes, field map and roadmap are deliberately not — they are for us, not
// coordinators), headings get stable ids for the table of contents, and links
// between allowlisted docs are rewritten to their in-app routes.

export const MANUAL_DOCS = {
  manual: { title: "Manual" },
} as const;

export type ManualDocSlug = keyof typeof MANUAL_DOCS;

export const DEFAULT_MANUAL_DOC: ManualDocSlug = "manual";

export function isManualDocSlug(value: string): value is ManualDocSlug {
  return Object.hasOwn(MANUAL_DOCS, value);
}

export type ManualHeading = { id: string; text: string; depth: 2 | 3 };

export type RenderedManualDoc = {
  slug: ManualDocSlug;
  title: string;
  html: string;
  headings: ManualHeading[];
};

export function manualDocHref(slug: ManualDocSlug): string {
  return slug === DEFAULT_MANUAL_DOC ? "/admin/manual" : `/admin/manual/${slug}`;
}

export async function renderManualDoc(
  slug: ManualDocSlug,
): Promise<RenderedManualDoc> {
  const source = await readFile(
    path.join(process.cwd(), "docs", `${slug}.md`),
    "utf8",
  );

  const headings: ManualHeading[] = [];
  const seen = new Map<string, number>();

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        const text = stripTags(inner);
        const id = uniqueSlug(slugify(text), seen);
        if (depth === 2 || depth === 3) headings.push({ id, text, depth });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
      link({ href, title, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const target = rewriteDocLink(href);
        const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
        const external = /^https?:\/\//.test(target)
          ? ` target="_blank" rel="noopener noreferrer"`
          : "";
        return `<a href="${escapeAttr(target)}"${titleAttr}${external}>${inner}</a>`;
      },
    },
  });

  const html = await marked.parse(source);

  return {
    slug,
    title: MANUAL_DOCS[slug].title,
    html,
    headings,
  };
}

// `ghl-custom-fields.md` → `/admin/manual/ghl-custom-fields`, keeping any
// `#anchor`. Anything not in the allowlist is left alone.
function rewriteDocLink(href: string): string {
  const match = /^(?:\.\/)?([a-z0-9-]+)\.md(#.*)?$/i.exec(href);
  if (!match) return href;
  const [, name, hash = ""] = match;
  return isManualDocSlug(name) ? `${manualDocHref(name)}${hash}` : href;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section"
  );
}

function uniqueSlug(base: string, seen: Map<string, number>): string {
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
