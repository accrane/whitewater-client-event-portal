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

// Strips markup only when the value actually looks like HTML, so plain-text
// bodies with a stray "<" or "&" pass through untouched.
export function textFromMaybeHtml(value: string): string {
  return /<[a-z][\s\S]*>/i.test(value) ? htmlToText(value) : value.trim();
}
