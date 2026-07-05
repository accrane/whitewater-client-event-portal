# Client Event Portal — Preview Handoff

_Last updated: 2026-07-05_

## Purpose

This app is a custom external client portal for booked events. It gives clients a clean event hub for key details, checklists, vendor information, and file uploads while keeping GoHighLevel as the primary CRM and business system of record.

The current milestone is intended for stakeholder preview before live GoHighLevel field/workflow setup.

## Current ownership model

```text
GoHighLevel = system of record
Portal/Supabase = client-facing operational portal
```

### GoHighLevel owns

- Contact/client identity
- Opportunity/sales process
- Official booked Event record
- Assigned planner/coordinator
- Official event summary fields such as date, arrival time, and meeting location
- Proposal, contract, invoice, and payment links
- Payment status
- Client messaging/email/SMS workflows
- Eventually: stored portal URL and portal status after launch writeback is connected

### Portal owns

- Secure client portal access
- Portal draft/launched/archived state
- Event-specific checklist items and statuses
- Client checklist submissions that require planner review
- Vendor submissions from the client portal
- File upload metadata and private Supabase Storage objects
- Planner review status for checklist/vendor/upload submissions
- Integration logs and portal troubleshooting state

## Preview environment expectations

The preview deployment should be treated as a staging/demo environment, not production.

Use it to review:

- The planner/admin experience
- The client-facing portal experience
- Checklist setup/review behavior
- Vendor submission/review behavior
- Upload/review behavior
- Overall language and layout

Do not use it yet for:

- Live client invitations
- Production GoHighLevel automation
- Production payment/document workflows
- Final branded launch

## Implemented in the current MVP milestone

### App foundation

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Postgres/Auth/Storage integration
- Local `.env.local` support with committed `.env.example`
- Protected admin routes through Supabase Auth
- Client token route under `/e/[token]`

### Admin/planner side

Routes:

```text
/admin
/admin/login
/admin/events
/admin/events/[eventId]
/admin/integration-logs
/admin/past-events
```

Implemented behavior:

- Admin login/logout
- Dashboard cards for draft/launched/upcoming/review states
- Event list with portal status and review badges
- Event detail page with read-only event summary from Supabase/GHL snapshot
- Portal launch preparation
- Checklist template application
- Event-specific checklist item editing
- Planner review for client-submitted checklist items
- Vendor submission visibility
- Mark vendor submission reviewed
- Upload review visibility
- Temporary signed download links for private uploaded files
- Mark upload reviewed
- Integration log list

### Client side

Route:

```text
/e/[token]
```

Implemented behavior:

- Invalid/inactive portal link state
- Launched portal detail view
- Event summary
- Planner contact
- Document/payment link display
- Client-visible checklist items
- Client action to mark eligible checklist items ready for planner review
- Vendor submission form
- File upload form
- Recent upload display

### Supabase setup completed locally/remotely during this milestone

Schema tables exist:

```text
checklist_template_items
checklist_templates
event_checklist_items
events
integration_logs
uploads
vendors
```

Private Storage bucket exists:

```text
event-uploads
```

Bucket settings:

```text
public: false
file_size_limit: 26214400
allowed_mime_types:
  - application/pdf
  - image/jpeg
  - image/png
  - image/heic
  - image/heif
```

### Verified end-to-end locally

The following complete flow has been verified:

1. Draft event exists in Supabase.
2. Admin prepares portal launch.
3. Portal status changes to launched.
4. Secure client portal URL opens.
5. Client uploads a PDF.
6. File lands in private Supabase Storage.
7. Row lands in `uploads` with `needs_review` state.
8. Admin event detail shows the uploaded file.
9. Admin opens a temporary signed download URL.
10. Admin marks the upload reviewed.

## Important preview URLs

Local development:

```text
http://localhost:3000
```

Admin event detail example used during local testing:

```text
http://localhost:3000/admin/events/476e3e07-91e0-4a96-9c7c-97e0742bcf88
```

Client portal links are generated per event when the planner prepares launch. They look like:

```text
http://localhost:3000/e/<secure-token>
```

For deployed preview, `PORTAL_BASE_URL` must be set to the preview/staging domain so newly launched portal links use the server URL instead of localhost.

## Environment variables needed for preview deployment

