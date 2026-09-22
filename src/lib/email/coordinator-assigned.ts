// "You've been assigned an event" email content. Kept free of runtime
// imports so the template can be exercised directly in tests.

export type CoordinatorAssignedEmailInput = {
  coordinatorName: string | null;
  eventName: string;
  // yyyy-MM-dd or null.
  eventDate: string | null;
  eventType: string | null;
  contactName: string | null;
  guestCount: number | null;
  // Absolute link to the admin event page.
  eventUrl: string;
  // Who made the assignment (login email), or null when unknown.
  assignedBy: string | null;
};

export type CoordinatorAssignedEmail = {
  subject: string;
  html: string;
  text: string;
};

function formatDate(date: string | null): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  if (!match) return null;
  const value = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return value.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function buildCoordinatorAssignedEmail(
  input: CoordinatorAssignedEmailInput,
): CoordinatorAssignedEmail {
  const date = formatDate(input.eventDate);
  const firstName = input.coordinatorName?.trim().split(/\s+/)[0] || null;
  const subject = `You're the coordinator for ${input.eventName}${date ? ` (${date})` : ""}`;

  const details: [string, string][] = [
    ["Event", input.eventName],
    ["Date", date ?? "Not set yet"],
    ...(input.eventType ? ([["Type", input.eventType]] as [string, string][]) : []),
    ["Contact", input.contactName ?? "Not recorded"],
    ...(input.guestCount !== null
      ? ([["Guests", String(input.guestCount)]] as [string, string][])
      : []),
  ];
  const by = input.assignedBy ? ` by ${input.assignedBy}` : "";

  const text = [
    `Hi${firstName ? ` ${firstName}` : ""},`,
    "",
    `You've been assigned as the event coordinator for ${input.eventName}${by}.`,
    "",
    ...details.map(([label, value]) => `${label}: ${value}`),
    "",
    `Open the event: ${input.eventUrl}`,
    "",
    "Next: confirm the room bookings, fill in the event summary, and reach out to the contact from the event page.",
  ].join("\n");

  const rows = details
    .map(
      ([label, value]) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#64748b;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;font-size:14px;color:#0f172a;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`,
    )
    .join("");

  const html = `
<div style="margin:0 auto;max-width:520px;padding:32px 24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:0.25em;text-transform:uppercase;color:#64748b;">Event Portal</p>
  <h1 style="margin:12px 0 0;font-size:24px;line-height:1.3;color:#020617;">You're the coordinator for ${escapeHtml(input.eventName)}</h1>
  <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#334155;">
    Hi${firstName ? ` ${escapeHtml(firstName)}` : ""}, you've been assigned as the event coordinator${escapeHtml(by)}.
  </p>
  <table style="margin:20px 0 0;border-collapse:collapse;" role="presentation">${rows}
  </table>
  <p style="margin:28px 0;">
    <a href="${escapeHtml(input.eventUrl)}"
       style="display:inline-block;padding:12px 28px;border-radius:9999px;background:#020617;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
      Open the event
    </a>
  </p>
  <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
    Next: confirm the room bookings, fill in the event summary, and reach out
    to the contact from the event page.
  </p>
  <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;word-break:break-all;">
    Button not working? Paste this link into your browser:<br />
    ${escapeHtml(input.eventUrl)}
  </p>
</div>`.trim();

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
