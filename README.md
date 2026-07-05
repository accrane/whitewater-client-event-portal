# Client Event Portal

A custom external client portal for booked events, integrated with GoHighLevel.

GoHighLevel remains the CRM/system of record. This app provides the client-facing portal and planner-facing admin workflow for event checklists, uploads, vendor submissions, portal launch, and readiness review.

## Current build phase

This repository is in the local app shell phase.

Implemented so far:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Placeholder home page
- Supabase-backed admin login route: `/admin/login`
- Protected admin dashboard placeholder route: `/admin`
- Placeholder client portal route: `/e/demo-token`

Not connected yet:

- GoHighLevel
- File uploads

Local foundation completed:

- Database migration draft
- Temporary seed checklist template
- Supabase client/server helper structure

## Local development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful routes:

```text
/                 App overview shell
/admin            Admin dashboard placeholder
/e/demo-token     Client portal placeholder
```

## Verification

Run linting:

```bash
npm run lint
```

Run a production build:

```bash
npm run build
```

## Environment variables

Copy `.env.example` to `.env.local` when real services are ready:

```bash
cp .env.example .env.local
```

Do not commit real secrets.

## Planned architecture

Primary stack:

```text
Next.js + TypeScript
Tailwind CSS
Supabase Postgres/Auth/Storage
GoHighLevel API/webhooks
Vercel staging/production
```

Key principle:

```text
GHL owns official event/client/business fields.
Portal owns client-facing checklist, uploads, vendors, page views, and readiness UI.
```

## Related planning notes

Obsidian planning docs:

```text
Client Event Portal - Planning Handoff.md
Client Event Portal - MVP Architecture.md
Client Event Portal - GHL Setup Checklist.md
Client Event Portal - Implementation Plan.md
```

Repo handoff docs:

```text
docs/client-event-portal-preview-handoff.md
```
