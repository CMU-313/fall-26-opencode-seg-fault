# Traceability: Leo Liu (xinruil3)

**Target feature:** Learning Mode Configuration (#11): the `learning_mode` setting, set in the global or project `opencode.json` or for one run with `OPENCODE_LEARNING_MODE`. Main files: `packages/core/src/config.ts`, `packages/core/src/v1/config/config.ts`, `packages/core/src/v1/config/migrate.ts`, `packages/core/src/flag/flag.ts`, `packages/opencode/src/config/config.ts`, `packages/opencode/src/session/prompt.ts`, `packages/opencode/src/session/prompt/learning-mode.txt`.

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills |
|---|---|---|---|---|---|---|---|
| R1 | C-4, C-5, S-13, O-3 | Enabling or disabling learning mode must preserve the selected model, tool definitions, user messages, conversation history, and all other system instructions. The only change to the request's instructional content is the addition or removal of the learning-mode instructions. | In two otherwise identical fresh sessions in the same project, send the same message with learning_mode set to false and true respectively. Compare the captured requests after excluding generated request IDs and timestamps, if present. The model, tool definitions, and non-system messages are identical. Removing the learning-mode instructions from the enabled request's system prompt yields the disabled request's system prompt. | No | Invariant: for generated models, tool settings, instructions and conversation histories, toggling learning mode changes only the learning-mode instruction block in each captured request. Each case also ends with a structured-output (json_schema) prompt. | [R1: toggling learning mode preserves the rest of every model request](../packages/opencode/test/session/learning-mode.property.test.ts#L84) | H6 (after strengthening); M3 (red team, after strengthening) |
| R2 | S-14, O-4, O-13, O-14 | A learning_mode setting in a project's opencode.json applies only to that project. The global setting supplies the default for all projects unless overridden by a project setting or OPENCODE_LEARNING_MODE. Within the same project, enabling learning mode globally or locally produces the same learning-mode instructions. If neither file sets it and the environment variable is absent, learning mode is off. | In all cases below, OPENCODE_LEARNING_MODE is absent. Use two projects, A and B, where B has no opencode.json. (1) Global unset, A sets "learning_mode": true: A's request contains the learning-mode prompt and B's does not. (2) Global sets true, A unset: requests from both A and B contain it, and A's request contains the same learning-mode instructions as in case (1). (3) Neither file sets it: neither request contains it. | No | Metamorphic: moving learning_mode from project A to global preserves A's instructions and enables B; removing both settings disables both projects. | [R2: moving the setting from project to global changes only its scope](../packages/opencode/test/session/learning-mode.property.test.ts#L138) | H4 |
| R3 | O-15, O-16 | When OPENCODE_LEARNING_MODE is not set and the global and project configs disagree, the project setting decides. | With OPENCODE_LEARNING_MODE absent: global "learning_mode": true with project false: the request contains no learning-mode prompt. Global false with project true: the request contains it. | No | Model / oracle: for both conflicting boolean pairs, the effective config and captured request agree with the project-setting oracle. | [R3: conflicting configs agree with the project-setting oracle](../packages/opencode/test/session/learning-mode.property.test.ts#L178) | H3; M2 (red team) |
| R4 | O-10, O-11, O-17 | Setting OPENCODE_LEARNING_MODE to a recognized value (true, 1, false or 0, ignoring case and leading/trailing whitespace) overrides both config files for that process only. A value that is empty after trimming is treated the same as the variable being absent. The override is never persisted: config settings remain unchanged, and the next run without the variable goes back to the config setting. Normal config initialization may add a missing $schema field; after initialization, both files remain byte-for-byte unchanged across these runs. | Set global learning_mode to false and project learning_mode to true. Launch run 1 with OPENCODE_LEARNING_MODE=false: its request contains no learning-mode instructions. Launch run 2 with the variable absent: its request contains the learning-mode instructions. Repeat with global true and project false and OPENCODE_LEARNING_MODE=true. In both cases, all persisted settings remain unchanged; a first load may only add missing $schema metadata. Files that already have $schema remain byte-for-byte unchanged from the start, and initialized file bytes remain unchanged on subsequent runs with the variable absent or empty. OPENCODE_LEARNING_MODE=" TRUE " behaves like true; empty and whitespace-only values behave like the variable is absent. | Yes | Round-trip: apply a generated recognized environment override, then launch separate processes with the variable absent and empty; verify file-based behavior returns, no override is persisted, and file bytes remain unchanged after normal initialization. P5 adds a model/oracle property: 200 generated spellings, read in-process, must parse to the value they were built from. | [R4: a one-process override returns to unchanged file configuration](../packages/opencode/test/session/learning-mode.property.test.ts#L207)<br>[R4: every override spelling parses to the value it was built from](../packages/opencode/test/session/learning-mode.property.test.ts#L273) | H1, H3; H2 (after strengthening, parser property); M1, M2 (red team) |
| R5 | C-10, C-11, S-16, S-18, O-8 | Changing learning_mode in a config file takes effect the next time opencode loads that project's config: the next time opencode is started in that project, or when it reloads its config. Until then, the running opencode keeps the setting it loaded. Messages and replies already in a session's history are never changed by the setting, and switching back restores the previous behavior from the next load. | Start opencode with project "learning_mode": false, open session 1 and send message 1: its request has no learning-mode prompt. Quit opencode, edit the project opencode.json to true, and start opencode again. Start session 2 and send a message: its request contains the learning-mode prompt. Resume session 1 and send message 2: its request contains the learning-mode prompt, and message 1 and its reply are unchanged in the request. Quit, change the setting back to false, start opencode again and start session 3: its request has no learning-mode prompt. | Yes | Round-trip: switch off to on to off across process restarts; check cached behavior before restart, new and resumed sessions after restart, and preservation of generated conversation history. | [R5: restart applies a toggle and toggling back preserves session history](../packages/opencode/test/session/learning-mode.property.test.ts#L300) | None |
| R6 | S-1, S-15, S-22, C-17, C-18, O-19, O-20 | While a session is open, the TUI always shows whether learning mode is on, in the status area under the prompt next to the agent name (build/plan). The label shows the value actually in effect after the config files and the environment variable are combined. It is a persistent label, not a popup. | With project "learning_mode": true and no environment variable, the status area shows "learning: on". With the same config and OPENCODE_LEARNING_MODE=false, it shows "learning: off". Sending a message never opens a dialog about learning mode. | No | Not selected for these properties (TUI status label). | No property test; not implemented yet. | No property |
| R7 | O-17, O-18, C-20–C-23, O-21, O-22 | If OPENCODE_LEARNING_MODE is set to a value that is not empty after trimming and is not recognized under R4, opencode logs one warning when it loads its config (normally once, at startup), naming the variable, the value it received and the accepted values, and keeps running with the config-file setting. | With project "learning_mode": true and OPENCODE_LEARNING_MODE=yes, opencode starts normally and its log contains exactly one warning that contains "OPENCODE_LEARNING_MODE", "yes", and the accepted values true, 1, false and 0; run with --print-logs, the warning is printed to the terminal. The request contains the learning-mode prompt. With OPENCODE_LEARNING_MODE=true or a value that is empty after trimming, no such warning is logged. | Yes | Invariant: an invalid generated value preserves file-based behavior and logs exactly one warning across repeated prompts; recognized and empty/whitespace-only values are negative controls. | [R7: invalid overrides warn once and preserve the configured behavior](../packages/opencode/test/session/learning-mode.property.test.ts#L364) | H1, H4, H5; M1 (red team) |

Properties written or suggested by opencode or another AI tool: all of them. Codex and Claude helped write R1, R2, R3, R4, R5 and R7 in P4; Claude helped write the P5 strengthening (the R4 parser property and the MCP server added to R1); opencode wrote the property in the Agent failure case.

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R4 | Setting OPENCODE_LEARNING_MODE to a recognized value (true, 1, false or 0, in any case) overrides both config files for that process only. It never writes to a config file, and the next run without the variable goes back to the config setting. | Setting OPENCODE_LEARNING_MODE to a recognized value (true, 1, false or 0, ignoring case and leading/trailing whitespace) overrides both config files for that process only. A value that is empty after trimming is treated the same as the variable being absent. The override is never persisted: config settings remain unchanged, and the next run without the variable goes back to the config setting. Normal config initialization may add a missing $schema field; after initialization, both files remain byte-for-byte unchanged across these runs. | Checkability: define surrounding whitespace and empty values. Conflict found in Step 3: the existing loader deliberately inserts missing $schema metadata, independently of the environment override, and an existing config test requires this behavior. The earlier blanket ban on file writes conflicted with that initialization. Permit only that metadata initialization while preserving every persisted setting and requiring exact bytes afterward. Still traces to O-10/O-11 (temporary one-run override, with file settings restored next run) and O-17 (typo handling). |
| R5 | Changing learning_mode while a session is open takes effect from the next message in that same session. Earlier messages and replies stay in the history unchanged, and switching back restores the previous behavior. | Changing learning_mode in a config file takes effect the next time opencode loads that project's config: the next time opencode is started in that project, or when it reloads its config. Until then, the running opencode keeps the setting it loaded. Messages and replies already in a session's history are never changed by the setting, and switching back restores the previous behavior from the next load. | Feasibility: opencode reads a project's config once when it loads that project and caches it for the rest of the run (`Config.state` in `packages/opencode/src/config/config.ts`). Sending a message or starting a new session does not re-read opencode.json; only a restart or a config reload does. Meeting the original "next message in the same session" would need file watching that the design does not have. Keeps what we can guarantee from S-16/S-18 (history unchanged, switching back restores behavior). |
| R7 | If OPENCODE_LEARNING_MODE is set to an unrecognized value, opencode warns the user, naming the variable, the value it received and the accepted values, and keeps running with the config-file setting. | If OPENCODE_LEARNING_MODE is set to a value that is not empty after trimming and is not recognized under R4, opencode logs one warning when it loads its config (normally once, at startup), naming the variable, the value it received and the accepted values, and keeps running with the config-file setting. | Checkability and consistency with revised R4: "unrecognized" is now defined by R4, so a value that is empty after trimming does not warn. "Once" follows O-20 (no repeated popups). Feasibility: opencode reports config problems through its logger (like the existing OPENCODE_PERMISSION warning), which writes to the log file and prints to the terminal only with --print-logs, so the acceptance criteria now say where the warning appears. |

R1, R2, R3 and R6 are kept as written: each is feasible in the current design, they don't conflict (R2 and R3 describe one precedence order: env > project > global > off), and each has acceptance criteria that can be checked against the request or the TUI. R6 is not implemented in the current code (the TUI has no learning-mode label yet), but nothing in the design prevents it; it is outside the selected scope of these properties.

After the P5 strengthening, all seven properties (R1 to R5 and R7, two of them for R4) pass locally.

## Hand-written mutants

The six patches are in [`mutants/xinruil3/`](../mutants/xinruil3/) and were written against the PR #19 code. Apply and test one patch at a time:

1. From the repository root, apply the patch: `git apply mutants/xinruil3/H1.patch`.
2. From `packages/opencode`, run `bun test test/session/learning-mode.property.test.ts`.
3. Return to the repository root and revert the patch: `git apply -R mutants/xinruil3/H1.patch`.

Repeat these steps for H2 through H6, starting each time with the previous patch reverted.

The table below describes the properties **before the H2 and H6 strengthening**. A mutant survived if the tests passed with its patch applied. The changes that later killed H2 and H6 are described in **Strengthening**.

| ID | Requirement targeted | Code change and resulting bug | Expected result before strengthening | Observed result |
|---|---|---|---|---|
| H1 | R4 | In `packages/core/src/flag/flag.ts:75`, remove `.trim()` before `.toLowerCase()`. A padded value such as `" TRUE "` is then rejected, so the config-file setting applies instead of the override. This reintroduces the bug found in P4. | R4 should fail because its fixed example `" TRUE "` must apply an override. R7 should also fail because its recognized inputs `"\tFaLsE "` and `" TrUe\r\n"` would incorrectly produce warnings. | Killed by R4 and R7. |
| H2 | R4 | In `packages/core/src/flag/flag.ts:77`, change `value === "false" \|\| value === "0"` to `value === "false"`. The parser then rejects `0`, although the alias `1` still works. | R4 should fail only if its random cases include a spelling of `0`. Neither fixed example covers that alias, and no other property in this version generates it. | Survived both the initial run with a random seed and the rerun with seed 42. Neither run generated the missing alias. |
| H3 | R3 | In `packages/opencode/src/config/config.ts:587`, replace `Flag.OPENCODE_LEARNING_MODE` with `Flag.OPENCODE_LEARNING_MODE ?? global.learning_mode`. When the environment variable is absent, the global value is applied at the override step and can overwrite the project value. | R3 should fail because it checks both directions of a global/project conflict. R4 should also fail when it removes the environment override and expects the project setting to take effect. R2 should pass because it never gives the two files conflicting settings. | Killed by R3 and R4. R2 passed. |
| H4 | R2 | In `packages/opencode/src/session/prompt.ts:1281`, change `cfg.learning_mode ? …` to `cfg.learning_mode !== false ? …`. An unset value now enables learning mode because `undefined !== false` is true. | R2 should fail for projects where neither file enables learning mode. R7 should fail on its fixed example with no `learning_mode` setting. R1, R3 and R5 use explicit booleans, so their inputs do not expose this change. | Killed by R2 and R7. |
| H5 | R7 | In `packages/opencode/src/config/config.ts:592`, replace `Effect.logWarning` with `Effect.logDebug`. At the default INFO log level, the message is filtered out, including when `--print-logs` is used. | R7 should fail because it expects exactly one WARN entry naming `OPENCODE_LEARNING_MODE`. The other properties do not inspect the logs. | Killed by R7 only. |
| H6 | R1 | In `packages/opencode/src/session/prompt.ts:1276`, split construction of the system prompt into learning-mode-on and learning-mode-off branches, then omit `mcpInstructions` from the on branch. This can remove instructions unrelated to learning mode. | It should survive. The fixture has no MCP server, so there are no MCP instructions for the mutant to remove. | Survived. After removing the expected learning-mode block, R1 found no difference between the requests. |

**Why H2 could survive.** R4 runs eight cases in total. Its two fixed examples count toward that total, leaving six random cases. Under the original generator, each random case has about a 1-in-8 chance of choosing the false alias `0`. The chance of missing that alias in all six cases is therefore `(7/8)^6 ≈ 45%`. The observed survivors are consistent with this gap in input coverage.

**Why H6 could survive.** R1 compares requests with learning mode on and off, allowing only the learning-mode instruction block to differ. That comparison can detect missing MCP instructions, but only if the fixture supplies some. In the original fixture, `mcpInstructions` was `undefined` in both requests. Omitting it from one branch therefore made no observable difference. The fixture needed an MCP server that actually supplied instructions.

## Stryker comparison

**Setup.** The configuration is [`packages/opencode/stryker.xinruil3.config.json`](../packages/opencode/stryker.xinruil3.config.json). It uses the command runner with `bun test --bail test/session/learning-mode.property.test.ts`, so the run executes only my property file. Every `fc.assert` uses `seed: 42`.

The mutation scope contains two source ranges:

- `src/config/config.ts:587-596`: applying the environment override and logging an invalid-value warning.
- `src/session/prompt.ts:1281`: including or omitting the learning-mode prompt.

The report is [`mutants/xinruil3/mutation.html`](../mutants/xinruil3/mutation.html).

**Results before strengthening.** Stryker generated 16 mutants. All 16 were killed; none survived, timed out, or lacked coverage. The mutation score was **100.00%**. I excluded no mutants as equivalent, so the score after equivalent-mutant exclusions was also **100%**.

With `--bail`, the test run stops at the first failing property. The properties run in file order: R1, R2, R3, R4, R5, then R7. The last column below identifies the first property that failed for each mutant. Earlier properties passed in that run; properties after the first failure were not evaluated. For example, an R7 entry means R1 through R5 passed with that mutant applied.

| # | Location | Mutator | Change | First property to fail |
|---|---|---|---|---|
| 0 | config.ts:588 | ConditionalExpression | `if (learningMode !== undefined)` becomes `if (true)` | R1 |
| 1 | config.ts:588 | ConditionalExpression | `if (learningMode !== undefined)` becomes `if (false)` | R4 |
| 2 | config.ts:588 | EqualityOperator | `!==` becomes `===` | R1 |
| 3 | config.ts:588-590 | BlockStatement | The override assignment block is emptied. | R4 |
| 4 | config.ts:591 | ConditionalExpression | The entire warning condition becomes `true`. | R7 |
| 5 | config.ts:591 | ConditionalExpression | The entire warning condition becomes `false`. | R7 |
| 6 | config.ts:591 | LogicalOperator | `&&` becomes `\|\|`. | R7 |
| 7 | config.ts:591 | ConditionalExpression | `learningMode === undefined` becomes `true`. | R7 |
| 8 | config.ts:591 | EqualityOperator | `learningMode === undefined` becomes `learningMode !== undefined`. | R7 |
| 9 | config.ts:591 | MethodExpression | `.trim()` is removed from the warning condition. | R7 |
| 10 | config.ts:591 | OptionalChaining | `?.trim()` becomes `.trim()`. | R1 |
| 11 | config.ts:591-596 | BlockStatement | The warning block is emptied. | R7 |
| 12 | config.ts:593 | StringLiteral | The warning message becomes `""`. | R7 |
| 13 | config.ts:594 | ObjectLiteral | `{ value: ... }` becomes `{}`. | R7 |
| 14 | prompt.ts:1281 | ArrayDeclaration | `[PROMPT_LEARNING_MODE]` becomes `[]`. | R1 |
| 15 | prompt.ts:1281 | ArrayDeclaration | The off branch `[]` becomes `["Stryker was here"]`. | R1 |

### Which hand-written mutants did Stryker never generate, and why?

The report contains none of H1 through H6. Some were outside the configured source ranges; others required changes that the mutation operators used in this run did not produce.

- **H1 and H2:** Both change the parser in `packages/core/src/flag/flag.ts`, which was outside this run's mutation scope. Their changes can be expressed using mutation operators: removing `.trim()` reproduces H1, and replacing `value === "0"` with `false` inside the `||` expression has the same effect as H2. Stryker generated a similar trim-removal mutant in a different place: #9 changes the warning condition in `config.ts`.
- **H3:** This mutant adds the fallback `?? global.learning_mode` to `const learningMode = Flag.OPENCODE_LEARNING_MODE`. The operators used in this run did not introduce that fallback, and the report contains no mutant for line 587.
- **H4:** This mutant changes a ternary condition from `cfg.learning_mode` to `cfg.learning_mode !== false`. The ConditionalExpression mutator in the version used, Stryker 10.1.1, did not mutate this ternary condition. The original condition is also a property read, so it contains no equality operator for EqualityOperator to replace. The report contains only two ArrayDeclaration mutations on this line.
- **H5:** This mutant changes the logging method from `logWarning` to `logDebug`. MethodExpression supports particular built-in methods; it did not substitute Effect's logging methods. Stryker instead generated mutants that removed the warning block (#11), emptied its message (#12), or removed its data (#13).
- **H6:** This mutant changes construction of the system array around line 1279, outside the configured range. It also requires a specific structural change: introduce two branches and omit MCP instructions from only the learning-mode-on branch. The array mutations in this run did not reproduce that behavior.

### Which Stryker survivors would I never have thought of? Are any plausible bugs?

No Stryker mutant survived with seed 42. However, several of the killed mutants tested failure modes I had not included in my hand-written patches:

- **#10, removing optional chaining:** Changing `?.trim()` to `.trim()` makes config loading throw when the environment variable is absent. A developer testing only with the variable set could miss this. R1 caught it because its server starts without the variable.
- **#15, adding text to the off branch:** I had focused on mistakes in the learning-mode-on branch. This mutant changes the system prompt when learning mode is off. A realistic version would add an unnecessary "learning mode is off" instruction. R1 caught the extra text when it compared the requests.
- **#12 and #13, removing warning content:** #12 removes the warning message, including the required explanatory text. #13 removes the data containing the invalid value. R7 checks the required warning contents, so it caught both.
- **#4, #6, #7 and #9, warning for inputs that should be accepted or ignored:** These mutants expose the need for negative controls: recognized values and blank values must not produce an invalid-value warning. Changing `&&` to `||` (#6) or forgetting `.trim()` (#9) is a plausible implementation mistake. #9 resembles the whitespace-handling bug found in P4.
- **#8, reversing the parsed-value check:** This mutant can warn for recognized values and omit warnings for invalid values. The invalid-value cases can therefore kill it even without negative controls.

### What does each approach find that the other doesn't?

**Stryker** applied its mutation operators to the selected source expressions and generated 16 changes. These included a startup crash, missing warning content, and changes to individual parts of the warning condition. The results show that R7's negative controls detect several cases where warnings occur too often. The reported **100%** applies to those 16 mutants in the 11 selected source lines; it does not establish complete coverage of the feature.

**The hand-written mutants** targeted specific requirement failures: incorrect precedence (H3), an incorrect default (H4), the wrong log level (H5), parser errors in another package (H1 and H2), and lost MCP instructions (H6). They exposed two gaps despite the Stryker score. H2 survived because the six random R4 cases missed `0`, and neither fixed example covered it. H6 survived because the fixture supplied no MCP instructions.

## Strengthening

I strengthened the properties to cover the two surviving hand-written mutants.

| Mutant | Change to the properties | Result |
|---|---|---|
| H2 | Added **"R4: every override spelling parses to the value it was built from"**, a model/oracle property at `learning-mode.property.test.ts:273`. It reads `Flag.OPENCODE_LEARNING_MODE` in the test process, avoiding the cost of starting a server for every case. This allows 200 cases. It reuses the `override` and `invalid` generators and includes blank inputs. | With H2 applied, the new parser property failed. The original server-level R4 property still passed in this run. An isolated check shrank the failing input to `{"enabled":false,"value":"0"}`. |
| H6 | Extended R1's generator to optionally configure an MCP server that supplies instructions, using `test/session/learning-mode.mcp-server.ts` and `Scenario.mcp`. When the server is selected, R1 checks that its instructions appear in both requests before comparing them. This prevents the case from passing because both requests lack MCP instructions. | H6 was killed by R1 only. The enabled request omitted the MCP instructions, while the disabled request retained them. The generator includes an MCP server in most cases. |

The new R4 parser property mixes recognized, invalid, and blank inputs with weights of 4:1:1. Under this generator, each case has a 1-in-12 chance of choosing a spelling of `0`.

**Results after the H2 and H6 strengthening, before the red-team changes:**

- Baseline: all seven properties passed with `bun test test/session/learning-mode.property.test.ts` in 208 seconds. These are R1, R2, R3, two R4 properties, R5, and R7.
- Stryker rerun with seed 42: **16 of 16 killed, 100.00%**. No mutants were excluded as equivalent, so the adjusted score was also **100%**.
- Hand-written mutants: **6 of 6 killed**. H1, H3, H4 and H5 were already detected; the new cases detected H2 and H6.

## Agent failure case

The P4 properties were written with help from Codex and Claude, rather than opencode. For this experiment, I asked opencode to write a separate R7 property. I ran it from this repository with `bun dev`, using the Build agent and model GPT-5.6 Luna. The session took about four and a half minutes, around 8:36–8:40 AM on November 9.

**Transcript:** [shared opencode session](https://opncd.ai/share/TzMvC14S).

I gave it this prompt:

> Write one fast-check property test for this requirement of the learning-mode feature, in a new file packages/opencode/test/session/learning-mode.opencode.property.test.ts:
>
> R7: If OPENCODE_LEARNING_MODE is set to a value that is not empty after trimming and is not recognized (recognized values are true, 1, false or 0, ignoring case and leading/trailing whitespace), opencode logs one warning when it loads its config (normally once, at startup), naming the variable, the value it received and the accepted values, and keeps running with the config-file setting.
>
> Use the helpers in packages/opencode/test/session/learning-mode.fixture.ts (withLearningMode, config, fixture.start(value), fixture.send, and server.stop(), which returns the server logs). Write the property yourself: do not read or copy packages/opencode/test/session/learning-mode.property.test.ts. Use fc.assert with { seed: 42, numRuns: 4 }, because every case starts real opencode servers. Do not change any other file. When you are done, run only your new file from packages/opencode: bun test test/session/learning-mode.opencode.property.test.ts

The instruction not to open my property file was intended to make opencode design its own test. It followed that instruction.

The following excerpts are from `/export`, with tool calls omitted. After reading the fixture, opencode said:

> The fixture starts real isolated servers and exposes the exact config path, prompt sender, and startup logs needed for this requirement. I'm checking the production warning shape and learning-mode observable before writing the property so assertions stay behavioral rather than implementation-specific.

It then read `config.ts` lines 570–607 and `learning-mode.txt` and described its plan:

> I'll add one property using safe generated non-empty invalid values and both boolean config-file settings. Each case will start one server, send one real prompt to prove the server remains functional and preserves the file setting, then inspect stopped-server logs for exactly one warning containing the required details.

The first test run exceeded Bun's default five-second timeout:

> The requested test command ran, but Bun's per-test default timeout (5 seconds) expired while the real server cases were still running. I'm adjusting only the new test's timeout, then rerunning the same command; no production or fixture files will change.

After increasing the timeout, the second run passed: `1 pass, 0 fail, 40 expect() calls` in 9.86 seconds. Its final response reported "Added `packages/opencode/test/session/learning-mode.opencode.property.test.ts` ... Result: 1 pass, 0 failures."

**What the original property checked.** The property is in commit `03e6d3e`, in `learning-mode.opencode.property.test.ts`. It generates non-empty invalid strings from letters, spaces, and `_-+.`, excluding recognized values. For each case, it checks that the server remains usable, the request follows the config-file setting, and the logs contain exactly one warning with the variable name, received value, and accepted values.

My prompt explicitly described the invalid-value behavior, but it did not include the no-warning acceptance criteria from the full requirements. The generated property covered invalid inputs and omitted recognized values, blank values, and an unset variable. That omission reflects a gap in both the prompt I supplied and the coverage I accepted.

The property also copied the exact warning string from `config.ts` into an assertion. This ties part of the test to the implementation's current wording, even though the requirement specifies the information the warning must contain.

**Hand-written mutant results.** Tested separately, H1, H2, H3, H4 and H6 survived; only H5 was killed. H1 and H2 expose the missing warning checks:

- **H1:** Without `.trim()`, the valid padded value `" TRUE "` is rejected and produces a warning.
- **H2:** Without the `0` alias, `OPENCODE_LEARNING_MODE=0` is rejected and produces a warning.

H3, H4 and H6 target precedence, the default value, and preservation of unrelated instructions. Those correspond to R3, R2 and R1, respectively. This R7 property was not designed to cover all three.

**Stryker results before strengthening.** With seed 42, the property had a reported score of **50%**: 7 mutants were killed, 1 timed out, and 8 survived. The report is [`mutants/xinruil3/agent-before.html`](../mutants/xinruil3/agent-before.html).

Using the mutant IDs from the earlier table, the survivors were:

- **#4, #6, #7 and #9:** Changes that can produce warnings for inputs outside the invalid-value category.
- **#10:** Removing optional chaining, which makes startup fail when the variable is absent.
- **#1 and #3:** Ignoring the environment override.
- **#15:** Adding text to the learning-mode-off branch.

**Why these cases escaped.** The generator only supplied invalid values. It never supplied a recognized override, a blank value, or an absent variable. As a result, it could not expose failures that depended on those inputs. For example, ignoring an override makes no difference when the supplied value is invalid and should already fall back to the config file.

Two assertions also offered less protection than they appeared to. Checking `toContain("OPENCODE_LEARNING_MODE")` added nothing once the test had already matched an exact warning string containing that name. Checking `toContain(value)` against the logs could pass by coincidence if a short generated value appeared elsewhere. The missing input categories were the main coverage gap; these assertion issues did not explain every survivor.

**Strengthening the agent-written property.** In commit `886933a`, I kept the original assertions and added cases that must produce no invalid-value warning:

- Every generated case now tests all four recognized spellings: `true`, `1`, `false`, and `0`. Padding and letter case are generated. Each spelling must apply the corresponding boolean override and produce no warning. Because all four are tested in every case, coverage of the numeric aliases does not depend on the seed.
- Every case also starts one server with a blank value and another with the variable absent. Both must use the config-file setting and produce no warning.

**Results with seed 42:**

| Check | Original opencode property | Strengthened property |
|---|---|---|
| Baseline | Passed: 9.9 seconds, 40 assertions. | Passed: 55 seconds, 208 assertions. |
| H1 | Survived. | **Killed.** |
| H2 | Survived. | **Killed.** |
| H5 | Killed. | Killed. |
| H3, H4, H6 | Survived. | Survived. |
| Stryker, all selected mutants | **50.00%**: 7 killed, 1 timed out, 8 survived. | **93.75%**: 14 killed, 1 timed out, 1 survived. |
| Stryker, selected mutants in `config.ts` | **50.00%** | **100.00%** |

The reported overall scores include the timeout: `(7 + 1) / 16 = 50%` before strengthening and `(14 + 1) / 16 = 93.75%` afterward. The table keeps timeout results separate from killed mutants.

Reports: [`agent-before.html`](../mutants/xinruil3/agent-before.html) and [`agent-after.html`](../mutants/xinruil3/agent-after.html).

The only remaining Stryker survivor was #15, which adds `"Stryker was here"` to the system prompt when learning mode is off. That change concerns R1's request-preservation requirement, and my R1 property kills it. My own R3, R2 and R1 properties also kill H3, H4 and H6, respectively.

## Red team

Alex de Leeuw (adeleeuw) submitted three mutants against commit `7901d1c` in a [comment on PR #19](https://github.com/CMU-313/fall-26-opencode-seg-fault/pull/19#issuecomment-6784089806). His patches are in [`mutants/adeleeuw/redteam/`](https://github.com/adeleeuw17/fall-26-opencode-seg-fault/tree/redteam/adeleeuw-vs-xinruil3-learning-mode/mutants/adeleeuw/redteam) on his branch.

The posted patches have incorrect hunk line counts. Apply each patch separately with `git apply --recount <patch-path>`. Then run `bun test test/session/learning-mode.property.test.ts` from `packages/opencode`. From the repository root, revert the same patch with `git apply -R --recount <patch-path>` before testing another mutant.

| ID | Requirement targeted | Code change and resulting bug | Result on `7901d1c`, seed 42 | Response |
|---|---|---|---|---|
| M1 | R4 | In `flag.ts`, replace `trim()` with `trimEnd()`. Leading whitespace remains, so a valid value such as `" TRUE "` is rejected. | Killed by the server-level R4 property, the R4 parser property, and R7. | No additional test change was needed. |
| M2 | R3 | In `config.ts`, merge the global config after the project configs. Conflicting global settings then overwrite project settings. | Killed by R3 and the server-level R4 property. | No additional test change was needed. |
| M3 | R1 | In `prompt.ts`, omit the learning-mode prompt when the request uses the `json_schema` structured-output format. | Survived. | Added structured-output requests to R1. |

**Why M3 survived.** Before this change, none of the properties sent a structured-output request. Every generated request used the plain-text path, where M3 left behavior unchanged. M3 is not equivalent to the original program: when learning mode is enabled for a `json_schema` request, it removes the learning-mode instructions that R1 requires.

**Intermittent test failures.** The first run with M3 also reported failures in R1 and R5. These included a send recording zero model calls when the fixture expected one, as well as timeouts. R5 showed the same failure without any mutant applied, and R1 passed with M3 applied when run separately, in 21 seconds. Those results did not provide a reliable indication that the properties had detected M3.

After strengthening, R1 had another intermittent failure: one send recorded 96 model calls. It then passed three consecutive runs on its own. The baseline suite was green in CI on `7901d1c`. The table below distinguishes that full baseline run from the checks performed after strengthening.

**Strengthening R1.** Each generated case now ends with a structured-output request in both the learning-mode-disabled and learning-mode-enabled sessions. It reuses the first generated question and chooses a schema field name from `answer`, `hint`, or `next_step`.

The fixture's `send()` helper now accepts an optional schema field name. When supplied, it sends a request with the `json_schema` format, and the simulated model responds through the `StructuredOutput` tool. The helper checks that the reply contains the structured result. This check prevents a plain-text fallback from satisfying the test.

Every generated case includes this request, so structured-output coverage does not depend on the seed. R1 applies its existing request-comparison assertions to the new requests without changing those assertions. The property remains **"R1: toggling learning mode preserves the rest of every model request"**, at `learning-mode.property.test.ts:84`.

**Results with seed 42:**

| Check | Before the M3 strengthening | After the M3 strengthening |
|---|---|---|
| Baseline | All seven properties passed in CI on `7901d1c`. | The other six properties passed: R2, R3, both R4 properties, R5, and R7. R1 passed three consecutive runs on its own. The separate agent-written property and typecheck also passed. |
| M3 | Survived; R1 passed with M3 applied. | **Killed by R1:** the enabled structured-output request lacked the learning-mode block. |
| H6 | Killed by R1. | Still killed by R1. |

AI help: Claude helped analyze the three red-team mutants and write the R1 strengthening. I ran every check reported in this section.

