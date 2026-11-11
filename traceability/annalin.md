# Traceability: Anna Lin (annalin)

**Team:** Seg Fault

**Target feature:** OpenCode Permission Rules. The declared P3 module is implemented in [`packages/opencode/src/permission/index.ts`](../packages/opencode/src/permission/index.ts), with matching in [`packages/core/src/util/wildcard.ts`](../packages/core/src/util/wildcard.ts). The latter is the current location of the wildcard utility identified in P3. These tests target this permission API, not the separate V2 API in `packages/core/src/permission.ts`.

## Requirements

In this table, an **effective rule** is the last matching rule in the ordered rulesets, including any applicable session approvals. Tests use fresh permission state with no remembered approvals. Config examples are nested under `bash`, for example `{ bash: { "rm *": "deny" } }`.

| ID  | Interview evidence                                                                                                                                                                                               | Requirement                                                                                                                                                                                                                                  | Acceptance Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                               | Changed in P4? | Property (kind)                                                                        | Test                                                                                                                                                          | Mutants it kills |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| R1  | S-4: “No, it should not run unless you explicitly say later that it is okay to run.” O-6: “If it’s deleting files or changing important code, I wouldn’t want it doing that without my permission.”              | When a command's effective permission rule is deny, OpenCode must prevent the command from executing.                                                                                                                                        | Given `{"rm *": "deny"}` with no later matching override, `rm file.txt` is denied. For every generated deletion target, a request containing that command fails with `DeniedError`, never reaches the execution continuation, and leaves no approval request pending, regardless of its position among allowed commands.                                                                                                                                          | Yes            | A denial anywhere in a command batch prevents the execution continuation (invariant).  | [`annalin.property.test.ts`](../packages/opencode/test/permission/annalin.property.test.ts), `R1: effective deny blocks the execution continuation`           | H1, H5           |
| R2  | S-2: “I have had to approve and reject commands that Claude Code wanted to run.” S-16: “I would probably remember whether I had allowed the command to run or not.”                                              | When a command matches an ask rule, OpenCode must request user approval before executing it.                                                                                                                                                 | Given `{"git push": "ask"}`, attempting `git push` waits for approval. Generalized: for generated commands governed by an effective `git push *` ask rule, the request appears in the pending list, the permission operation remains unfinished, and its execution continuation is blocked. An approving `once` or `always` reply permits continuation; `reject` fails with `RejectedError` and prevents continuation. Each reply removes the pending request.    | No             | Approval is required before the execution continuation can run (invariant).            | [`annalin.property.test.ts`](../packages/opencode/test/permission/annalin.property.test.ts), `R2: ask waits for approval and rejection prevents continuation` | H2, H3, H5       |
| R3  | S-10: “Changing the setting from ‘allow’ to ‘deny’ and back to ‘allow’ should produce the same result as simply setting it to ‘allow.’” O-10: “It’s the same setting as before, so it should work the same way.” | Restoring a previous permission setting must restore the original permission behavior.                                                                                                                                                       | Given `{"git push": "allow"}`, changing to deny and back to allow results in allow again. For every generated command, original action, and sequence of intermediate actions, restoring the original config action restores the original evaluated rule. Intermediate settings take effect and the unrelated edit rule stays denied. Evaluation uses the same command and unchanged session context; restoring config does not retry a previously denied command. | No             | Change a setting and restore it, then compare with its original decision (round-trip). | [`annalin.property.test.ts`](../packages/opencode/test/permission/annalin.property.test.ts), `R3: restoring a setting restores the original decision`         | H4, H5           |
| R4  | S-12: “I would expect it to never delete any file, even if the filename changes.” O-12: “It shouldn’t matter what the file is called. If deleting files is blocked, it should block all of them.”                | Commands governed by the same effective permission pattern must receive the same permission decision. In particular, changing a deletion target from one file or folder to another must preserve denial under an effective `rm *` deny rule. | Given `{"rm *": "deny"}`, both `rm file.txt` and `rm folder/file.txt` are denied. For independently generated targets, changing `rm <first>` to `rm <second>` or `rm -r <second>/` preserves the same deny decision, with no later matching override.                                                                                                                                                                                                             | Yes            | Renaming a deletion target or changing it to a folder preserves denial (metamorphic).  | [`annalin.property.test.ts`](../packages/opencode/test/permission/annalin.property.test.ts), `R4: changing a deletion target preserves denial under rm *`     | H5               |
| R5  | O-18: “Maybe a history of the commands it ran and whether they were allowed or denied, so I could check what happened.”                                                                                          | OpenCode must provide users with a record of permission decisions so they can verify which commands were allowed or denied.                                                                                                                  | Given `rm file.txt` matching a deny rule, OpenCode records the command and its denied status in an action log that the user can review.                                                                                                                                                                                                                                                                                                                           | No             | Not selected for property testing in P4.                                               | None; implementation is not claimed by this submission.                                                                                                       | Not tested       |

