# Domain cutover checklist — vercel.app → sales.whitewater.org

_Written 2026-09-15, before the domain was chosen. `sales.whitewater.org` is
a placeholder; substitute the real subdomain everywhere below._

Nothing in the app's code contains the production host: every absolute URL
the app builds comes from either the request's own host (password-reset
links, the portal URL shown on the event page) or the `PORTAL_BASE_URL`
environment variable (the portal link written to GHL on launch). So the
cutover is DNS, Vercel, one env var, and the external systems that were
given the old URL.

## Before the switch

- [ ] **Vercel → Project → Settings → Domains:** add `sales.whitewater.org`.
      Vercel shows the DNS record to create (a CNAME to `cname.vercel-dns.com`
      for a subdomain). SSL is automatic once DNS resolves.
- [ ] **whitewater.org DNS** (wherever the zone is hosted): add that CNAME.
      Wait for Vercel to show the domain as valid.
- [ ] **Keep the old address working:** in the same Domains screen set
      `whitewater-client-event-portal.vercel.app` to **redirect** to the new
      domain (308). Any portal link, bookmark, or GHL field that still carries
      the old host then lands in the right place.

## The switch

- [ ] **Vercel → Settings → Environment Variables:** set `PORTAL_BASE_URL` to
      `https://sales.whitewater.org` for Production, then **redeploy** (env
      changes don't apply until the next build). This is the base of the
      portal link the app writes to the opportunity's **Portal Link** field
      at launch; until it is changed, new launches write vercel.app links.
- [ ] **GHL workflow "Group Sales Inquiry: Step 1 - Form Submission":** open
      the **Portal: create draft event** webhook action and change the URL to
      `https://sales.whitewater.org/api/ghl/opportunities/inquiry`. The
      `x-portal-webhook-secret` header and the custom data stay as they are.
      Save the action, save the workflow (it is already published).
- [ ] **Test:** submit one website inquiry. Expect a draft under Events and a
      `create_inquiry_event` success row in Admin → Integration Logs. If the
      webhook action's execution log shows a non-2xx response, the URL or
      secret is wrong.

## External systems that hold the URL

- [ ] **GHL Portal Link custom field on launched opportunities.** As of
      2026-09-15 the only two launched events are tests with no Portal Link
      in GHL, so there is nothing to rewrite. If real events are launched
      before the cutover, either re-check their Portal Link field afterwards
      (re-launch is not needed — edit the field, or rely on the vercel.app
      redirect above).
- [ ] **GHL emails / workflow steps that send the portal link** must read the
      Portal Link field rather than a typed URL. The location's snippets held
      no vercel.app URL on 2026-09-15; check the "send portal link" workflow
      step and any email template by hand.
- [ ] **PandaDoc webhook** (not registered yet): when it is, use
      `https://sales.whitewater.org/api/pandadoc/webhook`. If it gets
      registered against vercel.app first, re-register it.
- [ ] **Clients' bookmarks and links already sent:** covered by the
      vercel.app redirect. Nothing to do if that redirect is in place.

## Things that need no change (checked)

- **Password-reset emails** — the link is built from the request's host, so
  it follows whatever domain the coordinator used. Mailgun sends from
  `mg.whitewater.org`, unrelated to the app host.
- **Supabase Auth URL configuration** — the app never uses Supabase's
  redirect URLs (resets are verified by token hash on our own
  `/reset-password` page), so Site URL / Redirect URLs can stay as they
  are. Setting Site URL to the new domain is tidy but optional.
- **Local development** — `.env.local` keeps `PORTAL_BASE_URL=http://localhost:3000`.
- **GHL Private Integration, Salesforce, PandaDoc API** — key-based, no
  callback or redirect URI.
- **Stored portal URLs in the database** — saved as paths (`/e/<token>`),
  so they resolve on any host. One old test row still holds a
  `localhost:3000` absolute URL; harmless.

## After the switch

- [ ] **Everyone signs in again.** Sessions are cookies scoped to the host;
      the new domain starts with none. Tell the coordinators, and update any
      shared bookmark or the link in GHL's launchpad/notes if one exists.
- [ ] **Update the docs:** `docs/developer-notes.md` §5 names the production
      URL; replace it. Also the "?" manual link needs nothing (relative).
- [ ] **Watch Integration Logs for a day** for anything still pointed at the
      old host (a failed webhook shows up there or in GHL's workflow
      execution log).
