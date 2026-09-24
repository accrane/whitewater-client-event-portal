import sanitizeHtml from "sanitize-html";

// Schedule tile notes and checklist FAQ sections are rich text written in the
// admin WYSIWYG and rendered as HTML on admin pages and on the client portal.
// Everything goes through here on save and again on read (rows saved before
// this existed are cleaned when they load), so the HTML can only carry
// formatting: paragraphs, line breaks, lists, bold/italic, links and images.
// Inline styles, classes, scripts, event handlers, iframes and forms are
// removed — text pasted from other apps keeps its structure and takes the
// portal's own fonts and colors. Tests: tests/html/sanitize.test.mjs.

// Images are either uploads the editor embedded (data URLs) or https links.
const IMAGE_SRC = /^(?:https:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "div", "br", "hr", "span",
    "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup",
    "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "blockquote", "code", "pre",
    "a", "img",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["https", "data"] },
  allowProtocolRelative: false,
  // Links open outside the portal and don't hand it the client's URL.
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
    }),
  },
  // An image with no usable source is just a broken box; drop it.
  exclusiveFilter: (frame) =>
    frame.tag === "img" && !IMAGE_SRC.test(frame.attribs.src ?? ""),
};

export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return "";
  // Match how the browser serializes the editor (`<br>`, not `<br />`, and
  // non-breaking spaces as &nbsp;) so a note that comes back unedited still
  // compares equal and the editor doesn't show unsaved changes. " />" can only
  // be a tag ending here: the sanitizer escapes ">" in text and attributes.
  return sanitizeHtml(html, OPTIONS)
    .replace(/ \/>/g, ">")
    .replace(/\u00a0/g, "&nbsp;");
}
