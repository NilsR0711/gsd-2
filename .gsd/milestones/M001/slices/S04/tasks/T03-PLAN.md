---
estimated_steps: 5
estimated_files: 3
skills_used: []
---

# T03: Integrate custom engine dispatch path into autoLoop

**Slice:** S04 — Custom Workflow Engine + Run Manager + Loop Integration
**Milestone:** M001

## Description

The highest-risk change in S04: make `autoLoop()` polymorphic by adding a custom engine dispatch path. When `s.activeEngineId` is set to a non-dev value and `s.activeRunDir` is set, the loop resolves the custom engine, derives state, resolves dispatch, and flows through the shared `runGuards` → `runUnitPhase` phases. After unit execution, it calls `engine.reconcile()` + `policy.verify()` directly instead of `runFinalize()`.

The custom engine path parallels the existing sidecar path pattern already in `autoLoop()` — sidecar items bypass `runPreDispatch` and `runDispatch` and build `iterData` directly. The custom engine path does the same: bypass dev-specific pre-dispatch and dispatch, use engine's own state derivation and dispatch resolution.

Key integration points:
- `auto/loop.ts`: New conditional branch before sidecar check — if `s.activeEngineId` is non-null and not `"dev"`, take the custom engine path
- `auto/phases.ts`: Minimal change — in the artifact verification section of `runUnitPhase`, treat `"custom-step"` like hook units (skip `verifyExpectedArtifact`, add to `completedUnits` unconditionally)
- Integration test: Create a 3-step workflow (A → B → C with deps), mock LoopDeps to stub everything except the functions the custom path needs, verify GRAPH.yaml shows all 3 steps complete after loop exits

## Steps

1. Modify `src/resources/extensions/gsd/auto/loop.ts` to add the custom engine dispatch path:
   - Import `resolveEngine` from `../engine-resolver.js`.
   - After the session lock validation block and before the sidecar check, add: if `s.activeEngineId != null && s.activeEngineId !== "dev"` AND no `sidecarItem`, take the custom engine path.
   - Custom engine path:
     a. Call `resolveEngine({ activeEngineId: s.activeEngineId, activeRunDir: s.activeRunDir })` to get `{ engine, policy }`.
     b. Call `engine.deriveState(s.basePath)` to get engine state.
     c. If `engineState.isComplete`, call `deps.stopAuto(ctx, pi, "Workflow complete")` and break.
     d. Call `engine.resolveDispatch(engineState, { basePath: s.basePath })`.
     e. If dispatch action is `"stop"`, call `deps.stopAuto()` and break.
     f. If dispatch action is `"skip"`, continue.
     g. If dispatch action is `"dispatch"`, call `deps.deriveState(s.basePath)` to get a `GSDState` for shared phases (same pattern as sidecar path). Build `iterData: IterationData` with: `unitType: step.unitType`, `unitId: step.unitId`, `prompt: step.prompt`, `finalPrompt: step.prompt`, `pauseAfterUatDispatch: false`, `observabilityIssues: []`, `state: gsdState`, `mid: s.currentMilestoneId ?? "workflow"`, `midTitle: "Workflow"`, `isRetry: false`, `previousTier: undefined`.
     h. Call `runGuards(ic, s.currentMilestoneId ?? "workflow")` — budget/context guards still apply.
     i. If guards break, break.
     j. Call `runUnitPhase(ic, iterData, loopState)`.
     k. If unitPhase breaks, break.
     l. After unit phase: call `engine.reconcile(engineState, { unitType: iterData.unitType, unitId: iterData.unitId, startedAt: s.currentUnit?.startedAt ?? Date.now(), finishedAt: Date.now() })`.
     m. Call `policy.verify(iterData.unitType, iterData.unitId, { basePath: s.basePath })`.
     n. If verify returns `"pause"`, call `deps.pauseAuto()` and break.
     o. Clear unit timeout via `deps.clearUnitTimeout()`.
     p. Reset `consecutiveErrors = 0` and continue.
   - The normal dev path (existing code) goes into an `else` block — no changes to dev path logic.

2. Modify `src/resources/extensions/gsd/auto/phases.ts` — `runUnitPhase()` artifact verification:
   - Find the `isHookUnit` check near line 1137: `const isHookUnit = unitType.startsWith("hook/");`
   - Change to: `const isHookUnit = unitType.startsWith("hook/") || unitType === "custom-step";`
   - This makes custom-step units skip `verifyExpectedArtifact()` and add to `completedUnits` unconditionally, matching hook unit behavior. The custom engine manages its own artifact expectations via GRAPH.yaml.

