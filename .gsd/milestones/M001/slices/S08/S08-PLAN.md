# S08: Workflow Creator Skill + Bundled Examples

**Goal:** The `create-workflow` skill guides users conversationally through defining YAML workflow definitions, and 3 bundled example definitions demonstrate context chaining, verification, parameters, and iterate.
**Demo:** `/skill create-workflow` loads a router-pattern skill that asks intent and routes to the appropriate workflow; bundled examples in `src/resources/skills/create-workflow/templates/` pass `validateDefinition()` from `definition-loader.ts`.

## Must-Haves

- `create-workflow` skill follows the router pattern (SKILL.md + workflows/ + references/ + templates/)
- SKILL.md under 500 lines with YAML frontmatter and pure XML structure (no markdown headings)
- Two workflows: `create-from-scratch.md` (conversational step-by-step) and `create-from-template.md` (customize from example)
- Three reference files: V1 schema reference, verification policies, feature patterns (context_from, iterate, params)
- Blank `workflow-definition.yaml` scaffold template
- Three bundled example YAMLs demonstrating: linear chain + params, iterate + shell-command, diamond deps + human-review
- All 3 example YAMLs pass `validateDefinition()` with zero errors
- Validation test file proves examples are schema-valid

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/bundled-workflow-defs.test.ts` — all tests pass
- `test -f src/resources/skills/create-workflow/SKILL.md` — skill entry point exists
- `find src/resources/skills/create-workflow -type f | wc -l` returns >= 10 (SKILL.md + 2 workflows + 3 references + 1 scaffold + 3 examples)

## Tasks

- [ ] **T01: Create the create-workflow skill with references and workflows** `est:25m`
  - Why: The skill is the primary deliverable — it's what users invoke via `/skill create-workflow` or what `/gsd workflow new` points to. The reference files encode the complete V1 schema knowledge that the skill needs to guide definition authoring.
  - Files: `src/resources/skills/create-workflow/SKILL.md`, `src/resources/skills/create-workflow/workflows/create-from-scratch.md`, `src/resources/skills/create-workflow/workflows/create-from-template.md`, `src/resources/skills/create-workflow/references/yaml-schema-v1.md`, `src/resources/skills/create-workflow/references/verification-policies.md`, `src/resources/skills/create-workflow/references/feature-patterns.md`, `src/resources/skills/create-workflow/templates/workflow-definition.yaml`
  - Do: Create the full router-pattern skill. SKILL.md has YAML frontmatter (`name: create-workflow`), `<essential_principles>` with V1 schema basics, `<routing>` for intent detection, and `<reference_index>`. Workflow files guide the conversational flow. Reference files extract schema facts from `definition-loader.ts`. The blank scaffold template has all fields with comments.
  - Verify: `test -f src/resources/skills/create-workflow/SKILL.md && head -3 src/resources/skills/create-workflow/SKILL.md | grep -q 'name: create-workflow'`
  - Done when: SKILL.md parses valid YAML frontmatter, uses XML tags (no markdown headings), is under 500 lines; all 7 files exist and are non-empty

- [ ] **T02: Write bundled example YAMLs and validation test** `est:20m`
  - Why: The examples serve double duty — they're reference material for users learning the YAML format, and they prove the skill's guidance produces valid definitions. The test is the slice's mechanical verification.
  - Files: `src/resources/skills/create-workflow/templates/blog-post-pipeline.yaml`, `src/resources/skills/create-workflow/templates/code-audit.yaml`, `src/resources/skills/create-workflow/templates/release-checklist.yaml`, `src/resources/extensions/gsd/tests/bundled-workflow-defs.test.ts`
  - Do: Write 3 YAML definitions exercising different features. `blog-post-pipeline` — 3 linear steps with `context_from`, `content-heuristic` verify, `params` (topic, audience). `code-audit` — 3 steps with `iterate` on inventory, `shell-command` verify. `release-checklist` — 4 steps with diamond dependency, `human-review` verify. The test file uses `node:test` + `node:assert/strict`, reads each YAML via `readFileSync`, parses with `yaml.parse()`, and asserts `validateDefinition()` returns `{ valid: true }`.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/bundled-workflow-defs.test.ts`
  - Done when: All 3 YAML files pass `validateDefinition()` with zero errors; test file runs green

## Files Likely Touched

- `src/resources/skills/create-workflow/SKILL.md`
- `src/resources/skills/create-workflow/workflows/create-from-scratch.md`
- `src/resources/skills/create-workflow/workflows/create-from-template.md`
- `src/resources/skills/create-workflow/references/yaml-schema-v1.md`
- `src/resources/skills/create-workflow/references/verification-policies.md`
- `src/resources/skills/create-workflow/references/feature-patterns.md`
- `src/resources/skills/create-workflow/templates/workflow-definition.yaml`
- `src/resources/skills/create-workflow/templates/blog-post-pipeline.yaml`
- `src/resources/skills/create-workflow/templates/code-audit.yaml`
- `src/resources/skills/create-workflow/templates/release-checklist.yaml`
- `src/resources/extensions/gsd/tests/bundled-workflow-defs.test.ts`
