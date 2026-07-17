---
name: design
description: Audit, plan, and improve the product interface using a polished, modern SaaS dashboard design system. Use whenever the user invokes /design or asks to design, redesign, polish, modernize, or visually audit an application screen.
argument-hint: "[page, component, or workflow to design]"
---

# Product Design Skill

Use this skill whenever the user invokes `/design` or asks to design, redesign, polish, modernize, or visually audit an application screen.

## Primary objective

Create an interface that feels like a carefully designed software product—not a generic admin template. Prioritize clarity, hierarchy, speed, usability, and consistency over decoration.

The target aesthetic combines:

- **Linear:** restrained density, excellent hierarchy, command-oriented interactions, minimal visual noise.
- **Vercel:** clean spacing, sharp typography, neutral surfaces, precise borders, and strong developer-tool polish.
- **Stripe Dashboard:** complex workflows made understandable through progressive disclosure, contextual actions, and strong tables.
- **Resend:** elegant simplicity, concise copy, thoughtful empty states, and clean technical interfaces.
- **Supabase:** data-heavy backend tools organized with clear navigation, useful secondary panels, and understandable status feedback.
- **Attio:** modern CRM patterns, flexible views, polished records, and a balance of data density with visual calm.

Do not clone any one product. Use these only as quality references.

## Reference links

- Linear: https://linear.app/
- Linear dashboards: https://linear.app/docs/dashboards
- Vercel dashboard navigation: https://vercel.com/changelog/dashboard-navigation-redesign-rollout
- Vercel admin starter: https://vercel.com/templates/next.js/admin-dashboard
- Stripe Dashboard: https://support.stripe.com/topics/dashboard
- Resend: https://resend.com/
- Supabase table editor: https://supabase.com/docs/guides/database/tables
- Dashboard inspiration: https://www.925studios.co/blog/saas-dashboard-design-examples-2026
- Dashboard patterns: https://dashboarddesignpatterns.github.io/

## Operating rules

1. **Inspect before changing anything.**
   - Read the relevant routes, components, styles, layout primitives, and data structures.
   - Identify the existing design system, component library, CSS strategy, and responsive behavior.
   - Reuse established components unless they are the source of the problem.

2. **Plan before implementation.**
   - Summarize the current page purpose.
   - Identify the primary user, primary task, secondary tasks, and highest-value information.
   - Explain the proposed hierarchy and interaction model.
   - List the files likely to change.
   - Do not edit code until the user approves the plan unless explicitly told to proceed immediately.

3. **Design the workflow, not just the screen.**
   - Consider loading, empty, error, success, disabled, hover, focus, selected, and destructive states.
   - Make the next action obvious.
   - Reduce unnecessary clicks and repeated data entry.
   - Keep destructive actions separated and clearly labeled.

4. **Preserve functionality.**
   - Do not remove working behavior merely to simplify the visual design.
   - Do not invent backend capabilities.
   - Clearly label mocked or placeholder data.
   - Maintain existing permissions and role restrictions.

5. **Avoid generic AI-dashboard styling.**
   Do not default to:
   - oversized gradient cards
   - excessive glassmorphism
   - neon accents
   - giant rounded corners everywhere
   - a grid of equally weighted KPI cards
   - decorative charts without a user decision attached
   - excessive shadows
   - random icon usage
   - cramped sidebars with every feature visible at once

## Design principles

### 1. Information hierarchy

Every page should have four recognizable levels:

1. **Global navigation** — where the user is in the product.
2. **Page context** — title, concise description, status, and primary action.
3. **Working area** — the records, schedule, editor, pipeline, or report the user came to use.
4. **Supporting detail** — filters, metadata, help, history, and secondary actions.

The working area should dominate. Supporting information should not compete with it.

### 2. Layout

- Use a persistent left sidebar for major product sections when the product has more than four primary areas.
- Keep the sidebar approximately 224–256px wide on desktop and collapsible when useful.
- Use a compact top bar only for global search, notifications, workspace switching, and profile controls.
- Keep page content within a readable max width when the interface is form- or text-heavy.
- Allow tables, calendars, pipelines, timelines, and builders to use the full available width.
- Use generous page spacing but compact spacing inside data-heavy components.
- Prefer an 8px spacing system: 4, 8, 12, 16, 24, 32, 48.

