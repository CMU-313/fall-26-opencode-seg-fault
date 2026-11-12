# Traceability: Lily Qin (lilyq)

**Target feature:** Hint level selection

**Main source files:**
- `packages/app/src/components/prompt-input/submit.ts`
- `packages/app/src/components/prompt-input/transient-state.ts`
- `packages/app/src/components/prompt-input.tsx`
- `packages/tui/src/component/prompt/index.tsx`
- `packages/opencode/src/session/prompt.ts`
- `packages/sdk/js/src/v2/gen/types.gen.ts`
- `packages/sdk/js/src/v2/gen/sdk.gen.ts`
- `packages/app/src/utils/server-compat.ts`
- `packages/app/src/i18n`

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it Kills |
|---|---|---|---|---|---|---|---|
| R1 | C-4, S-2, O-3 | When a user enters a hint level that is not one of `subtle`, `moderate`, `detailed`, or `none` (case-insensitively), the system must reject the selection and return an error toast that lists the supported hint levels, so the user can choose again. | Given `/hint advanced` or another unsupported hint level, the handler returns `handled: true`, an unchanged active level, and an error toast whose message lists the supported levels (`subtle`, `moderate`, `detailed`, `none`). | Yes | Invariant | Generate unsupported identifier-like hint levels beginning with a letter. Assert the command is rejected, the active setting is preserved, and an error toast is returned. [`R1: unsupported hint levels are rejected with an error listing the supported levels`] | H1, H2, H4 |
| R2 | C-4, S-2, O-2 | When an unsupported hint level is entered, the system must keep the previously active hint level. | Given `detailed` is active, entering `/hint advanced` shows the error from R1 and the active level is still `detailed`. | No | Invariant | Be on an active supported setting (`subtle`, `moderate`, `detailed`, `none`), and an unsupported input. Assert the error appears and the active setting is unchanged. [`R2: rejected hint levels preserve the active setting`]| H2, H4 |
| R3 | C-7, S-5 | Hint-level selection must be case-insensitive. | Entering `/hint subtle`, `/hint Subtle`, or `/hint SUBTLE` activates the same `subtle` hint level. | No | Metamorphic | Generate a supported setting and a mixed-case spelling. Assert it produces the same canonical setting as its lowercase spelling. [`R3: changing a supported setting's casing preserves its meaning`]| H3 |
| R4 | C-6 | The command syntax is exactly `/hint` followed by one ASCII space and one hint-level value. Any leading, trailing, repeated, tab, or newline whitespace in the command arguments is rejected without changing the active level. | Generate an active supported setting and malformed whitespace forms. Assert each is rejected and the active setting is unchanged. | Yes | Invariant | [Not implemented]| N/A |
| R5 | S-5, S-6, O-7 | Misspelled hint levels and abbreviations must not be applied as a hint level. | Given `detailed` is active, `/hint subtel` and `/hint sub` each display an error and the active level remains `detailed`. | No | Invariant | Generate an active supported setting plus misspellings and proper abbreviations derived from supported settings. Assert neither changes the active setting and each reports an error. [`R5: misspellings and abbreviations are rejected and the active setting is preserved`]| H2, H4 |
| R6 | C-8, O-6 | When an invalid hint level is a case-insensitive, nonempty proper prefix of exactly one supported hint level, the error message must suggest that supported level without changing the active selection. | Given `/hint sub`, the error message names `subtle` as a suggested level. The active level does not change. | Yes | Model / oracle | Compare suggestions for generated close inputs derived from supported settings with an independent expected-suggestion oracle. [Not implemented] | N/A |
| R7 | C-5 | Switching hint levels must set the active level to the requested one and must not alter the conversation history. | Starting from `subtle` with N messages in the history, entering `/hint detailed` sets the level to `detailed`, then `/hint subtle` sets it to `subtle`. After both commands the message history is identical to the original N messages. | No | Round-trip | Be on a supported setting with a nonempty history. Switch to a different setting and back; assert the initial setting and history are restored. ['R7: handled hint commands cannot fall through to conversation history'] | RT3 |
| R8 | C-10 | When a user successfully changes their hint level, the command handler must return an informational toast identifying the newly active hint level. | Given `subtle` is active, entering `/hint detailed` returns a handled result with `hintLevel: "detailed"` and an informational toast containing message: `"Hint level: detailed"` and `variant: "info"`. | Yes | Invariant | Generate distinct initial and requested hint levels. Assert that the command handler returns the newly active level and an informational toast identifying that level. [`R8: successful hint changes always provide confirmation`] | H5 |

