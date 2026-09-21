import assert from "node:assert/strict";
import test from "node:test";

import {
  findUnfilledMergeTags,
  renderSnippetMergeTags,
} from "../../src/lib/ghl/snippet-merge-tags.ts";

const contact = {
  name: "John Smith",
  firstName: "John",
  lastName: "Smith",
  email: "john@example.com",
  phone: "+17045555555",
  companyName: "Happy Campers",
};
const event = {
  name: "Happy Campers Retreat",
  date: "November 20, 2026",
  portalLink: "https://groupsales.whitewater.org/e/abc",
  coordinator: { name: "Sam Rivers", email: "sam@whitewater.org" },
};

test("event tags fill from the event and its assigned coordinator", () => {
  const text = renderSnippetMergeTags(
    "{{contact.first_name}}, {{opportunity.assigned_to}} has your proposal for {{opportunity.groupevent_name}} on {{ opportunity.event_date }}: {{opportunity.portal_link}}",
    { contact, user: null, event },
  );
  assert.equal(
    text,
    "John, Sam Rivers has your proposal for Happy Campers Retreat on November 20, 2026: https://groupsales.whitewater.org/e/abc",
  );
});

test("user tags are the signed-in GHL user when there is one", () => {
  const text = renderSnippetMergeTags("My name is {{user.first_name}} {{user.last_name}}", {
    contact,
    user: { name: "Alex Manager", email: "alex@whitewater.org" },
    event,
  });
  assert.equal(text, "My name is Alex Manager");
});

test("user tags fall back to the event's coordinator without a GHL user match", () => {
  const text = renderSnippetMergeTags("My name is {{user.first_name}} ({{user.email}})", {
    contact,
    user: { name: null, email: "austin@example.com" },
    event,
  });
  assert.equal(text, "My name is Sam (sam@whitewater.org)");
});

test("tags with no value stay in the text and are reported as unfilled", () => {
  const text = renderSnippetMergeTags(
    "Hi {{contact.first_name}}, {{opportunity.assigned_to}} from {{business.name}} / {{business.name}}",
    { contact, user: null, event: null },
  );
  assert.equal(text, "Hi John, {{opportunity.assigned_to}} from {{business.name}} / {{business.name}}");
  assert.deepEqual(findUnfilledMergeTags(text), [
    "{{opportunity.assigned_to}}",
    "{{business.name}}",
  ]);
});

test("findUnfilledMergeTags is empty for fully rendered text", () => {
  assert.deepEqual(findUnfilledMergeTags("Hi John, see you on November 20."), []);
});