### 3. Surfaces and borders

- Use a neutral application background and slightly elevated working surfaces.
- Prefer subtle 1px borders over heavy shadows.
- Use shadows only for floating menus, dialogs, popovers, and drag states.
- Use moderate corner radii, usually 6–10px. Small controls can use 6px; cards and dialogs can use 8–12px.
- Avoid nesting multiple bordered cards inside one another without a clear reason.

### 4. Typography

- Use one modern sans-serif family already available in the project.
- Create a restrained type scale rather than many arbitrary sizes.
- Suggested scale:
  - Page title: 24–30px, semibold
  - Section title: 16–18px, semibold
  - Body/interface text: 14px
  - Dense tables and metadata: 12–13px
- Use sentence case for labels and headings.
- Reserve uppercase for tiny category labels only.
- Use muted text for supporting information, never for required actions or important values.

### 5. Color

- Begin with a neutral palette and one restrained brand accent.
- Use semantic colors consistently:
  - green: success/confirmed/positive
  - amber: warning/pending/held
  - red: error/destructive/overdue
  - blue or brand accent: selected/interactive/in progress
  - gray: neutral/draft/inactive
- Never rely on color alone. Pair color with text, icon, shape, or pattern.
- Keep large page backgrounds neutral. Use accent color selectively for focus and action.

### 6. Navigation

- Group sections by user intent, not database structure.
- Use concise labels.
- Show the current location clearly.
- Place infrequent configuration items near the bottom under Settings.
- Avoid more than two nested navigation levels.
- Use breadcrumbs only when they genuinely help users understand hierarchy.

### 7. Page headers

A strong page header usually contains:

- eyebrow or breadcrumb only when needed
- clear page title
- one-sentence description when the page is not self-explanatory
- compact status or context metadata
- one visually dominant primary action
- secondary actions in a menu or less prominent button

Do not put several equally prominent buttons in the header.

### 8. Cards and metrics

- Use metric cards only for values that help the user decide or act.
- Prefer 3–5 meaningful metrics over 8–12 decorative ones.
- Include comparison context such as previous period, goal, capacity, or trend.
- Make the metric label and time range unambiguous.
- A metric should link to detail when useful.

### 9. Tables and record lists

- Use tables for comparison and scanning.
- Keep the first column visually anchored.
- Align numbers consistently and right-align monetary values.
- Use compact status badges with readable labels.
- Keep row actions quiet until hover or selection, except for the primary row action.
- Support search, filtering, sorting, pagination, and column visibility only when the dataset needs them.
- Keep filters visible when they are used frequently; move advanced filters into a panel.
- Provide useful empty states with a clear next action.

### 10. Forms

- Group fields into meaningful sections.
- Put labels above fields unless the current system has a strong established pattern.
- Add brief helper text only where users may misunderstand the requested value.
- Use sensible defaults.
- Keep required fields obvious without covering the page in asterisks.
- Place validation near the relevant field.
- Use a sticky action bar for long forms when it reduces lost work.
- Warn users before leaving with unsaved changes.

### 11. Drawers, dialogs, and detail panels

- Use a right-side drawer for quick inspection or editing that should preserve the current list context.
- Use a dedicated page for complex records, long forms, or workflows with many sections.
- Use dialogs for short, focused decisions—not entire applications inside a modal.
- Dialog titles should describe the decision or action.
- The primary button should use a verb that describes the result.

### 12. Charts

- Start with the question the chart answers.
- Prefer line charts for trends, bars for comparisons, and simple progress indicators for completion/capacity.
- Avoid pie or donut charts when precise comparison matters.
- Use direct labels or readable legends.
- Provide a textual summary of the important insight.
- Do not show a chart when a number, table, or sentence communicates the answer better.

### 13. Calendars, schedules, and pipelines

For operational applications:

- Make status visually distinct but not overwhelming.
- Clearly differentiate tentative holds, confirmed bookings, completed work, and unavailable time.
- Show time and date context without requiring the user to open every record.
- Maintain visible relationships among the contact, opportunity, event, proposal, and schedule.
- Use drag-and-drop only when there is a safe undo or confirmation path.
- Provide conflict states that explain the problem and the resolution.
- Keep the primary workflow visible: inquiry → planning → proposal → confirmed → fulfillment.