Properties written or suggested by opencode or another AI tool: R1, R2, R3, R5, R7, R8

During P5, I expanded the R3 metamorphic property to also cover whitespace normalization. It compares canonical commands with variations containing repeated spaces, tabs, newlines, and outer whitespace. Although this behavior conflicts with R4's requirement to reject extra whitespace, I added these cases to test the implementation's existing normalization behavior and kill the `.trim()` and `\s+` Stryker survivors. This revealed a mismatch between the documented requirement and the current implementation that still needs to be resolved.

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R1 | When a user enters an unsupported hint level, the system must reject the selection and display a message indicating that the level is invalid. | When a user enters a hint level that is not one of `subtle`, `moderate`, `detailed`, or `none` (case-insensitively), the system must reject the selection and return an error toast that lists the supported hint levels, so the user can choose again. | "A message indicating the level is invalid” did not say what the message must contain, so it could not be checked consistently. The revision defines a testable error toast that lists the valid options, which tells the user to choose again, as C-4 and S-2 asked. |
| R4 | A `/hint` command with extra whitespace must be rejected without changing the active level. | The command syntax is exactly `/hint` followed by one ASCII space and one hint-level value. Any leading, trailing, repeated, tab, or newline whitespace in the command arguments is rejected without changing the active level.| “Extra whitespace” did not define which whitespace forms are invalid, so the original could not be checked consistently. | 
| R6 | When the input is rejected because it is close to a valid level name, the error message must suggest the valid level. | When an invalid hint level is a case-insensitive, nonempty proper prefix of exactly one supported hint level, the error message must suggest that supported level without changing the active selection. | “Close” was subjective and not testable. This rule still supports `/hint sub` → `subtle`. | 
| R8 | The system must provide visible confirmation when a user successfully changes their hint level. | When a user successfully changes their hint level, the command handler must return an informational toast identifying the newly active hint level. | The original requirement did not specify how confirmation should be provided or verified. The revised requirement defines a deterministic, testable response while preserving the user's need for feedback when changing hint levels. |

## Run, Triage, Fix

I did not modify the `/hint` behavior, but I refactored the code to put the `/hint` command decision logic in `packages/tui/src/prompt/hint.ts` so it could be used in the property tests as well. 

## Hand-Written Mutants

| ID | Requirement Targeted | Change | Predicted Killer | Actual Result | 
|---|---|---|---|---|
| H1 | R1 | `src/prompt/hint.ts`: Replace the invalid-level error message, `hintUsage`, with a generic `"Invalid hint level"` message. This removes the list of supported levels from the error. | `R1: unsupported hint levels are rejected with an error listing the supported levels` | Killed by R1, as predicted. `Counterexample: [undefined,"A"]` |
| H2 | R2 | `src/prompt/hint.ts`: Replace `hintLevel: active` with `hintLevel: undefined` in the invalid-input response. An invalid `/hint` command now disables any active hint level instead of preserving it. | `R2: rejected hint levels preserve the active setting` | Killed by R2, but also R1 and R5. R1 and R5 also killed this mutant because they are also preserving hint levels from various functionalities.|
| H3 | R3 | `src/prompt/hint.ts`: Remove `.toLowerCase()` from `const setting = match[1]?.toLowerCase()`. Valid hint levels now become case-sensitive, so `/hint Subtle` is rejected. | `R3: changing a supported setting's casing preserves its meaning` | Killed by R3, as predicted. `Counterexample: [{"setting":"subtle","casing":[false,false,false,false,true,false]}]` |
| H4 | R5 | `src/prompt/hint.ts`: Change `isHintLevel` so it accepts any non-none prefix of a supported level. For example, `/hint sub` is incorrectly treated as `subtle`. | `R5: misspellings and abbreviations are rejected and the active setting is preserved` | Killed by R5 as expected, but also R1 and R2. R1 and R2 also kill this mutant because they use `applyHintCommand`, which relies on `isHintLevel`, which is the function that this mutant changed. The restrictions on what is allowed as a hint level are too loose now, thus the mutant is killed. | 
| H5 | R8 | `src/prompt/hint.ts`: Replace the successful-command message `Hint level: ${setting}` with the generic `"Hint level updated"`. The command succeeds but no longer tells the user which hint level is active. | `R8: successful hint changes always provide confirmation` | Killed by R8, as expected. | 

## Stryker Comparison 
**fast-check seed:** `42`

