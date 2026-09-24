import assert from "node:assert/strict";
import test from "node:test";

import {
  hasUnseenReply,
  readReplyContactId,
  webhookSecretMatches,
} from "../../src/lib/ghl/reply-flags.ts";

test("the contact id comes from custom data or GHL's default payload", () => {
  assert.equal(readReplyContactId({ ghl_contact_id: "abcDEF123456" }), "abcDEF123456");
  assert.equal(readReplyContactId({ contact_id: " xyz987654321 " }), "xyz987654321");
  assert.equal(readReplyContactId({ contactId: "Q1w2E3r4T5y6" }), "Q1w2E3r4T5y6");
  // Custom data wins when both are present.
  assert.equal(
    readReplyContactId({ ghl_contact_id: "fromCustomData1", contact_id: "fromDefault00001" }),
    "fromCustomData1",
  );
});

test("anything that isn't a GHL id is refused", () => {
  assert.equal(readReplyContactId({ ghl_contact_id: "" }), null);
  assert.equal(readReplyContactId({ ghl_contact_id: "{{contact.id}}" }), null);
  assert.equal(readReplyContactId({ ghl_contact_id: "../../etc/passwd" }), null);
  assert.equal(readReplyContactId({ ghl_contact_id: 12345678 }), null);
  assert.equal(readReplyContactId(null), null);
  assert.equal(readReplyContactId([{ ghl_contact_id: "abcDEF123456" }]), null);
});

test("a reply is new until someone opens the conversation after it", () => {
  assert.equal(hasUnseenReply({ last_inbound_at: "2026-09-24T10:00:00Z", seen_at: null }), true);
  assert.equal(
    hasUnseenReply({ last_inbound_at: "2026-09-24T10:00:00Z", seen_at: "2026-09-24T09:00:00Z" }),
    true,
  );
  assert.equal(
    hasUnseenReply({ last_inbound_at: "2026-09-24T10:00:00Z", seen_at: "2026-09-24T10:05:00Z" }),
    false,
  );
});

test("the webhook secret must match exactly", () => {
  assert.equal(webhookSecretMatches("s3cret-value", "s3cret-value"), true);
  assert.equal(webhookSecretMatches("s3cret-valu", "s3cret-value"), false);
  assert.equal(webhookSecretMatches("", "s3cret-value"), false);
  assert.equal(webhookSecretMatches(null, "s3cret-value"), false);
});
