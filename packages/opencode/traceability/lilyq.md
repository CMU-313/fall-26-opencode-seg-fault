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

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test |
|---|---|---|---|---|---|---|
| R1 | C-4, S-2, O-3 | When a user enters an unsupported hint level, the system must reject the selection and display a message indicating that the level is invalid. | Given `/hint advanced` or another unsupported hint level, the system displays an error indicating that it is not a supported hint level. | No | Invariant | Generate unsupported single-word inputs (`advanced`, `123`, empty string) Assert an invalid-level error is shown. |
| R2 | C-4, S-2, O-2 | When an unsupported hint level is entered, the system must keep the previously active hint level. | Given `detailed` is active, entering `/hint advanced` shows the error from R1 and the active level is still `detailed`. | No | Invariant | Be on an active supported setting (`subtle`, `moderate`, `detailed`, `none`), and an unsupported input. Assert the error appears and the active setting is unchanged. |
| R3 | C-7, S-5 | Hint-level selection must be case-insensitive. | Entering `/hint subtle`, `/hint Subtle`, or `/hint SUBTLE` activates the same `subtle` hint level. | No | Metamorphic | Generate a supported setting and a mixed-case spelling. Assert it produces the same canonical setting as its lowercase spelling. |
| R4 | C-6 | A `/hint` command with extra whitespace must be rejected without changing the active level. | Given `subtle` is active, entering `/hint  detailed` (two spaces) displays a validation message and the active level remains `subtle`. | Yes | Invariant | Generate an active supported setting and malformed whitespace forms. Assert each is rejected and the active setting is unchanged. |
| R5 | S-5, S-6, O-7 | Misspelled hint levels and abbreviations must not be applied as a hint level. | Given `detailed` is active, `/hint subtel` and `/hint sub` each display an error and the active level remains `detailed`. | No | Invariant | Generate an active supported setting plus misspellings and proper abbreviations derived from supported settings. Assert neither changes the active setting and each reports an error. |
| R6 | C-8, O-6 | When the input is rejected because it is close to a valid level name, the error message must suggest the valid level. | Given `/hint sub`, the error message names `subtle` as a suggested level. The active level does not change. | Yes | Model / oracle | Compare suggestions for generated close inputs derived from supported settings with an independent expected-suggestion oracle. |
| R7 | C-5 | Switching hint levels must set the active level to the requested one and must not alter the conversation history. | Starting from `subtle` with N messages in the history, entering `/hint detailed` sets the level to `detailed`, then `/hint subtle` sets it to `subtle`. After both commands the message history is identical to the original N messages. | No | Round-trip | Be on a supported setting with a nonempty history. Switch to a different setting and back; assert the initial setting and history are restored. |
| R8 | C-10 | The system must provide visible confirmation when a user successfully changes their hint level. | Given `subtle` is active, entering `/hint detailed` displays a confirmation identifying `detailed` as the newly active level. | Yes | Invariant | For every successful transition between distinct supported levels, a transient confirmation names the newly active level and does not create a persisted conversation message. |

Properties written or suggested by opencode or another AI tool: <list by requirement ID, or "none">

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R4 | A `/hint` command with extra whitespace must be rejected without changing the active level. | The command syntax is exactly `/hint` followed by one ASCII space and one hint-level value. Any leading, trailing, repeated, tab, or newline whitespace in the command arguments is rejected without changing the active level.| “Extra whitespace” did not define which whitespace forms are invalid, so the original could not be checked consistently. | 
| R6 | 	When the input is rejected because it is close to a valid level name, the error message must suggest the valid level. | When an invalid level is a case-insensitive prefix of exactly one supported level, or has all the letters of exctly one supported level, or has all the letters of a prefix of one supported level, the error suggests that level but does not change the active level. | “Close” was subjective and not testable. This rule still supports `/hint sub` → `subtle`. | 
| R8 | The system must provide visible confirmation when a user successfully changes their hint level. | After a successful hint-level change, the interface that received the command shows a transient, non-persisted confirmation naming the active level. The confirmation does not create a conversation-history message. | Defines observable behavior and makes it explicitly compatible with R7’s unchanged-history requirement.