Stryker mutated `packages/tui/src/prompt/hint.ts` and ran only `test/session/hint.property.test.ts`. It generated 51 mutants: 44 were killed and 7 survived, for a mutation score of 86.27% (44/51). 

Stryker did not generate the exact semantic changes represented by H1–H5: replacing the supported-level message with a generic message, clearing the previous active level after invalid input, accepting abbreviations as complete settings, or returning a generic confirmation without the new level. Stryker instead applied general syntactic mutations such as regular-expression edits, optional-chaining removal, and conditional-expression changes. Hand-written mutants therefore exercised feature-specific requirements that Stryker could not infer from the implementation alone.

The first run had seven command-parser survivors:

- Removing `.trim()` from the command input (line 19).
- Removing the start anchor (`^`) from the `/hint` regular expression (line 19).
- Removing the end anchor (`$`) from the regular expression (line 19).
- Making the hint-level argument mandatory (line 19).
- Changing `\s+` to `\s`, so repeated whitespace is no longer accepted (line 19).
- Changing `if (!match)` to `if (false)`, causing non-`/hint` text to be treated as a hint command (line 20).
- Removing optional chaining from `match[1]?.toLowerCase()`, which can throw when `/hint` has no argument (line 22).

I would not have initially designed the anchor-removal and optional-chaining mutants. They are plausible implementation mistakes: an unanchored command parser can accept extra text, and removing optional chaining can crash on `/hint` with no argument. The `.trim()` and whitespace survivors also revealed that my initial properties did not exercise command whitespace or a missing argument. After strengthening the properties below, all seven were killed.

Hand-written mutants found domain-specific failures in error guidance, state preservation, case handling, abbreviations, and confirmation text. Stryker found parser-boundary failures involving arbitrary non-command text, malformed command syntax, trailing text, and absent arguments. The approaches are complementary.

## Strengthening

I do not claim any equivalent mutants: every mutant produced an observable behavior change and was killed by a generated property. Therefore the final score with equivalent mutants excluded and final raw score is the same: 100.00% (51/51).

| Survivor category | Stronger property |
|---|---|
| Removing `.trim()` / changing `\s+` | Expand the R3/R4 metamorphic property to generate repeated spaces, tabs, newlines, and outer whitespace around every supported setting. Assert each whitespace-normalized command has the same result as the canonical command. |
| Removing `^` or `$` regex anchors | Generate nonempty prefixes and suffixes around otherwise valid `/hint <level>` text. Assert non-command text is not handled as a hint command, and malformed command text cannot change the level. |
| Making the argument mandatory | Generate every active level and call `/hint` without a value. Assert it returns a safe error response and preserves the active level. |
| Replacing `if (!match)` with `if (false)` | Generate arbitrary text that is not a `/hint` command. Assert `applyHintCommand` returns `{ handled: false }`. |
| Removing optional chaining | Reuse the generated missing-argument property. It will catch the crash caused by `match[1].toLowerCase()`. |

## Agent Failure Case

I asked Opencode (GPT 5.6 Terra, `/build` agent) to create an independent property for R1. It created `packages/tui/test/prompt/hint.property.test.ts`.

### Transcript excerpt

**Share link:** https://opncd.ai/share/QAtbkOr6

**Prompt:**

> Write a property test for this requirement: When a user enters a hint level that is not one of subtle, moderate, detailed, or none (case-insensitively), the system must reject the selection and return an error toast that lists the supported hint levels, so the user can choose again. Ignore `packages/opencode/test/session/hint.property.test.ts` as that contains my properties. Create your own properties.

**Opencode response excerpt:**

> I’ll add a focused fast-check property in the TUI test suite. It will generate arbitrary non-whitespace hint tokens excluded from the supported set after lowercasing, then assert the command is handled as an error, preserves the current selection, retains input, and exposes every supported level in the toast.

### Surviving mutant

I ran Opencode's generated property for R1 `packages/tui/test/prompt/hint.property.test.ts` against Stryker mutants by changing `stryker.lilyq.config.json`. I changed the `command` in `commandRunner` to `cd packages/tui && bun test --timeout 30000 test/prompt/hint.property.test.ts` from `cd packages/opencode && bun test --timeout 30000 test/session/hint.property.test.ts`. I also changed the destination of the html report to `packages/tui/reports/mutation/mutation.html`.

Here are the unkilled mutants and their relevance to the targeted requirement (`R1: unsupported hint levels are rejected with an error listing the supported levels`):

