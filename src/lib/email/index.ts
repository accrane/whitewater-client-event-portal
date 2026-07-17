import { getEnv, getOptionalEnv } from "@/lib/env";

// Server-side email via the client's Mailgun account. Uses the HTTP API
// directly (no SDK): POST /v3/{domain}/messages with basic auth.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative for clients that don't render HTML. */
  text: string;
};

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailInput): Promise<void> {
  const apiKey = getEnv("MAILGUN_API_KEY");
  const domain = getEnv("MAILGUN_DOMAIN");
  const from = getEnv("EMAIL_FROM");
  // EU-hosted Mailgun domains use https://api.eu.mailgun.net instead.
  const baseUrl = getOptionalEnv("MAILGUN_API_BASE_URL") || "https://api.mailgun.net";

  const body = new URLSearchParams({ from, to, subject, text, html });

  const response = await fetch(`${baseUrl}/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
    },
    body,
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Mailgun send failed (${response.status}): ${detail}`);
  }
}
