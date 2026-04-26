# Agents & Skills Guide

Project-scope guidance for any AI coding agent (Claude Code, GSD itself, Codex, Cursor, etc.) working in this repo.

> Note: GSD auto-generates a project-scoped `AGENTS.md` at the repo root (gitignored). This canonical guide therefore lives at `docs/AGENTS.md` and is linked from `README.md` and `CONTRIBUTING.md`.

> **TL;DR — reach for an agent or a skill before you reach for raw tools.** GSD-2 ships **13 bundled agents** (`src/resources/agents/`) and **35 bundled skills** (`src/resources/skills/`). If you are about to do recon, planning, review, refactor, security work, doc writing, or anything testable — there is almost certainly an agent or skill that already does it better than ad-hoc work. Use them.

---

## Why this file exists

This repo *is* the GSD-2 coding agent. We dogfood our own conventions. That means:

- Every non-trivial task should start by asking "is there an agent for this?" then "is there a skill for this?"
- Main-context work (the agent you started with) should stay focused on orchestration and synthesis. Push exploration, research, and specialized work into subagents so the main context stays small.
- Skills capture institutional knowledge ("how we debug", "how we review", "how we ship a slice") — invoking a skill is cheaper than re-deriving it.

If you are about to do something that one of the agents or skills below already does, **delegate**. Do not re-implement their job in the main context.

---

## Bundled agents (13)

Source of truth: `src/resources/agents/*.md`. Discovered at runtime by `src/resources/extensions/subagent/agents.ts`. Each has YAML frontmatter (`name`, `description`, optional `tools`, `model`, `conflicts_with`).

### Core (use these constantly)

| Agent          | When to dispatch                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| **scout**      | Codebase recon. Returns compressed file list + key code + architecture. **Always prefer over ad-hoc grep/find when scope is unclear.** |
| **researcher** | Web research with citations (uses `search-the-web`). Anything requiring current external information.        |
| **worker**     | General-purpose execution in an isolated context. Use when a task is well-scoped but heavy (lots of edits, lots of reads). |
| **planner**    | Architecture / implementation plans. Outputs plans, never code. **Run before any non-trivial change.**       |

### Specialists (use when the task fits)

| Agent              | When to dispatch                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| **debugger**       | Hypothesis-driven bug investigation; demands root cause not just a fix.                                |
| **reviewer**       | Structured code review with severity ratings. Run before opening a PR.                                 |
| **refactorer**     | Safe transformations: extract, inline, rename, simplify.                                               |
| **tester**         | Writing tests, fixing tests, coverage gap identification.                                              |
| **security**       | OWASP audit, dependency risks, secrets detection. Run before any auth / network / parsing change.      |
| **doc-writer**     | API docs, inline comments, READMEs, ADR drafting support.                                              |
| **git-ops**        | Conflict resolution, rebase strategy, PR prep, changelog generation.                                   |
| **javascript-pro** | Modern JS specialist (ES2023+, async, perf, Node.js memory).                                           |
| **typescript-pro** | Advanced types, generics, type-level programming, monorepo project references.                        |

### Decision rules

- **Recon before edit.** If you are about to read more than ~3 files to understand something, dispatch `scout` instead.
- **Plan before edit.** Anything that touches ≥2 packages, the orchestration kernel, auto-mode, or a public API: dispatch `planner` first.
- **Review before push.** Before opening a PR, dispatch `reviewer` and apply the High/Critical findings.
- **Security gate.** Touching auth, network, parsing, file IO, or shell exec? Dispatch `security`.
- **Don't double-dispatch.** Check `conflicts_with` (below) before parallel/chain dispatch.

### `conflicts_with` (currently declared)

| Agent       | Conflicts with                                                                            |
| ----------- | ----------------------------------------------------------------------------------------- |
| **planner** | `plan-milestone`, `plan-slice`, `plan-task`, `research-milestone`, `research-slice`       |

`conflicts_with` is a comma-separated string in frontmatter. The dispatch layer (`src/resources/extensions/subagent/agents.ts:37`) refuses to co-run conflicting agents — used to prevent two planners fighting over the same artifact, or a planner running during a GSD planning phase. Add `conflicts_with` whenever a new agent shares write surface (plan files, ADRs, schema migrations) with another.

---

## Bundled skills (35)

