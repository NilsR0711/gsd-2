# Example project agents

These are **templates** for project-scoped GSD subagents. The actual project-agent location (`.gsd/agents/`) is gitignored in this repo, so the templates live here under version control. Copy whichever you want into your own `.gsd/agents/`:

```bash
mkdir -p .gsd/agents
cp docs/dev/example-agents/extension-author.md .gsd/agents/
cp docs/dev/example-agents/adr-writer.md       .gsd/agents/
```

Once copied, GSD's subagent extension auto-discovers them at the project scope and they will appear in `subagent` dispatch. Project-scoped agents override user-scoped agents of the same name.

## What's in here

| File                  | Purpose                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `extension-author.md` | Author/modify GSD extensions under `src/resources/extensions/` — knows `ExtensionAPI` shape.  |
| `adr-writer.md`       | Draft Architecture Decision Records for `docs/dev/` — knows ADR voice, file naming, template. |

## Authoring your own

See [`docs/AGENTS.md`](../../AGENTS.md) for the dispatch rules, frontmatter schema, and `conflicts_with` semantics. Match the structure of the existing examples: focused `description`, restricted `tools` allowlist, system prompt with explicit Output Format.
