// GHL rich-text fields (email bodies, task descriptions, notes) often arrive
// as HTML; the drawers render them as plain text. Shared by the
// conversations, notes, and tasks libs.
export function htmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
