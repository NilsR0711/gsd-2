# Bundled Agents

This directory ships with GSD-2 as user-scoped agents discoverable by `src/resources/extensions/subagent/agents.ts`. Anything you add here ships to all GSD users.

For project-only customization, use `.gsd/agents/<name>.md` instead — those override bundled agents of the same name.

See [docs/AGENTS.md](../../../docs/AGENTS.md) for dispatch rules, decision triage, and the full skill catalog.

## Frontmatter schema

```yaml
---
name: <unique-id>           # required — referenced by dispatch
description: <one-line>     # required — shown in agent picker
tools: read, grep, bash     # optional — comma-separated allowlist; omit = all tools
model: sonnet               # optional — overrides subagent_model preference
conflicts_with: other-name  # optional — comma-separated, prevents co-running
---
```

The body of the markdown file is the system prompt.

## `conflicts_with` — when to declare it

Declare a conflict when two agents share **write surface** or **state**:

- They both produce or mutate the same artifact (a plan file, an ADR, a schema migration).
- One of them is a phase-bound agent (`plan-milestone`, `research-slice`, etc.) whose context another agent would clobber.
- Running them in parallel would cause race conditions or duplicate work.

Conflicts are enforced at dispatch — `discoverAgents()` filters and `agents.ts:37 (parseConflictsWith)` parses the comma-separated list. The dispatcher refuses to co-run conflicting agents in `parallel` or `chain` modes.

Examples in this directory:

- `planner.md` declares `conflicts_with: plan-milestone, plan-slice, plan-task, research-milestone, research-slice` — prevents the general planner from running while a phase-specific planner is active.

If you add a new write-surface agent (e.g. another planner variant, a schema migrator, an ADR writer), audit the existing list and declare conflicts symmetrically.

## Adding a new bundled agent

1. Pick a unique `name` (kebab-case, no spaces).
2. Write a focused `description` — it shows up in the dispatcher picker, so it must communicate "when to dispatch" in one line.
3. Restrict `tools` if you can. Recon-only agents almost never need `write` or `edit`.
4. Body = system prompt. Match the structure of `scout.md` and `planner.md` (Strategy → Output Format).
5. Run the existing tests under `src/resources/extensions/subagent/tests/` before opening a PR.
6. Update [docs/AGENTS.md](../../../docs/AGENTS.md) and the README's Bundled Agents table so the agent is discoverable to humans, not just the dispatcher.
