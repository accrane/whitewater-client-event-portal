// GHL rich-text fields (email bodies, task descriptions, notes) often arrive
// as HTML; the drawers render them as plain text. Shared by the
// conversations, notes, and tasks libs.
// Bullet used for list items in the plain-text form; textToEmailHtml turns
// lines starting with it (or "-" / "*" / "1.") back into real lists.
export const BULLET = "\u2022";

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

// Numbers the items of one <ol>; nested lists inside it are left for the
// generic <li> pass (they become bullets).
function numberOrderedList(list: string): string {
  let index = 0;
  return list.replace(/<li\b[^>]*>/gi, () => `${++index}. `);
}

export function htmlToText(value: string): string {
  let text = value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    // GHL's editor wraps each list item's text in a <p>; unwrap it so an
    // item is one line rather than an item plus a blank paragraph.
    .replace(/<li\b([^>]*)>\s*<p\b[^>]*>([\s\S]*?)<\/p>\s*(?=<\/li>|<ul|<ol)/gi, "<li$1>$2")
    // Links keep their address: "text (https://…)". A link whose text is
    // already the address stays as-is.
    .replace(
      /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_, href: string, inner: string) => {
        // Entities stay encoded here; the whole text is decoded once below.
        const label = inner.replace(/<[^>]+>/g, "").trim();
        const url = href.trim();
        return !label || decodeEntities(label) === decodeEntities(url)
          ? url
          : `${label} (${url})`;
      },
    )
    .replace(/<ol\b[^>]*>[\s\S]*?<\/ol>/gi, numberOrderedList)
    // A list starts on a new line; each item ends one (</li> below). The
    // item itself adds no break, so a list hugs the line introducing it.
    .replace(/<(ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, `${BULLET} `)
    .replace(/<\/(ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|th|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  text = decodeEntities(text);
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+$/g, "").replace(/^[ \t\u00a0]+/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    // No blank line between an intro line and the list under it.
    .replace(new RegExp(`\\n\\n(?=(?:${BULLET} |\\d+\\. ))`, "g"), "\n")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Escapes a line and turns bare URLs into links.
function inlineHtml(line: string): string {
  return escapeHtml(line).replace(
    /https?:\/\/[^\s<]+[^\s<.,;:!?)\]]/g,
    (url) => `<a href="${url}">${url}</a>`,
  );
}

const BULLET_LINE = new RegExp(`^\\s*(?:${BULLET}|[-*])\\s+(.*)$`);
const NUMBERED_LINE = /^\s*\d+[.)]\s+(.*)$/;

// The compose box's plain text as email HTML: blank-line-separated
// paragraphs, consecutive bullet lines as <ul>, numbered lines as <ol>,
// bare URLs linked, everything escaped. Inverse of htmlToText for the
// shapes snippets produce.
export function textToEmailHtml(text: string): string {
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(`<p>${paragraph.map(inlineHtml).join("<br/>")}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(
        `<${list.tag}>${list.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${list.tag}>`,
      );
      list = null;
    }
  };

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    const bullet = BULLET_LINE.exec(line);
    const numbered = bullet ? null : NUMBERED_LINE.exec(line);
    if (bullet || numbered) {
      const tag = bullet ? "ul" : "ol";
      const item = (bullet ?? numbered)![1];
      flushParagraph();
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(item);
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks.join("");
}

// Drops the quoted history a mail client appends to a reply ("On … wrote:",
// Outlook's original-message block, ">" lines), leaving only what the sender
// typed. Takes plain text (run htmlToText first). Returns "" when the reply
// was nothing but the quote.
export function stripQuotedReply(text: string): string {
  const markers = [
    // Gmail / Apple Mail; the attribution line can wrap onto a second line.
    /(^|\n)[ \t]*On\s[^\n]*(\n[^\n]*)?\swrote:[ \t]*(\n|$)/,
    /(^|\n)[ \t]*-{2,}\s*Original Message\s*-{2,}/i,
    // Outlook's header block.
    /(^|\n)[ \t]*From:\s[^\n]*\n[ \t]*Sent:\s/,
    /(^|\n)[ \t]*>/,
  ];
  let cut = text.length;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match && match.index < cut) cut = match.index;
  }
  return text.slice(0, cut).trim();
}

// Strips markup only when the value actually looks like HTML, so plain-text
// bodies with a stray "<" or "&" pass through untouched.
export function textFromMaybeHtml(value: string): string {
  return /<[a-z][\s\S]*>/i.test(value) ? htmlToText(value) : value.trim();
}