### 14. Responsive behavior

- Design desktop-first for complex back-office work, but ensure every essential workflow remains usable on tablet and mobile.
- Collapse the sidebar into a drawer.
- Convert wide tables into prioritized columns, horizontal scrolling, or record cards depending on the task.
- Keep primary actions reachable.
- Avoid shrinking dense desktop layouts until they become unreadable.

### 15. Accessibility

- Use semantic HTML.
- Ensure keyboard access and visible focus states.
- Add labels to icon-only controls.
- Maintain sufficient contrast.
- Ensure dialogs trap focus and return focus on close.
- Make status and validation understandable without color.
- Respect reduced-motion preferences.

## Component language

Build or reuse a consistent set of primitives:

- AppShell
- SidebarNav
- TopBar
- PageHeader
- Button variants: primary, secondary, ghost, destructive
- IconButton
- Badge / StatusBadge
- Card / Section
- Metric
- DataTable
- FilterBar
- SearchInput
- Tabs
- DropdownMenu
- EmptyState
- Alert / InlineNotice
- Dialog
- Drawer / Sheet
- FormField
- Date and time controls
- Skeleton loaders
- Toast notifications

Do not solve every screen with a new one-off component.

## Interaction and motion

- Use motion to communicate state changes, not to decorate.
- Keep most transitions between 120ms and 220ms.
- Use subtle opacity and transform transitions for menus, drawers, and reordered items.
- Avoid long entrance animations in a productivity application.
- Provide immediate feedback after save, send, publish, move, archive, or delete actions.

## Copy and labels

- Use plain language.
- Prefer verbs for actions: “Create event,” “Send proposal,” “Move to planning.”
- Avoid vague buttons such as “Submit,” “Continue,” or “Manage” when a precise verb is available.
- Keep empty-state copy helpful and specific.
- Explain consequences for destructive actions.

## Required `/design` workflow

When invoked, follow this sequence:

### Phase 1 — Audit

Return a concise audit containing:

- page purpose
- intended user
- primary task
- current hierarchy
- usability problems
- visual consistency problems
- accessibility concerns
- responsive concerns
- technical constraints discovered in the codebase

### Phase 2 — Direction

Propose one primary design direction, not several vague themes. Include:

- layout structure
- navigation behavior
- information hierarchy
- component changes
- typography and spacing approach
- status/color approach
- responsive behavior
- important states

### Phase 3 — Implementation plan

List:

- files to create or modify
- reusable components involved
- data or API assumptions
- implementation order
- validation steps

Stop for approval unless the user explicitly says to build immediately.

### Phase 4 — Build

After approval:

- implement the design using the project's existing stack
- retain existing business logic
- use real application data where available
- add realistic loading, empty, error, and success states
- test responsive layouts
- run the relevant formatter, linter, type checker, and tests

### Phase 5 — Review

Report:

- what changed
- key design decisions
- files changed
- any assumptions or unfinished items
- how to preview and test the work

## Screenshot-driven work

When screenshots or reference images are provided:

- Analyze structure, hierarchy, density, spacing, navigation, typography, and interaction patterns.
- Extract principles rather than copying proprietary artwork, logos, or exact layouts.
- Match the quality and feel while adapting the design to the application's actual workflow.
- Point out parts of the reference that would not work for this product.

## Project-specific design direction

For a client/event-planning operations application, favor:

- a calm, professional workspace rather than a flashy analytics dashboard
- a clear relationship among inquiries, contacts, opportunities, events, schedules, and proposals
- a strong daily-work view showing items requiring attention
- an event record that acts as the central source of truth
- a timeline or activity history for changes and communication
- prominent date, venue, event type, value, status, and next action
- fast movement through pipeline stages without losing record context
- proposal status and schedule readiness visible at a glance
- polished printable or shareable schedule views that may be more editorial than the admin interface

## Definition of done

A design task is complete only when:

- the main user task is visually obvious
- the layout remains usable at common desktop and mobile sizes
- loading, empty, error, success, disabled, and destructive states are addressed
- spacing, type, borders, and controls are consistent
- keyboard focus and labels are present
- existing functionality still works
- no unnecessary placeholder dashboard widgets were introduced
- the result looks intentional and specific to the product