Source of truth: `src/resources/skills/*/SKILL.md`. Skills are reusable instruction packs — invoke them with the Skill tool (or via GSD's skill discovery) instead of re-deriving best practices.

### Workflow / process

`tdd` · `verify-before-complete` · `handoff` · `decompose-into-slices` · `write-milestone-brief` · `spike-wrap-up` · `grill-me` · `btw` · `best-practices`

### Code quality & review

`review` · `security-review` · `code-optimizer` · `lint` · `forensics` · `debug-like-expert` · `dependency-upgrade`

### Frontend / UX

`frontend-design` · `accessibility` · `core-web-vitals` · `react-best-practices` · `web-design-guidelines` · `web-quality-audit` · `make-interfaces-feel-better` · `design-an-interface` · `userinterface-wiki`

### Testing & infra

`test` · `observability` · `github-workflows` · `api-design`

### Authoring (GSD itself)

`create-gsd-extension` · `create-mcp-server` · `create-skill` · `create-workflow` · `agent-browser` · `write-docs`

### When to invoke a skill

- Doing a code review? → `review` (or `security-review` for auth/network/parsing).
- About to merge / mark complete? → `verify-before-complete`.
- Writing or fixing tests? → `tdd` and/or `test`.
- Adding a new GSD extension or skill? → `create-gsd-extension`, `create-skill`.
- UI work? → `frontend-design` first; `accessibility` and `core-web-vitals` before shipping.
- Investigating a flaky test or bug? → `debug-like-expert`, `forensics`.
- Any work that must be picked up later? → `handoff` produces a clean baton.

---

## Project-scoped agents (`.gsd/agents/`)

Add repo-specific agents under `.gsd/agents/*.md`. They are auto-discovered (`src/resources/extensions/subagent/agents.ts:121`) and override user-scoped agents of the same name. The `.gsd/` directory is gitignored on this repo (per-developer state), so we keep two **template** project agents under `docs/dev/example-agents/` that you can copy into your own `.gsd/agents/`:

- `docs/dev/example-agents/extension-author.md` — knows the `ExtensionAPI` shape and the bundled extensions layout under `src/resources/extensions/`.
- `docs/dev/example-agents/adr-writer.md` — knows the ADR voice and template under `docs/dev/`.

```bash
mkdir -p .gsd/agents
cp docs/dev/example-agents/*.md .gsd/agents/
```

### Authoring a new project agent

1. Create `.gsd/agents/<name>.md` with frontmatter:

   ```yaml
   ---
   name: my-agent
   description: One-sentence purpose. Mention when to dispatch.
   tools: read, grep, find, ls, bash   # optional, restrict if you can
   model: sonnet                        # optional
   conflicts_with: other-agent          # optional, comma-separated
   ---
   ```

2. Body = system prompt. Be specific about output format. Look at `src/resources/agents/scout.md` and `src/resources/agents/planner.md` for canonical structure (Strategy → Output Format).
3. Restrict `tools` aggressively — fewer tools = tighter agent. Recon agents rarely need `write` or `edit`.
4. Declare `conflicts_with` if the agent writes to surfaces another agent also writes to.

---

## Working in this repo with Claude Code (or any external agent)

This repo is large (~1900+ TS files across `src/`, `packages/`, `extensions/`, `studio/`, `web/`, `vscode-extension/`, `native/`). Main-context grep/find will burn tokens fast.

- **Cross-package questions:** dispatch a subagent (Explore / scout) — never read 10+ files into the main window.
- **Architecture questions:** start at `docs/dev/` (ADRs and architecture docs), not source code. Specifically: `docs/dev/architecture.md`, `docs/dev/FILE-SYSTEM-MAP.md`, and the ADR series (`ADR-001` … `ADR-013`).
- **Plans staging:** active design docs live under `.plans/`. Read these before proposing an architectural change — someone may already be on it.
- **Verification:** the project's lint/test commands are wired through the `npm` scripts in `package.json`. Run them before declaring a task done. The `verify-before-complete` skill captures the full ritual.
- **Conventional commits required.** Branch types and commit format are defined in `CONTRIBUTING.md`. Hooks enforce this — do not bypass with `--no-verify`.

---

## Anti-patterns

Things to avoid when working in this repo:

- **Re-implementing what an agent already does.** If you find yourself writing recon or review logic in the main context, stop and dispatch.
- **Reading 10+ files into the main context.** Dispatch `scout`, get the compressed report, work from that.
- **Skipping `planner` for cross-package changes.** Even a 30-second plan call beats unwinding a half-built refactor.
- **Editing `src/resources/agents/*.md` to fix a one-off.** That ships to all users. Add a project-scope agent under `.gsd/agents/` instead.
- **Adding new agents without `conflicts_with` analysis.** If two of your agents can scribble on the same plan file, they need to be declared as conflicting.

---

## Pointers

- Subagent dispatch implementation: `src/resources/extensions/subagent/index.ts`
- Agent discovery: `src/resources/extensions/subagent/agents.ts`
- Bundled agents: `src/resources/agents/`
- Bundled skills: `src/resources/skills/`
- ADRs: `docs/dev/ADR-*.md`
- Architecture: `docs/dev/architecture.md`, `docs/dev/FILE-SYSTEM-MAP.md`
- Active plans: `.plans/`
- Contributor guide: `CONTRIBUTING.md`
- Vision: `VISION.md`
