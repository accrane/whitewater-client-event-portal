<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Living docs

Two docs, two audiences — keep them separate:

- `docs/manual.md` is the **user guide**, rendered inside the app at
  `/admin/manual` for coordinators. Plain language: what a screen is for, how a
  step works, what happens automatically. No code paths, env vars, log
  names, or history.
- `docs/developer-notes.md` is the **engineering record**: architecture,
  data/sync reference, PandaDoc internals, configuration, GHL-side setup,
  and the changelog. GHL field details belong in `docs/ghl-custom-fields.md`.

When you ship a feature that changes a workflow, screen, GHL field, or
config, update the right doc(s) in the same change — developer-notes.md
section 6 says exactly what to check.