| Mutant(s) | Count | R1 relevance | Fix |
|---|---:|---|---|
| Remove `.trim()` | 1 | Indirectly relevant: an invalid setting can include harmless outer whitespace | Fixed: generate outer whitespace |
| Change `\s+` to `\s` | 1 | Indirectly relevant: an invalid setting can follow repeated whitespace | Fixed: generate repeated spaces, tabs, and newlines |
| Remove `^` and/or `$` regex anchors | 3 | No — malformed/non-command syntax | Parser/R4 boundary property, not R1 |
| Replace `if (!match)` with `if (false)` | 1 | No — non-command handling | Parser-boundary property, not R1 |
| `.toLowerCase()` → `.toUpperCase()`; remove optional chaining | 2 | No — valid-setting casing and missing-value behavior | R3 / missing-argument property |
| Mutate the `setting === "none"` branch or its return values | 8 | No — `none` is a valid success case | Valid-setting/R8 property |
| Mutate the supported-setting success branch or its return values | 7 | No — valid-setting success behavior | R3/R8 property |
| Mutate `isHintLevel` predicate logic | 11 | No — valid supported-setting recognition | R3/R8 property |


### Why the property was too weak

The generated value is explicitly restricted to contain no whitespace, and the test always builds `/hint ` followed by that value, with exactly one normal space and no leading or trailing whitespace. Removing `.trim()` therefore cannot change the behavior for any generated input: the generator never reaches the whitespace boundary that exposes the bug.

### Strengthened property and evidence

I strengthened the Opencode-generated R1 property in `packages/tui/test/prompt/hint.property.test.ts` to generate single and repeated spaces, tabs, newlines, and outer whitespace around each invalid setting. This makes removing `.trim()` or replacing `\s+` with `\s` observable. Stryker's run of this agent-only property improved from 17/51 killed (33.33%) to 19/51 killed (37.25%): both whitespace mutants were killed. The remaining survivors concern valid settings, `/hint none`, missing arguments, or malformed/non-command input, which are outside R1.

<details>
<summary>Full Opencode transcript</summary>

