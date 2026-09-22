import assert from "node:assert/strict";
import test from "node:test";

import { buildCoordinatorAssignedEmail } from "../../src/lib/email/coordinator-assigned.ts";

const base = {
  coordinatorName: "Sam Rivers",
  eventName: "Acme Retreat",
  eventDate: "2026-12-31",
  eventType: "General Inquiry",
  contactName: "Dana Lee",
  guestCount: 120,
  eventUrl: "https://groupsales.whitewater.org/admin/events/abc",
  assignedBy: "austin@bellaworksweb.com",
};

test("subject names the event and its date", () => {
  const email = buildCoordinatorAssignedEmail(base);
  assert.equal(
    email.subject,
    "You're the coordinator for Acme Retreat (Thursday, December 31, 2026)",
  );
});

test("text body greets by first name and lists every detail plus the link", () => {
  const { text } = buildCoordinatorAssignedEmail(base);
  assert.match(text, /^Hi Sam,/);
  assert.match(text, /assigned as the event coordinator for Acme Retreat by austin@bellaworksweb\.com\./);
  assert.match(text, /Date: Thursday, December 31, 2026/);
  assert.match(text, /Type: General Inquiry/);
  assert.match(text, /Contact: Dana Lee/);
  assert.match(text, /Guests: 120/);
  assert.match(text, /Open the event: https:\/\/groupsales\.whitewater\.org\/admin\/events\/abc/);
});

test("missing pieces read as unset rather than disappearing silently", () => {
  const { subject, text, html } = buildCoordinatorAssignedEmail({
    ...base,
    coordinatorName: null,
    eventDate: null,
    eventType: null,
    contactName: null,
    guestCount: null,
    assignedBy: null,
  });
  assert.equal(subject, "You're the coordinator for Acme Retreat");
  assert.match(text, /^Hi,/);
  assert.match(text, /Date: Not set yet/);
  assert.match(text, /Contact: Not recorded/);
  assert.doesNotMatch(text, /Type:|Guests:| by /);
  assert.match(html, /Hi, you've been assigned/);
});

test("html escapes event and contact names", () => {
  const { html } = buildCoordinatorAssignedEmail({
    ...base,
    eventName: "Smith & Sons <Retreat>",
    contactName: 'Dana "DJ" Lee',
  });
  assert.match(html, /Smith &amp; Sons &lt;Retreat&gt;/);
  assert.match(html, /Dana &quot;DJ&quot; Lee/);
  assert.doesNotMatch(html, /<Retreat>/);
});
