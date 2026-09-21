import assert from "node:assert/strict";
import test from "node:test";

import { htmlToText, stripQuotedReply } from "../../src/lib/ghl/html-text.ts";

test("stripQuotedReply keeps only the text typed above a Gmail quote", () => {
  const text = htmlToText(
    '<div>Sounds great, see you then.</div><br><div class="gmail_quote">On Mon, Sep 21, 2026 at 10:40 AM &lt;reply@lc.whitewater.org&gt; wrote:<br><blockquote>Hi John,<br>My name is Sam.</blockquote></div>',
  );
  assert.equal(stripQuotedReply(text), "Sounds great, see you then.");
});

test("stripQuotedReply handles an attribution line wrapped onto two lines", () => {
  const text =
    "Yes please.\n\nOn Mon, Sep 21, 2026 at 10:40 AM Whitewater <reply@lc.whitewater.org>\nwrote:\n> Hi John,";
  assert.equal(stripQuotedReply(text), "Yes please.");
});

test("stripQuotedReply cuts Outlook's original-message block", () => {
  const text =
    "We'll take the later slot.\n\nFrom: Whitewater <reply@lc.whitewater.org>\nSent: Monday, September 21, 2026 10:40 AM\nTo: John\n\nHi John,";
  assert.equal(stripQuotedReply(text), "We'll take the later slot.");
});

test("stripQuotedReply returns an empty string for a quote-only reply", () => {
  const text = "On Mon, Sep 21, 2026 at 10:40 AM <reply@lc.whitewater.org> wrote:\nHi John,";
  assert.equal(stripQuotedReply(text), "");
});

test("stripQuotedReply leaves a reply with no quote untouched", () => {
  assert.equal(stripQuotedReply("On it — thanks!"), "On it — thanks!");
});