```text
>Thought: Planning commentary update · 801ms
>I’ll locate the hint-level selection flow and its existing test conventions, then add an independent property test covering invalid case-insensitive inputs and the error toast contract.

>Todos

[•] Locate hint-level selection implementation and test conventions
[ ] Add independent property test for invalid hint-level rejection toast
[ ] Run focused test and typecheck if practical
✱Glob "**/*hint*" in . (2 matches)
✱Grep "subtle|moderate|detailed" in . (48 matches)
✱Glob "test/**/*.property.test.ts" in . (1 match)
✱Glob "**/*property*.test.ts" in . (1 match)
+ Thought: Inspecting test ignore property implementation · 1.3s
→Read src/session/prompt.ts [offset=60, limit=60]
→Read src/session/prompt.ts [offset=1490, limit=85]
→Read test/session/prompt.test.ts [offset=1, limit=100]
↳ Loaded test/AGENTS.md
→Read package.json [offset=1, limit=180]
✱Grep "hintLevel|hint level|HintLevel" in src (3 matches)
+ Thought: Searching entire repo for TUI code · 895ms
✱Grep "hint level|hintLevel|Hint level|Hint Level" in ~/fall-26-opencode-seg-fault (100 matches)
✱Grep "toast.*error|error.*toast|Toast" in ~/fall-26-opencode-seg-fault/packages (100 matches)
✱Glob "**/*.property.test.ts" in ~/fall-26-opencode-seg-fault (1 match)
✱Grep "fast-check|fc\.property|fc\.assert" in test (15 matches)
+ Thought: Assessing test placement for hint property · 1.6s
→Read ~/fall-26-opencode-seg-fault/packages/tui/src/prompt/hint.ts [limit=160]
→Read ~/fall-26-opencode-seg-fault/packages/tui/src/component/prompt/index.tsx [offset=490, limit=55]
→Read ~/fall-26-opencode-seg-fault/packages/tui/src/component/prompt/index.tsx [offset=1050, limit=55]
✱Glob "test/**/*hint*" in ~/fall-26-opencode-seg-fault/packages/tui
✱Grep "applyHintCommand|prompt/hint" in ~/fall-26-opencode-seg-fault/packages/tui
→Read ~/fall-26-opencode-seg-fault/packages/tui/package.json [limit=100]
+ Thought: Planning test dependency setup for TUI · 1.7s
The behavior is isolated in packages/tui/src/prompt/hint.ts: it normalizes input with toLowerCase(), preserves the active level on failure, and returns the usage string as an error toast. I’ll test that module directly in the TUI package, without consulting the existing property file.
# Todos
[✓] Locate hint-level selection implementation and test conventions
[•] Add independent property test for invalid hint-level rejection toast
[ ] Run focused test and typecheck if practical
✱Glob "test/**/*.test.ts*" in ~/fall-26-opencode-seg-fault/packages/tui (46 matches)
→Read ~/fall-26-opencode-seg-fault/packages/tui/test/cli/tui/dialog-prompt.test.tsx [limit=140]
✱Grep "fast-check" in ~/fall-26-opencode-seg-fault (1 match)
→Read ~/fall-26-opencode-seg-fault/package.json [offset=1, limit=140]
+ Thought: Planning property test for TUI package · 14.9s
+ Thought: Designing Unicode non-whitespace string generation · 8ms
+ Thought: Planning input validation and error handling · 1.7s
I’ll add a focused fast-check property in the TUI test suite. It will generate arbitrary non-whitespace hint tokens excluded from the supported set after lowercasing, then assert the command is handled as an error, preserves the current selection, retains input, and exposes every supported level in the toast.
← Patched packages/tui/package.json
  },
  "devDependencies": {
    "@tsconfig/bun": "catalog:",
    "@types/bun": "catalog:",
    "@typescript/native-preview": "catalog:"
    "@typescript/native-preview": "catalog:",
    "fast-check": "4.10.2"
  }
}
# Created packages/tui/test/prompt/hint.property.test.ts
import { expect, test } from "bun:test"
import fc from "fast-check"
import { HintSetting, applyHintCommand } from "../../src/prompt/hint"

const supportedSettings = new Set<string>(HintSetting)
const activeLevels = [undefined, "subtle", "moderate", "detailed"] as const

test("invalid hint levels are rejected with an error that lists every supported level", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...activeLevels),
      fc.string().filter((value) => value.length > 0 && !/\s/.test(value) && !supportedSettings.has(value.toLowerCase())),
      (active, invalidSetting) => {
        const result = applyHintCommand(`/hint ${invalidSetting}`, active)

        expect(result.handled).toBe(true)
        if (!result.handled) throw new Error("expected hint command to be handled")

        expect(result.clearInput).toBe(false)
        expect(result.hintLevel).toBe(active)
        expect(result.toast.variant).toBe("error")
        expect(HintSetting.every((setting) => result.toast.message.includes(setting))).toBe(true)
      },
    ),
  )
})
+ Thought: Planning focused test runs · 637ms
# Todos
[✓] Locate hint-level selection implementation and test conventions
[✓] Add independent property test for invalid hint-level rejection toast
[•] Run focused test and typecheck if practical
# Running in ~/fall-26-opencode-seg-fault/packages/tui
$ bun test test/prompt/hint.property.test.ts
bun test v1.4.0 (34cbb9a40)

test/prompt/hint.property.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find package 'fast-check' from '/home/lily/fall-26-opencode-seg-fault/packages/tui/test/prompt/hint.property.test.ts'
-------------------------------


…
Click to expand
# Running in ~/fall-26-opencode-seg-fault/packages/tui
$ bun typecheck
$ tsgo --noEmit
test/prompt/hint.property.test.ts(2,16): error TS2307: Cannot find module 'fast-check' or its corresponding type declarations.
test/prompt/hint.property.test.ts(12,27): error TS7006: Parameter 'value' implicitly has an 'any' type.
test/prompt/hint.property.test.ts(13,8): error TS7006: Parameter 'active' implicitly has an 'any' type.
test/prompt/hint.property.test.ts(13,16): error TS7006: Parameter 'invalidSetting' implicitly has an 'any' type.
+ Thought: Considering adding fast-check and running bun install · 3.5s
+ Thought: Planning dependency installation sequence · 1.6s
The TUI package did not have fast-check installed, so the new declared test dependency is not yet linked into its workspace. I’ll refresh workspace dependencies, then rerun the focused test and TUI typecheck.
# Running in ~/fall-26-opencode-seg-fault
$ ls
AGENTS.md
CONTEXT.md
CONTRIBUTING.md
LICENSE
README.ar.md
README.bn.md
README.br.md
README.bs.md
README.da.md
README.de.md
…
Click to expand
# Running in ~/fall-26-opencode-seg-fault
$ bun install
bun install v1.4.0 (34cbb9a40)
Resolving dependencies
Resolved, downloaded and extracted [18]
Saved lockfile

$ bun run --cwd packages/core fix-node-pty
$ bun run script/fix-node-pty.ts
$ husky

Checked 2528 installs across 2801 packages (no changes) [5.84s]
# Running in ~/fall-26-opencode-seg-fault/packages/tui
$ bun test test/prompt/hint.property.test.ts
bun test v1.4.0 (34cbb9a40)

 1 pass
 0 fail
 500 expect() calls
Ran 1 test across 1 file. [1418.00ms]
# Running in ~/fall-26-opencode-seg-fault/packages/tui
$ bun typecheck
$ tsgo --noEmit
# Running in ~/fall-26-opencode-seg-fault
$ git diff --check
traceability/lilyq.md:89: trailing whitespace.
+None of my P4 properties came from Opencode, so I asked it to write a property for R1. I used GPT 5.6 Terra on `/build` agent.
traceability/lilyq.md:95: trailing whitespace.
+Prompt:
traceability/lilyq.md:96: trailing whitespace.
+>Write a property test for this requirement: When a user enters a hint level that is not one of subtle, moderate, detailed, or none (case-insensitively), the system must reject the selection and return an error toast that lists the supported hint levels, so the user can choose again. Ignore packages/opencode/test/session/hint.property.test.ts as that contains my properties. Create your own properties. Use helpers throughout the repo as needed, but not the property file.
traceability/lilyq.md:98: trailing whitespace.
+Response (property generated is in `packages/opencode`):
+ Thought: Running git status and diff checks · 997ms
# Todos
[✓] Locate hint-level selection implementation and test conventions
[✓] Add independent property test for invalid hint-level rejection toast
[✓] Run focused test and typecheck if practical
# Running in ~/fall-26-opencode-seg-fault
$ git status --short
M bun.lock
 M mutants/lilyq/mutation.html
 M packages/tui/package.json
 M traceability/lilyq.md
?? .devcontainer/devcontainer-lock.json
?? packages/tui/test/prompt/hint.property.test.ts
?? traceability/image.png
# Running in ~/fall-26-opencode-seg-fault
$ git diff -- packages/tui/package.json packages/tui/test/prompt/hint.property.test.ts bun.lock
diff --git a/bun.lock b/bun.lock
index b7983c0..81ac216 100644
--- a/bun.lock
+++ b/bun.lock
@@ -969,6 +969,7 @@
         "@tsconfig/bun": "catalog:",
         "@types/bun": "catalog:",
         "@typescript/native-preview": "catalog:",
+        "fast-check": "4.10.2",
       },
…
Click to expand
+ Thought: Verifying test and typecheck coverage outside git diff · 2.1s
Added an independent property test at packages/tui/test/prompt/hint.property.test.ts.
It generates unsupported case-insensitive hint tokens and verifies rejection preserves the active selection, retains input, and returns an error toast listing subtle, moderate, detailed, and none.
Added fast-check to TUI dev dependencies and updated bun.lock.
Verified:
- bun test test/prompt/hint.property.test.ts
- bun typecheck in packages/tui
git diff --check reports pre-existing trailing whitespace in traceability/lilyq.md; it was not modified.

```

