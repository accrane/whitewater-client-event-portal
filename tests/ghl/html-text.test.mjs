import assert from "node:assert/strict";
import test from "node:test";

import { BULLET, htmlToText, textToEmailHtml } from "../../src/lib/ghl/html-text.ts";

test("list items become bullet lines, one per item, even when GHL wraps them in <p>", () => {
  const html =
    '<p>Please send:</p><ul><li aria-level="1"><p role="presentation">Grade Level:</p></li>' +
    '<li aria-level="1"><p role="presentation">Lunch Plans:</p></li></ul><p>Thanks!</p>';
  assert.equal(
    htmlToText(html),
    ["Please send:", `${BULLET} Grade Level:`, `${BULLET} Lunch Plans:`, "", "Thanks!"].join("\n"),
  );
});

test("ordered lists are numbered", () => {
  assert.equal(
    htmlToText("<ol><li>Arrive</li><li>Check in</li></ol><p>Done</p>"),
    ["1. Arrive", "2. Check in", "", "Done"].join("\n"),
  );
});

test("links keep their address; a bare-URL link stays a URL", () => {
  assert.equal(
    htmlToText('<p>See our <a href="https://whitewater.org/field-trips/"><u>packages</u></a> today.</p>'),
    "See our packages (https://whitewater.org/field-trips/) today.",
  );
  assert.equal(
    htmlToText('<p><a href="https://x.org/a?b=1&amp;c=2">https://x.org/a?b=1&amp;c=2</a></p>'),
    "https://x.org/a?b=1&c=2",
  );
});

test("nbsp-only paragraphs collapse to a single blank line", () => {
  assert.equal(
    htmlToText("<p>One</p><p>&nbsp;</p><p>&nbsp;</p><p>Two&nbsp;&nbsp;</p>"),
    "One\n\nTwo",
  );
});

test("table cells land on their own lines", () => {
  assert.equal(
    htmlToText("<table><tr><td><p><strong>Wildwoods</strong></p></td></tr><tr><td>Half day</td></tr></table>"),
    "Wildwoods\n\nHalf day",
  );
});

test("textToEmailHtml builds paragraphs, bullet and numbered lists, and links", () => {
  const text = [
    "Hi Dana,",
    "",
    "Please send:",
    `${BULLET} Grade Level`,
    "- Lunch Plans",
    "",
    "Then:",
    "1. Arrive",
    "2. Check in",
    "",
    "Details: https://whitewater.org/field-trips/.",
    "Thanks <3",
  ].join("\n");
  assert.equal(
    textToEmailHtml(text),
    "<p>Hi Dana,</p>" +
      "<p>Please send:</p><ul><li>Grade Level</li><li>Lunch Plans</li></ul>" +
      "<p>Then:</p><ol><li>Arrive</li><li>Check in</li></ol>" +
      '<p>Details: <a href="https://whitewater.org/field-trips/">https://whitewater.org/field-trips/</a>.<br/>Thanks &lt;3</p>',
  );
});

test("a snippet survives the round trip with its list intact", () => {
  const html = "<p>Send me:</p><ul><li><p>Grade Level:</p></li><li><p>Lunch Plans:</p></li></ul><p>Thanks</p>";
  assert.equal(
    textToEmailHtml(htmlToText(html)),
    "<p>Send me:</p><ul><li>Grade Level:</li><li>Lunch Plans:</li></ul><p>Thanks</p>",
  );
});
