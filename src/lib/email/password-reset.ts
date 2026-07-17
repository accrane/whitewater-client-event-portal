// Password-reset email content. Kept free of runtime imports so the template
// can be exercised directly in scripts/tests.

export type PasswordResetEmail = {
  subject: string;
  html: string;
  text: string;
};

export function buildPasswordResetEmail(resetUrl: string): PasswordResetEmail {
  const subject = "Reset your Event Portal password";

  const text = [
    "We received a request to reset your Event Portal password.",
    "",
    `Choose a new password here: ${resetUrl}`,
    "",
    "The link expires after a short time. If you didn't request this, you can ignore this email — your password is unchanged.",
  ].join("\n");

  const html = `
<div style="margin:0 auto;max-width:520px;padding:32px 24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:0.25em;text-transform:uppercase;color:#64748b;">Portal Admin</p>
  <h1 style="margin:12px 0 0;font-size:24px;line-height:1.3;color:#020617;">Reset your password</h1>
  <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#334155;">
    We received a request to reset your Event Portal password. Click the button
    below to choose a new one.
  </p>
  <p style="margin:28px 0;">
    <a href="${escapeHtml(resetUrl)}"
       style="display:inline-block;padding:12px 28px;border-radius:9999px;background:#020617;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
      Choose a new password
    </a>
  </p>
  <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
    The link expires after a short time. If you didn't request this, you can
    ignore this email &mdash; your password is unchanged.
  </p>
  <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;word-break:break-all;">
    Button not working? Paste this link into your browser:<br />
    ${escapeHtml(resetUrl)}
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
