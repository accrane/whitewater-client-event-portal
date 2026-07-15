import assert from "node:assert/strict";
import test from "node:test";

import { noteHtmlHasContent } from "../../src/lib/schedule/index.ts";

test("noteHtmlHasContent rejects editor residue", () => {
  assert.equal(noteHtmlHasContent(""), false);
  assert.equal(noteHtmlHasContent("<br>"), false);
  assert.equal(noteHtmlHasContent("<p></p>"), false);
  assert.equal(noteHtmlHasContent("<p><br></p>"), false);
  assert.equal(noteHtmlHasContent("<div>&nbsp; &nbsp;</div>"), false);
});

test("noteHtmlHasContent accepts text and images", () => {
  assert.equal(noteHtmlHasContent("<p>Bring water shoes</p>"), true);
  assert.equal(noteHtmlHasContent("plain text"), true);
  assert.equal(noteHtmlHasContent('<p><img src="map.png"></p>'), true);
});