Required Supabase variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=event-uploads
```

Portal URL variable:

```text
PORTAL_BASE_URL=https://<preview-domain>
```

GoHighLevel variables can remain blank or placeholder until GHL setup begins, unless testing the draft-event API route:

```text
GHL_LOCATION_ID
GHL_API_BASE_URL=https://services.leadconnectorhq.com
GHL_ACCESS_TOKEN
GHL_WEBHOOK_SECRET
GHL_EVENT_OBJECT_ID_OR_KEY
```

Security notes:

- Do not commit `.env.local` or real secrets.
- `SUPABASE_SERVICE_ROLE_KEY` must only be set server-side in the deployment environment.
- The uploaded files bucket is private; admin downloads use short-lived signed URLs.

## How the portal flow works

### 1. Draft event creation

For now, draft event creation is available through the portal API and local seeded/test data. In production, GHL will create or trigger this draft event after the booked-event conditions are met.

Target production trigger:

```text
Contract Signed = Yes
AND Deposit Paid = Yes
AND no existing portal event for this booked event
```

### 2. Planner setup

The planner logs into `/admin`, opens the event, and reviews the synced event details.

Planner can:

- apply a checklist template
- edit event checklist items
- control client visibility
- review client submissions
- prepare the portal launch

### 3. Portal launch

The planner explicitly prepares launch. This generates a secure client portal URL and changes the event to launched.

Current MVP behavior:

- Generates/stores secure token hash
- Stores client portal URL
- Marks event launched
- Logs launch handoff

Current MVP does not yet:

- write the URL back to GHL
- send email/SMS to the client
- notify assigned staff

Those remain GoHighLevel-owned workflows and are intentionally deferred until GHL fields are configured.

### 4. Client portal use

The client opens the secure link and can:

- view event details
- view planner contact details
- view document/payment links
- review checklist items
- mark eligible checklist items ready for planner review
- submit vendor details
- upload requested files

Client submissions are not automatically considered final. Planner review remains required.

### 5. Planner review

Admin event detail highlights items needing review:

- checklist items with `needs_review`
- client-submitted vendors with metadata status `needs_review`
- uploads with status/metadata `needs_review`

Planner can mark vendor and upload submissions reviewed. Checklist items can be edited/completed by the planner.

## What to show stakeholders in preview

Suggested demo script:

1. Log into `/admin`.
2. Open the Acme test event.
3. Show event details and portal launch status.
4. Show checklist setup/review section.
5. Open the client portal link in a separate tab.
6. Show the event summary, checklist, vendor form, and upload form.
7. Upload a small PDF/image.
8. Return to admin event detail.
9. Show the upload review section.
10. Open the signed download link.
11. Mark the upload reviewed.
12. Explain that live GHL setup is the next phase.

## Version 2 / deferred items

The following are intentionally deferred until after preview feedback and GHL setup.

### GoHighLevel integration

- Final GHL Custom Object field creation
- Final workflow trigger selection
- Live webhook from GHL to portal
- GHL Event record read/update API integration
- Write portal URL/status/launched date back to GHL
- GHL-driven client notification workflows
- GHL task/notification creation for planner review items
- Exact GHL assigned-planner field behavior

### Client messaging and notifications

- Automated client email/SMS from the portal
- Client upload/vendor/checklist confirmation emails beyond in-page messages
- Planner/staff email alerts for new submissions
- Reminder scheduling
- Escalation rules for overdue tasks

### Admin experience

- Full checklist template editor
- Drag-and-drop checklist reordering
- Detailed schedule/timeline builder
- Multi-planner or coordinator assignments
- Admin-side vendor editing/approval workflow beyond reviewed status
- Upload categorization by checklist item/vendor
- Bulk review actions
- Advanced readiness scoring
- Audit/activity timeline beyond current integration logs

### Client portal experience

- Full branding pass
- Mobile polish after stakeholder review
- Editable client submissions
- Client-side vendor list management
- Client-side upload deletion/replacement
- Detailed event schedule
- Arrival instructions and richer event-day details
- Multi-contact or collaborator access
- Optional full client accounts instead of secure links

### Files/storage

- Virus scanning
- File preview thumbnails
- File categories/folders
- Long-term retention rules
- Admin delete/archive actions
- Signed URL expiration controls in UI

### Security/operations

- Production RLS policy hardening beyond service-role server access pattern
- Rate limiting for public token routes
- Token rotation/revocation UI
- Expiration policy for public links
- Dedicated staging vs production Supabase projects
- Error monitoring/alerting
- Backups and operational runbooks

### Reporting/analytics

- Client page view analytics beyond basic fields
- Portal completion reporting
- Staff workload dashboards
- GHL/source-of-record reconciliation reports

## Known preview limitations

- Preview data is test/demo data.
- GHL is not live-connected yet.
- Portal URL currently depends on `PORTAL_BASE_URL`; set it correctly before launching events on the deployed preview.
- Client notification remains manual/GHL-owned.
- Admin download links are temporary signed URLs generated at page load.
- The admin UI is functional but not final branded design.

## Recommended next steps

1. Push the current repo to GitHub.
2. Import the GitHub repo into Vercel.
3. Add Supabase environment variables in Vercel.
4. Set `PORTAL_BASE_URL` to the Vercel preview/staging URL.
5. Deploy preview.
6. Create or reuse a test event in Supabase.
7. Launch a portal on the deployed URL.
8. Share admin/client preview instructions with stakeholders.
9. Collect feedback before configuring live GHL fields/workflows.