</details>



## Red Team Mutation Defense
Received from: inseokk

### RT1 — R5: Misspelled hint levels

- **Mutation:** Changed the accepted hint level from `subtle` to `subtel`.
- **Initial result:** Killed by R3, R5, R8
- **Evidence:** R5 failed after 53 tests with counterexample [undefined, "subtel"], demonstrating that the invalid misspelling was incorrectly accepted. R3 and R8 also failed because the valid subtle setting was rejected.
- **Fix:** No additional properties were needed because the existing tests already detected the mutation.

### RT2 — R8: Successful hint changes return informational toast

- **Mutation:** Changed the toast variant for `/hint none` from `info` to `error`.
- **Initial result:** Killed by R8
- **Evidence:** R8 failed after 14 tests with counterexample ["detailed", "none"]. The property detected that disabling hints returned an error toast instead of an informational confirmation.
- **Fix:** No additional properties were needed because the existing tests already detected the mutation.

### RT3 — R7: Hint changes preserve conversation history

- **Mutation:** Removed the early return after handling a `/hint` command, allowing execution to continue into the normal submission flow.
- **Initial result:** Survived
- **Reason:** The original properties only tested applyHintCommand() and did not cover the early return in the prompt submission handler.
- **Fix:** Added an R7 fast-check property that generates supported hint commands and active settings, then checks that the handled-command branch contains an early return before the conversation-history submission path.
- **Final result:** Killed by the new R7 check, subject to confirming that the property passes with the original implementation restored.