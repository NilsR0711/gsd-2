# S04: Custom Workflow Engine + Run Manager + Loop Integration — Research

**Date:** 2026-03-21
**Depth:** Deep — high-risk integration slice touching the auto-loop hot path (phases.ts at 1281 lines), novel custom engine dispatch, run isolation, and the first real branching on `activeEngineId`

## Summary

S04 is the integration keystone: it creates `CustomWorkflowEngine`, `CustomExecutionPolicy`, and `run-manager.ts`, then wires custom engine dispatch through the real auto-loop pipeline by branching on `s.activeEngineId` in `phases.ts` and `loop.ts`. Prior slices built the interfaces (S01), proved dev engine transparency (S02), and created the data layer (S03). S04 makes the pipeline polymorphic — a custom YAML workflow actually dispatches steps through `runPreDispatch → runDispatch → runGuards → runUnitPhase → runFinalize`.

The core challenge is `phases.ts`. It's 1281 lines of dev-specific state management — milestone transitions, worktree lifecycle, stuck detection, dispatch hooks, artifact verification, post-unit processing (commits, doctor, state rebuild, DB dual-write, hooks, triage, quick-tasks). Custom engine steps must flow through `runUnitPhase` for the actual LLM dispatch (session create → prompt → await agent_end) but must skip most dev-specific finalization in `runFinalize` (no postUnitPreVerification with auto-commit/doctor/state-rebuild, no postUnitPostVerification with DB dual-write/hooks/triage). Instead, custom engine finalization calls `engine.reconcile()` to update GRAPH.yaml and `policy.verify()` (stub in S04, wired in S05).

The `run-manager.ts` module creates isolated run directories under `.gsd/workflow-runs/<name>/<timestamp>/` containing a frozen `DEFINITION.yaml` snapshot and an initialized `GRAPH.yaml`. This is straightforward filesystem work using patterns already in the codebase (atomic writes, temp dirs).

The `engine-resolver.ts` update to return `CustomWorkflowEngine`/`CustomExecutionPolicy` for non-dev engine IDs is trivial — the resolver already throws for unknown IDs, so it needs one more branch for `"custom"` (or any ID with an associated run directory).

## Recommendation

Build in three phases with verification gates between them:

1. **Run Manager + Custom Engine/Policy classes** (pure, testable, no loop integration) — `run-manager.ts` creates run directories, `custom-workflow-engine.ts` implements `WorkflowEngine` by reading GRAPH.yaml, `custom-execution-policy.ts` stubs `ExecutionPolicy`. Test these in isolation with temp directories.

2. **Engine resolver update + Session wiring** — extend `engine-resolver.ts` to return custom engine for non-dev IDs. Add `activeRunDir` property to `AutoSession`. Extend `auto.ts` with `setActiveRunDir()`/`getActiveRunDir()` exports.

3. **Loop integration** (highest risk) — branch in `autoLoop()` and `phases.ts` on `s.activeEngineId !== null && s.activeEngineId !== "dev"`. Custom path: skip `runPreDispatch` (no milestone management needed), skip `runDispatch` (engine.resolveDispatch does it), keep `runGuards` (budget/context), keep `runUnitPhase` (actual LLM dispatch), replace `runFinalize` with custom reconcile logic. This is the surgical integration point.

The loop integration approach should use a **parallel path in `autoLoop()`** rather than modifying each phase function. The `autoLoop` function in `auto/loop.ts` already has the sidecar path pattern (lines ~80-100) where sidecar items bypass `runPreDispatch` and `runDispatch` entirely. The custom engine path follows this exact pattern: bypass dev-specific pre-dispatch and dispatch, use the engine's own state derivation and dispatch resolution, then share `runGuards` and `runUnitPhase` with the dev path, and branch finalization.

## Implementation Landscape

### Key Files

**New files:**
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — `CustomWorkflowEngine` implementing `WorkflowEngine`. `deriveState()` reads GRAPH.yaml and returns engine state. `resolveDispatch()` calls `getNextPendingStep()` and returns dispatch/stop action. `reconcile()` calls `markStepComplete()` + `writeGraph()`. `getDisplayMetadata()` returns step N/M progress. Imports: `workflow-engine.ts`, `engine-types.ts`, `graph.ts`.
- `src/resources/extensions/gsd/custom-execution-policy.ts` — `CustomExecutionPolicy` implementing `ExecutionPolicy`. `verify()` returns `"continue"` (stub for S04, wired in S05). Other methods are stubs. Imports: `execution-policy.ts`, `engine-types.ts`.
- `src/resources/extensions/gsd/run-manager.ts` — `createRun(basePath, defName, overrides?)` and `listRuns(basePath, defName?)`. Creates `.gsd/workflow-runs/<name>/<timestamp>/` with frozen DEFINITION.yaml + initialized GRAPH.yaml + PARAMS.json (if overrides). Imports: `definition-loader.ts`, `graph.ts`, `node:fs`, `node:path`, `yaml`.
- `src/resources/extensions/gsd/tests/custom-workflow-engine.test.ts` — Integration tests for the full pipeline.