Properties written or suggested by opencode or another AI tool: **R1, R2, R3, and R4**, including generators, were written with Codex assistance. The traceability review and CI step were also prepared with Codex assistance.

## Requirement changes

| ID  | Original requirement (P3)                                                                | Revised requirement                                                                                                                                                                                                                          | Why it changed                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | When a command matches a deny rule, OpenCode must prevent the command from executing.    | When a command's effective permission rule is deny, OpenCode must prevent the command from executing.                                                                                                                                        | The original wording is ambiguous when rules overlap: it would make any earlier deny impossible to override, conflicting with the user's ability to explicitly allow an action later (S-4). The permission evaluator uses the last matching rule. The revision makes the precedence checkable while preserving the need to prevent execution when the user's effective decision is deny. |
| R4  | Commands matching the same permission pattern must receive the same permission decision. | Commands governed by the same effective permission pattern must receive the same permission decision. In particular, changing a deletion target from one file or folder to another must preserve denial under an effective `rm *` deny rule. | Two commands can match the same broad pattern while only one matches a later exception. The original wording would conflict with ordered overrides. The revision makes the unchanged-rule condition explicit and retains the interviewees' expectation that filenames alone do not bypass a general deletion block.                                                                      |

R2 is feasible and checkable through the pending request, approval reply, and blocked execution continuation; its acceptance criteria use the effective-rule interpretation defined above. R3 is feasible and checkable by restoring the configuration and evaluating it in the same context. R5 is also feasible and its command/status example is checkable, so it is kept rather than replaced with a weaker requirement about internal logging. R5 is not established by these tests: the current permission module logs evaluation internally, but that alone does not prove there is a user-reviewable action history.

## Generator choices and test scope

- Shared targets combine known boundaries with generated paths: nested files, folder suffixes, spaces, Windows separators, Unicode, regex metacharacters, and long names. Inputs are strings passed to the real permission implementation; the tests never run generated shell commands.
- R1 varies earlier fallback actions and the denied command's position among allowed commands. It tests the actual permission service and an execution continuation after that service, rather than only asserting an evaluator return value.
- R2 generates batches of one to four push commands, earlier fallback actions, and approving or rejecting replies. It waits for observable pending state, checks that the operation remains unfinished, replies, and checks its completion and cleanup. `always` has an empty save list to avoid remembered approvals leaking between generated cases.
- R3 generates all three permission actions and sequences of intermediate changes. It explicitly includes the original allow → deny → allow example. R4 generates independent old/new targets and checks both file and recursive-folder forms against the real evaluator.
- Each property uses 100 generated cases per run; R3 additionally runs its explicit example. These are permission-module tests, not an end-to-end proof that every shell tool integration enforces the permission gate.

## Run, triage, and fix

Local validation on November 4, 2026:

- `bun test test/permission --timeout 30000` from `packages/opencode`: **110 passed, 0 failed**, including all four new properties, in about 21 seconds.
- `bun typecheck` from `packages/opencode`: passed.
- The first property run also passed all four properties. No shrunk counterexample, production code fix, or failure-driven requirement change was needed. R1 and R4 were clarified during the initial review of rule precedence.

The local runtime was Bun 1.4.2; the repository's CI pins Bun 1.3.14. No passing GitHub Actions run is claimed until this branch is pushed and the PR checks complete.

## CI and submission

`opencode#test` is already included in `turbo.json`. The package test script uses `--only-failures`, so the test workflow also runs this property file explicitly in **Run annalin permission properties**, making the four passing test names visible in the Actions log.

