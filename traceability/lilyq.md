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
| R7 | C-5 | Switching hint levels must set the active level to the requested one and must not alter the conversation history. | Starting from `subtle` with N messages in the history, entering `/hint detailed` sets the level to `detailed`, then `/hint subtle` sets it to `subtle`. After both commands the message history is identical to the original N messages. | No | Round-trip | Be on a supported setting with a nonempty history. Switch to a different setting and back; assert the initial setting and history are restored. [Not implemented] | N/A |
| R8 | C-10 | When a user successfully changes their hint level, the command handler must return an informational toast identifying the newly active hint level. | Given `subtle` is active, entering `/hint detailed` returns a handled result with `hintLevel: "detailed"` and an informational toast containing message: `"Hint level: detailed"` and `variant: "info"`. | Yes | Invariant | Generate distinct initial and requested hint levels. Assert that the command handler returns the newly active level and an informational toast identifying that level. [`R8: successful hint changes always provide confirmation`] | H5 |

Properties written or suggested by opencode or another AI tool: R1, R2, R3, R5, R8

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