**Modified files:**
- `src/resources/extensions/gsd/engine-resolver.ts` — Add `"custom"` engine ID routing. Import `CustomWorkflowEngine`/`CustomExecutionPolicy`. The resolver needs the `runDir` to construct the custom engine — either pass it as context or resolve from session. Simplest: accept an optional `runDir` parameter on `resolveEngine()`.
- `src/resources/extensions/gsd/auto/session.ts` — Add `activeRunDir: string | null = null` property. Add to `reset()`. Add to `toJSON()`.
- `src/resources/extensions/gsd/auto/loop.ts` — Add custom engine dispatch path parallel to the sidecar path. When `s.activeEngineId` is set and not `"dev"`, resolve the engine, call `engine.deriveState()`, `engine.resolveDispatch()`, build `iterData` from the engine's dispatch action, then flow through shared `runGuards` → `runUnitPhase`. After `runUnitPhase`, call custom finalize (reconcile + verify) instead of `runFinalize`.
- `src/resources/extensions/gsd/auto/phases.ts` — Minimal changes. `runUnitPhase` needs a guard: skip worktree health check and `ensurePreconditions` for custom-step units. Skip zero-tool-call guard for custom-step units (custom engines don't have the same artifact expectations). `runFinalize` doesn't need modification — custom path bypasses it entirely.
- `src/resources/extensions/gsd/auto.ts` — Add `setActiveRunDir()`/`getActiveRunDir()` exports. Wire `activeRunDir` into session reset.
- `src/resources/extensions/gsd/auto-dashboard.ts` — Add `"custom-step"` case to `unitVerb()` and `unitPhaseLabel()` switch statements.

### Build Order

**Phase 1: Pure modules (no loop changes)**
1. `run-manager.ts` — creates run directories with frozen definitions and initialized graphs. Test with temp dirs. This is the simplest new module and produces artifacts that the custom engine reads.
2. `custom-workflow-engine.ts` — implements `WorkflowEngine` using `readGraph()`/`writeGraph()`/`getNextPendingStep()`/`markStepComplete()` from graph.ts. Test by creating a run directory with `createRun()`, then calling `deriveState()` → `resolveDispatch()` → `reconcile()` in sequence. Verify GRAPH.yaml transitions.
3. `custom-execution-policy.ts` — stub implementation. Trivial.
4. Contract + unit tests for all three.

**Phase 2: Wiring (moderate risk)**
5. `engine-resolver.ts` update — add custom engine branch.
6. `auto/session.ts` — add `activeRunDir`.
7. `auto.ts` — add `setActiveRunDir()`/`getActiveRunDir()`.
8. `auto-dashboard.ts` — add `custom-step` unit type rendering.

**Phase 3: Loop integration (highest risk)**
9. `auto/loop.ts` — custom engine dispatch path.
10. `auto/phases.ts` — guards for custom-step in `runUnitPhase`.
11. Integration test — dispatch a 3-step workflow through the real loop (mocked LoopDeps).

### Verification Approach

**Unit tests (Phase 1):**
```bash
# Run custom engine tests
node --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-workflow-engine.test.ts
```

- `createRun()` creates directory structure with DEFINITION.yaml, GRAPH.yaml
- `createRun()` with overrides writes PARAMS.json
- `createRun()` with unknown definition throws
- `listRuns()` returns run metadata
- `CustomWorkflowEngine.deriveState()` reads GRAPH.yaml and returns correct phase/step counts
- `CustomWorkflowEngine.resolveDispatch()` returns dispatch for first pending step
- `CustomWorkflowEngine.resolveDispatch()` returns stop when all complete
- `CustomWorkflowEngine.reconcile()` marks step complete in GRAPH.yaml
- `CustomExecutionPolicy.verify()` returns `"continue"`

**Integration test (Phase 3):**
- Build a mock LoopDeps that stubs everything except the functions custom engine actually uses
- Set `s.activeEngineId = "custom"` and `s.activeRunDir` to a temp run directory
- Start `autoLoop()` with a 3-step definition (A → B → C in dependency order)
- Mock `runUnit` to immediately resolve each step
- Verify GRAPH.yaml shows all 3 steps as "complete" after the loop exits
- Verify the loop dispatched exactly 3 iterations

**Regression (mandatory):**
```bash
# All existing auto-mode tests must pass unchanged
node --experimental-strip-types --test src/resources/extensions/gsd/tests/*.test.ts
```

**GRAPH.yaml I/O benchmarking:**
- Time `readGraph()` + `writeGraph()` for a 10-step, 20-step, and 50-step workflow
- Must be <5ms per iteration (YAML serialization of small documents is typically <1ms)

## Constraints

- **R017 (test parity)**: All existing auto-mode tests must pass unchanged. Loop integration changes in `auto/loop.ts` and `auto/phases.ts` are guarded by `s.activeEngineId` checks — dev path is untouched.
- **`AutoSession` encapsulation invariant**: `auto-session-encapsulation.test.ts` enforces no module-level `let`/`var` in `auto.ts`. New `activeRunDir` state must be a property on `AutoSession`, not a module variable.
- **Run directory convention**: `.gsd/workflow-runs/<name>/<timestamp>/` with `DEFINITION.yaml`, `GRAPH.yaml`, and optional `PARAMS.json`. Timestamp format: ISO-like slug (e.g., `2026-03-21T14-30-00`).
- **Import `.js` extension**: ESM convention — all relative imports use `.js` suffix.
- **`custom-step` unit type**: The custom engine dispatches steps with `unitType: "custom-step"` and `unitId: "<runName>/<stepId>"`. The dashboard, stuck detection, and artifact verification all key on `unitType`.
- **Leaf-node rules**: `engine-types.ts` remains zero-import. `custom-workflow-engine.ts` imports `graph.ts`, `definition-loader.ts` (data modules), and `engine-types.ts` + `workflow-engine.ts` (interfaces). This is correct.
- **LoopDeps immutability**: `buildLoopDeps()` in `auto.ts` returns the deps object. Adding new deps for the custom engine path would require extending `LoopDeps` interface. Prefer NOT extending LoopDeps — instead, resolve the engine inside `autoLoop()` and call engine methods directly, using only existing LoopDeps for shared concerns (budget, model selection, unit supervision).

## Common Pitfalls

- **`runPreDispatch` dev-specific terminal conditions** — `runPreDispatch` checks for milestone completion, milestone transitions, worktree lifecycle. If the custom engine path calls `runPreDispatch`, it will fail because `deps.deriveState()` returns GSD state (milestones/slices/tasks), not custom engine state. Solution: **skip `runPreDispatch` entirely** for custom engines. The custom engine's `deriveState()` handles its own terminal conditions.
- **`runFinalize` dev-specific post-unit processing** — `postUnitPreVerification` does auto-commit, doctor run, state rebuild. `postUnitPostVerification` does DB dual-write, hooks, triage, quick-tasks. Custom engine steps should skip ALL of this. Solution: **bypass `runFinalize`** for custom engine path and call `engine.reconcile()` + `policy.verify()` directly.
- **`runUnitPhase` worktree health check** — The `if (unitType === "execute-task")` guard in `runUnitPhase` checks for `.git` and project files. Custom-step units should skip this guard entirely. The guard already checks `unitType === "execute-task"` so custom-step naturally bypasses it.
- **`runUnitPhase` zero-tool-call guard** — Same pattern: guarded by `if (unitType === "execute-task")`. Custom-step bypasses naturally.
- **`runUnitPhase` artifact verification** — `verifyExpectedArtifact(unitType, unitId, basePath)` is called for non-hook units. For custom-step, this will return `false` (no expected artifact path registered). The custom engine manages its own artifact expectations. Solution: treat custom-step like hook units — `isHookUnit` check should include `unitType === "custom-step"` or the custom path should handle completedUnits differently.
- **Engine resolution needs runDir** — `resolveEngine()` currently takes `{ activeEngineId }`. The custom engine constructor needs `runDir` to know where to read GRAPH.yaml. Options: (a) pass `runDir` into `resolveEngine()`, (b) make `CustomWorkflowEngine` accept `runDir` in constructor and have the resolver pull it from session. Option (b) is cleaner — `resolveEngine({ activeEngineId, activeRunDir })`.
- **GRAPH.yaml write timing** — `engine.reconcile()` writes GRAPH.yaml. This must happen AFTER unit closeout (metrics, activity log) but BEFORE the next iteration's `deriveState()`. The loop naturally handles this since reconcile runs in the finalize position.
- **Session `activeEngineId` already exists** — `AutoSession` already has `activeEngineId: string | null = null` (added in S02). Only `activeRunDir` needs to be added.

## Open Risks

- **Integration test fidelity** — The integration test mocks `runUnit` (it can't actually create LLM sessions in a test). The mock must faithfully simulate what `runUnit` does: create a session, send a prompt, await agent_end. The mock should verify the prompt content matches the step's prompt from GRAPH.yaml.
- **Stuck detection with custom-step** — The sliding-window stuck detector in `runDispatch` tracks `derivedKey = unitType/unitId`. For custom-step, the unitId changes each iteration (different step IDs), so stuck detection should work correctly (progress is detected). However, if a custom step fails and retries, the same key would appear twice — stuck detection would fire. The custom engine path skips `runDispatch` entirely (engine does its own dispatch), so this is a non-issue unless stuck detection is also added to the custom finalize path.
- **`completedUnits` tracking** — `runUnitPhase` pushes to `s.completedUnits` and writes `completed-units.json`. For custom-step, the engine tracks completions in GRAPH.yaml. Double-tracking is acceptable for S04 (the session's `completedUnits` gives the loop progress insight even for custom workflows). If this causes issues, the custom finalize path can skip the session-level tracking.
- **Budget/context guards** — `runGuards` checks budget ceiling and context window. These apply equally to custom workflows (LLM calls cost money regardless of engine). The custom path MUST flow through `runGuards`. This is already handled by the proposed architecture: custom path calls `runGuards` between dispatch and unit execution.

## Skills Discovered

No additional skills needed. This slice is pure TypeScript integration work within the existing GSD codebase. The `yaml` package is already in dependencies. Node `node:test` and `node:assert/strict` are the test framework.