The individual branch is `annalin-properties`, based on `main` including the team's fast-check dependency and 20-minute unit-test step. The PR must target `main` and stay open for the next project. A teammate review, a passing PR test run, and final-commit permalinks are still required before submission.

## Hand-written mutants

These predictions were prepared with Codex assistance before running the mutants.

| ID | Requirement targeted | Planned change | Predicted killer | Actual result |
|---|---|---|---|---|
| H1 | R1: effective denial blocks execution | In `Permission.ask`, mistakenly treat a matched deny rule like allow and continue processing instead of returning `DeniedError`. | R1 should kill it: the denied request would reach the execution continuation instead of failing. | Killed by R1: 1 failed, 3 passed. Shrunk counterexample `["a", "allow", 0, 0]`. |
| H2 | R2: ask waits for approval | Publish the approval request, but return immediately instead of waiting for the user's reply. | R2 should kill it: the operation would finish and the execution continuation could run before approval. | Killed by R2: 1 failed, 3 passed. Shrunk counterexample `[[""], "once", "allow"]`. |
| H3 | R2: rejection prevents execution | In the reject-reply branch, complete the pending request successfully instead of failing it with `RejectedError`. | R2 should kill it: a rejected request would succeed and reach the execution continuation. | Killed by R2: 1 failed, 3 passed. Counterexample `[[""], "reject", "allow"]`. |
| H4 | R3: restoring a setting restores behavior | In `fromConfig`, incorrectly convert an explicit nested `allow` action to `ask`. | R3 should kill it: restoring an allow setting would produce ask instead of allow. | Killed by R3: 1 failed, 3 passed. Shrunk counterexample `["", "allow", ["allow"]]`. |
| H5 | R4: changing a deletion target preserves denial | In wildcard matching, make `*` match only characters within one path segment instead of allowing `/`. | R4 should kill it: a broad `rm *` deny pattern would stop covering nested paths and folder commands consistently. R1 may also kill it. | Killed by R1, R2, R3, and R4: 4 failed, 0 passed. |

### H1 evidence

Applied and tested H1 after the predictions were committed in `79a817f`. The unmodified property file passed all four tests before mutation. With H1 applied, R1 failed because the denied `rm a` request completed successfully instead of failing; R2–R4 passed. The observed fast-check seed was `-1995325114`, with shrink path `0:0:0:0:0`.

- Patch: [H1.patch](../mutants/annalin/H1.patch)
- Original-code run: [H1-baseline.log](../mutants/annalin/H1-baseline.log)
- Mutant run: [H1-mutant.log](../mutants/annalin/H1-mutant.log)

The correct permission source was restored after this experiment. H1 is a deliberate test fault, not a production fix.

### H2 evidence

The unmodified property file passed all four tests before mutation. H2 kept publication of the approval request but returned immediately instead of awaiting the reply, so the execution continuation could run before approval and the published request remained pending because the removed `Effect.ensuring` no longer cleaned it up. R2 killed the mutant; during shrinking, the stale pending request caused the first recorded assertion failure when its patterns did not equal the current generated `git push` pattern. R1, R3, and R4 passed. The observed fast-check seed was `-375882976`, with shrink path `0:0:0:0` and shrunk counterexample `[[""], "once", "allow"]`.

- Patch: [H2.patch](../mutants/annalin/H2.patch)
- Original-code run: [H2-baseline.log](../mutants/annalin/H2-baseline.log)
- Mutant run: [H2-mutant.log](../mutants/annalin/H2-mutant.log)

The correct permission source was restored after this experiment, and all four properties passed again. H2 is a deliberate test fault, not a production fix.

### H3 evidence

The unmodified property file passed all four tests before mutation. H3 completed the pending request successfully in the reject-reply branch, so the rejected permission operation succeeded and reached its execution continuation instead of failing with `RejectedError`. R2, `R2: ask waits for approval and rejection prevents continuation`, killed the mutant at `expect(Exit.isSuccess(result)).toBe(reply !== "reject")`: for the generated `reject` reply, the assertion expected `false` but received `true`. R1, R3, and R4 passed. The observed fast-check seed was `-56665618`, with shrink path `1`, counterexample `[[""], "reject", "allow"]`, and no shrinking.

- Patch: [H3.patch](../mutants/annalin/H3.patch)
- Original-code run: [H3-baseline.log](../mutants/annalin/H3-baseline.log)
- Mutant run: [H3-mutant.log](../mutants/annalin/H3-mutant.log)