3. Write `src/resources/extensions/gsd/tests/custom-engine-loop-integration.test.ts`:
   - Create a test definition YAML with 3 steps: `step-a` (no deps), `step-b` (requires step-a), `step-c` (requires step-b).
   - Use `createRun()` from `run-manager.ts` to create a real run directory in a temp folder.
   - Build a mock `AutoSession` with `activeEngineId: "custom"` and `activeRunDir` pointing to the run dir.
   - Build a mock `LoopDeps` that stubs everything the custom path needs:
     - `stopAuto`: sets `s.active = false`
     - `pauseAuto`: sets `s.active = false`
     - `lockBase`: returns temp dir path
     - `validateSessionLock`: returns `{ valid: true }`
     - `clearUnitTimeout`: no-op
     - `closeoutUnit`: no-op
     - `buildSnapshotOpts`: returns `{}`
     - `existsSync`: delegates to real `existsSync`
     - `loadEffectiveGSDPreferences`: returns `undefined`
     - `emitJournalEvent`: no-op
     - `invalidateAllCaches`: no-op
     - `checkResourcesStale`: returns `null`
     - `handleLostSessionLock`: no-op
     - `writeLock`: no-op
     - `updateSessionLock`: no-op
     - `getSessionFile`: returns `""`
     - `captureAvailableSkills`: no-op
     - `writeUnitRuntimeRecord`: no-op
     - `clearUnitRuntimeRecord`: no-op
     - `updateProgressWidget`: no-op
     - `recordOutcome`: no-op
     - `updateSliceProgressCache`: no-op
     - `ensurePreconditions`: no-op
     - `reorderForCaching`: returns prompt unchanged
     - `isDbAvailable`: returns `false`
     - `atomicWriteSync`: delegates to real write
     - `deriveState`: returns minimal GSD state (needed by `runGuards`)
     - `selectAndApplyModel`: returns `{ routing: null }`
     - `resolveModelId`: returns `undefined`
     - `startUnitSupervision`: no-op
     - `getLedger`: returns `null`
     - `getDeepDiagnostic`: returns `null`
     - `collectObservabilityWarnings`: returns `[]`
     - `buildObservabilityRepairBlock`: returns `null`
   - Mock `runUnit` in `auto/run-unit.ts` to immediately resolve with `{ status: "completed" }` — the test doesn't create real LLM sessions.
   - Set `s.active = true` and a mock `s.cmdCtx` with `newSession()` and `getContextUsage()`.
   - Call `autoLoop(ctx, pi, s, deps)`.
   - After loop exits, read GRAPH.yaml from the run directory and verify all 3 steps have status `"complete"`.
   - Verify the loop dispatched exactly 3 iterations (track via a counter in the mocked `runUnit` or `emitJournalEvent`).

4. Verify all existing auto-loop tests pass unchanged:
   - Run: `node --experimental-strip-types --test src/resources/extensions/gsd/tests/auto-loop.test.ts`
   - The dev path is untouched — all existing tests should pass.

5. Run GRAPH.yaml I/O benchmark (informational, not gating):
   - Time `readGraph()` + `writeGraph()` in a loop for 10, 20, 50 step workflows.
   - Should be <5ms per iteration. Log results but don't fail if slightly over.

## Must-Haves

- [ ] Custom engine path in `autoLoop()` skips `runPreDispatch` and `runDispatch`
- [ ] Custom engine path uses `runGuards` and `runUnitPhase` (shared with dev path)
- [ ] Custom engine path calls `engine.reconcile()` + `policy.verify()` instead of `runFinalize`
- [ ] `custom-step` unit type in `runUnitPhase` skips `verifyExpectedArtifact` (treated like hooks)
- [ ] Integration test dispatches 3-step workflow through autoLoop and all steps complete
- [ ] All existing auto-loop tests pass unchanged (dev path regression check)

## Verification

- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-engine-loop-integration.test.ts` — integration test passes
- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/auto-loop.test.ts` — existing tests pass

## Observability Impact

- Signals added/changed: `debugLog("autoLoop", { phase: "custom-engine-derive" })`, `debugLog("autoLoop", { phase: "custom-engine-dispatch" })`, `debugLog("autoLoop", { phase: "custom-engine-reconcile" })` trace entries in the custom path
- How a future agent inspects this: read GRAPH.yaml in the run directory to see step statuses; grep debug logs for `custom-engine-*` phase entries
- Failure state exposed: GRAPH.yaml shows which step has status `"active"` when a failure occurred; engine state in session `toJSON()` includes `activeRunDir`

## Inputs

- `src/resources/extensions/gsd/auto/loop.ts` — main loop to extend with custom engine path
- `src/resources/extensions/gsd/auto/phases.ts` — runUnitPhase to handle custom-step artifact verification
- `src/resources/extensions/gsd/engine-resolver.ts` — T02 output, resolver with custom engine branch
- `src/resources/extensions/gsd/auto/session.ts` — T02 output, session with activeRunDir
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — T01 output, custom engine implementation
- `src/resources/extensions/gsd/custom-execution-policy.ts` — T01 output, stub policy
- `src/resources/extensions/gsd/run-manager.ts` — T01 output, for creating test run directories
- `src/resources/extensions/gsd/graph.ts` — readGraph for test verification

## Expected Output

- `src/resources/extensions/gsd/auto/loop.ts` — extended with custom engine dispatch path
- `src/resources/extensions/gsd/auto/phases.ts` — custom-step treated like hooks in artifact verification
- `src/resources/extensions/gsd/tests/custom-engine-loop-integration.test.ts` — integration test proving 3-step dispatch
