import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeRichHtml } from "../../src/lib/html/sanitize.ts";

test("formatting survives as real HTML, not escaped text", () => {
  const html =
    "<p>Hello <strong>there</strong> <em>friend</em></p>" +
    "<ul><li>Water shoes</li></ul><ol><li>Arrive</li></ol><p>Line<br>break</p>";
  assert.equal(sanitizeRichHtml(html), html);
  assert.equal(sanitizeRichHtml("<p>hello</p>"), "<p>hello</p>");
});

test("pasted styling is stripped but the structure stays", () => {
  assert.equal(
    sanitizeRichHtml(
      '<p dir="ltr" style="line-height:1.38"><strong style="font-family:Arial;color:#222">Bring</strong> ' +
        '<span class="x" role="button" tabindex="0" style="color:red">sunscreen</span></p>',
    ),
    "<p><strong>Bring</strong> <span>sunscreen</span></p>",
  );
});

test("scripts, handlers and embeds are removed", () => {
  assert.equal(sanitizeRichHtml("<p>a</p><script>alert(1)</script>"), "<p>a</p>");
  assert.equal(sanitizeRichHtml('<p onclick="alert(1)">a</p>'), "<p>a</p>");
  assert.equal(
    sanitizeRichHtml('<iframe src="https://evil.test"></iframe><form><input></form><p>ok</p>'),
    "<p>ok</p>",
  );
  assert.equal(sanitizeRichHtml("<style>p{display:none}</style><p>ok</p>"), "<p>ok</p>");
  const img = sanitizeRichHtml('<img src="https://cdn.test/map.png" onerror="alert(1)">');
  assert.equal(img, '<img src="https://cdn.test/map.png">');
});

test("links keep safe addresses and open in a new tab", () => {
  assert.equal(
    sanitizeRichHtml('<a href="https://whitewater.org/map">Map</a>'),
    '<a href="https://whitewater.org/map" target="_blank" rel="noopener noreferrer">Map</a>',
  );
  const js = sanitizeRichHtml('<a href="javascript:alert(1)">x</a>');
  assert.doesNotMatch(js, /javascript/i);
  assert.match(sanitizeRichHtml('<a href="mailto:groups@whitewater.org">Email</a>'), /href="mailto:/);
});

test("images: editor uploads and https only", () => {
  const upload = '<img src="data:image/jpeg;base64,/9j/4AAQSkZJRg==" alt="Map">';
  assert.match(sanitizeRichHtml(upload), /src="data:image\/jpeg;base64,/);
  assert.equal(sanitizeRichHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">'), "");
  assert.equal(sanitizeRichHtml('<img src="data:image/svg+xml;base64,PHN2Zz4=">'), "");
  assert.equal(sanitizeRichHtml('<img src="/relative.png">'), "");
  assert.equal(sanitizeRichHtml('<img src="http://insecure.test/a.png">'), "");
});

test("merge tags, entities and empty input pass through", () => {
  assert.equal(
    sanitizeRichHtml("<p>See you {{event.date}}&nbsp;at {{event.arrival_time}}</p>"),
    "<p>See you {{event.date}}&nbsp;at {{event.arrival_time}}</p>",
  );
  assert.equal(sanitizeRichHtml(""), "");
  assert.equal(sanitizeRichHtml(null), "");
  assert.equal(sanitizeRichHtml(undefined), "");
});

test("output matches the browser's own serialization of the editor", () => {
  // What the WYSIWYG emits must come back byte-for-byte, or an untouched note
  // would look edited.
  const fromEditor =
    '<p>Arrive by 9</p><div>Bring&nbsp;water<br></div><ul><li><b>Shoes</b></li></ul>' +
    '<p><img src="data:image/jpeg;base64,/9j/4AAQ"></p>';
  assert.equal(sanitizeRichHtml(fromEditor), fromEditor);
  assert.equal(sanitizeRichHtml(sanitizeRichHtml(fromEditor)), fromEditor);
});

test("attribute values can't break out of their quotes", () => {
  const html = sanitizeRichHtml('<a href="https://x.test/?q=&quot;><script>alert(1)</script>">x</a>');
  assert.doesNotMatch(html, /<script/i);
});