The correct permission source was restored after this experiment, and all four properties passed again. H3 is a deliberate test fault, not a production fix.

### H4 evidence

The unmodified property file passed all four tests before mutation. H4 changed only explicit nested `allow` config actions to `ask`; top-level string actions and nested `deny` and `ask` actions were unchanged. R3, `R3: restoring a setting restores the original decision`, killed the mutant at `expect(Permission.evaluate("bash", command, current).action).toBe(setting)`: for the generated `allow` setting, the mutant produced `ask` instead of the expected `allow`. R1, R2, and R4 passed. The observed fast-check seed was `1585151781`, with shrink path `0:0`, shrunk counterexample `["", "allow", ["allow"]]`, and one shrink.

- Patch: [H4.patch](../mutants/annalin/H4.patch)
- Original-code run: [H4-baseline.log](../mutants/annalin/H4-baseline.log)
- Mutant run: [H4-mutant.log](../mutants/annalin/H4-mutant.log)

The correct permission source was restored after this experiment, and all four properties passed again. H4 is a deliberate test fault, not a production fix.

### H5 evidence

The unmodified property file passed all four tests before mutation. H5 changed wildcard translation from `.*` to `[^/]*`, so `*` no longer matched `/`. All four properties failed:

- R1, `R1: effective deny blocks the execution continuation`, failed at ``expect(Permission.evaluate("bash", `rm ${name}`, ruleset).action).toBe("deny")``: expected `deny`, received `ask`. Seed `1742179807`; shrink path `0:1:1:1`; counterexample `["文档/é.txt", "allow", 0, 0]`; three shrinks.
- R2, `R2: ask waits for approval and rejection prevents continuation`, failed when `pollWithTimeout(permission.list().pipe(Effect.map((items) => (items.length === 1 ? items[0] : undefined))), "R2: approval request was not published")` timed out with `R2: approval request was not published`. The translated `git push *` pattern required a space and no longer matched bare `git push`, so the `allow` fallback completed without publishing an approval request. Seed `1460310562`; shrink path `4:0:0`; counterexample `[[""], "once", "allow"]`; two shrinks.
- R3, `R3: restoring a setting restores the original decision`, failed at `expect(Permission.evaluate("edit", name, current).action).toBe("deny")`: for `name` equal to `/a`, the top-level `edit: "deny"` rule's `*` pattern no longer matched, so evaluation returned `ask` instead of `deny`. Seed `-4177268`; shrink path `1:3:2`; counterexample `["/a", "allow", ["allow"]]`; two shrinks.
- R4, `R4: changing a deletion target preserves denial under rm *`, failed at `expect(folder).toEqual(original)`: `rm a` remained denied, but `rm -r a/` no longer matched `rm *` and evaluated to `ask`. Seed `-1584946146`; shrink path `0:0:0:0:0:0`; counterexample `["a", "a", "allow"]`; five shrinks.

- Patch: [H5.patch](../mutants/annalin/H5.patch)
- Original-code run: [H5-baseline.log](../mutants/annalin/H5-baseline.log)
- Mutant run: [H5-mutant.log](../mutants/annalin/H5-mutant.log)

The correct wildcard source was restored after this experiment, and all four properties passed again. H5 is a deliberate test fault, not a production fix.

## Agent failure case

### Transcript excerpt

The property below was written by opencode (build agent, model `gpt-5.6-sol-fast`) in session `ses_e3643dfffffeTj96rLOstHP13H` on November 11, 2026. Share link: https://opncd.ai/share/OstHP13H (opencode now reports that sharing is discontinued, so the full session is also exported in [opencode-transcript.json](../mutants/annalin/opencode-transcript.json)).

**Prompt:**

> Write a fast-check property test for this requirement and save it as `packages/opencode/test/permission/annalin.opencode.test.ts`
>
> Requirement R4, Commands governed by the same effective permission pattern must receive the same permission decision. In particular, changing a deletion target from one file or folder to another must preserve denial under an effective `rm *` deny rule.
>
> Use Permission.fromConfig and Permission.evaluate from src/permission. Use bun:test and fast-check with { numRuns: 100, seed: 42 }. Only create the test file. Do not change any source files.

