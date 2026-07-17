# Set up the `/design` skill in Claude Code

Claude Code skills live in a project-level `.claude/skills/` directory. A skill named `design` can be invoked by typing `/design` in Claude Code.

## Installation

From the root of your project, create this folder:

```text
.claude/skills/design/
```

Copy the provided `SKILL.md` into it:

```text
.claude/skills/design/SKILL.md
```

Your structure should look like:

```text
your-project/
├── .claude/
│   └── skills/
│       └── design/
│           └── SKILL.md
├── src/
└── ...
```

Restart Claude Code or begin a new session if the command does not appear immediately.

## How to use it

Start with an audit and plan:

```text
/design Audit and redesign the event detail page. Do not edit code yet. Show me the proposed hierarchy and implementation plan first.
```

Design a specific workflow:

```text
/design Improve the inquiry-to-planning workflow. Focus on making the next action obvious and preserving the relationship between the GHL opportunity and the portal event.
```

Use screenshots as references:

```text
/design Review the screenshots I attached. Extract the strongest layout and interaction ideas, then adapt them to this app. Do not directly clone the reference.
```

Proceed directly to implementation:

```text
/design Redesign the dashboard using the skill instructions and implement it now. Preserve all current functionality and run the relevant checks when finished.
```

## Recommended first command for an existing app

```text
/design Inspect the entire application shell and the main dashboard. Do not make changes yet. Audit the navigation, hierarchy, component consistency, responsive behavior, accessibility, and the main event-planning workflow. Then propose one cohesive design direction and list the exact files you would change.
```

## Add project facts to `CLAUDE.md`

Keep stable technical and business facts in the root `CLAUDE.md`, while keeping the repeatable design procedure in the skill.

Useful project facts might include:

```md
## Product context

- This application works alongside GoHighLevel for event planners.
- A portal event is linked to the correct GHL opportunity through a stored event ID.
- The core workflow is inquiry → planning → proposal sent → confirmed → fulfillment.
- The event record is the application's central source of truth.
- Users need fast operational views as well as polished schedules they can share or print.

## Technical rules

- Preserve the current framework, routing, API contracts, and authentication.
- Reuse existing components before adding dependencies.
- Do not change database schemas or GHL field mappings without explaining the migration.
- Present a plan for approval before major multi-page redesigns.
```