**Response (opencode's text, tool calls omitted):**

> I'll inspect the permission API and nearby tests, then add only the requested property test and run that test if feasible.
>
> The permission matcher is last-match-wins, and an existing broader property suite confirms `rm *` covers both plain and recursive deletion forms. I'll create a focused standalone R4 test with generated nonempty file/folder targets, asserting equal decisions and explicit denial.
>
> The test file is in place. I'm running the exact Bun test now to verify the generator and permission assertions.
>
> Created `packages/opencode/test/permission/annalin.opencode.test.ts`. Verification: `1 pass`, `0 fail` with 100 runs and seed 42.

**Property it wrote** ([annalin.opencode.test.ts](../packages/opencode/test/permission/annalin.opencode.test.ts)):

```ts
const target = fc
  .array(fc.stringMatching(/^[a-zA-Z0-9._-]+$/), { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join("/"))

test("R4: changing a deletion target preserves denial under an effective rm * rule", () => {
  fc.assert(
    fc.property(target, target, fc.boolean(), fc.boolean(), (first, second, firstFolder, secondFolder) => {
      const ruleset = Permission.fromConfig({ bash: { "*": "allow", "rm *": "deny" } })
      const firstCommand = firstFolder ? `rm -r ${first}/` : `rm ${first}`
      const secondCommand = secondFolder ? `rm -r ${second}/` : `rm ${second}`
      const firstDecision = Permission.evaluate("bash", firstCommand, ruleset)
      const secondDecision = Permission.evaluate("bash", secondCommand, ruleset)

      expect(firstDecision.action).toBe("deny")
      expect(secondDecision.action).toBe(firstDecision.action)
    }),
    { numRuns: 100, seed: 42 },
  )
})
```

### The mutant it let survive

Stryker mutant #9 in `packages/core/src/util/wildcard.ts` ([S9-dotall.patch](../mutants/annalin/S9-dotall.patch)) removes the regex `s` (dot-all) flag on non-Windows platforms:

```diff
-  return new RegExp("^" + escaped + "$", process.platform === "win32" ? "si" : "s").test(normalized)
+  return new RegExp("^" + escaped + "$", process.platform === "win32" ? "si" : "").test(normalized)
```

Without the flag, `*` no longer matches a line break. A deletion target whose name contains a newline, such as `rm` followed by `\na`, stops matching `rm *` and falls through to the `"*": "allow"` rule. The deletion is allowed instead of denied, which violates R4. The opencode property still passed with this mutant applied ([opencode-S9.log](../mutants/annalin/opencode-S9.log)). It also passed against H1 to H4 and killed only H5.

### Why the property was too weak

The generator never reaches the bug. Every name segment comes from `/^[a-zA-Z0-9._-]+$/`, so the property never produces a space, line break, tab, Unicode letter, or regex symbol, even though real filenames can contain all of these. Mutant #9 only changes behavior for names with line breaks, so all 100 generated cases behave the same under the mutant and the original code. opencode read `annalin.property.test.ts`, whose generator already includes spaces, Unicode, and regex symbols, but it still chose the narrow character class. It then reported "1 pass, 0 fail" as verification, although a passing run only shows the property agrees with the current code, not that it can detect a fault.

### Strengthened version and evidence

The strengthened property ([annalin.opencode-strengthened.test.ts](../packages/opencode/test/permission/annalin.opencode-strengthened.test.ts)) keeps opencode's oracle and changes only the generator, so each segment may contain spaces, newlines, tabs, Unicode, and regex symbols:

```ts
const segment = fc
  .array(fc.constantFrom("a", "Z", "0", ".", "_", "-", " ", "\n", "\t", "é", "中", "[", "+", "$", "*", "?"), {
    minLength: 1,
    maxLength: 12,
  })
  .map((chars) => chars.join(""))
const target = fc.array(segment, { minLength: 1, maxLength: 4 }).map((parts) => parts.join("/"))
```

- On the original code it passes: 1 pass, 0 fail ([strengthened-baseline.log](../mutants/annalin/strengthened-baseline.log)).
- With mutant #9 applied it fails: 0 pass, 1 fail, counterexample `["\na","a",false,false]`, meaning `rm` followed by a name starting with a newline was not denied ([strengthened-S9.log](../mutants/annalin/strengthened-S9.log)).
- It still kills H5.
