# Traceability: Leo Liu (xinruil3)

**Target feature:** Learning Mode Configuration (#11): the `learning_mode` setting, set in the global or project `opencode.json` or for one run with `OPENCODE_LEARNING_MODE`. Main files: `packages/core/src/config.ts`, `packages/core/src/v1/config/config.ts`, `packages/core/src/v1/config/migrate.ts`, `packages/core/src/flag/flag.ts`, `packages/opencode/src/config/config.ts`, `packages/opencode/src/session/prompt.ts`, `packages/opencode/src/session/prompt/learning-mode.txt`.

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills |
|---|---|---|---|---|---|---|---|
| R1 | C-4, C-5, S-13, O-3 | Enabling or disabling learning mode must preserve the selected model, tool definitions, user messages, conversation history, and all other system instructions. The only change to the request's instructional content is the addition or removal of the learning-mode instructions. | In two otherwise identical fresh sessions in the same project, send the same message with learning_mode set to false and true respectively. Compare the captured requests after excluding generated request IDs and timestamps, if present. The model, tool definitions, and non-system messages are identical. Removing the learning-mode instructions from the enabled request's system prompt yields the disabled request's system prompt. | No | Invariant: for generated models, tool settings, instructions and conversation histories, toggling learning mode changes only the learning-mode instruction block in each captured request. | [R1: toggling learning mode preserves the rest of every model request](../packages/opencode/test/session/learning-mode.property.test.ts#L78) | H6 (after strengthening) |
| R2 | S-14, O-4, O-13, O-14 | A learning_mode setting in a project's opencode.json applies only to that project. The global setting supplies the default for all projects unless overridden by a project setting or OPENCODE_LEARNING_MODE. Within the same project, enabling learning mode globally or locally produces the same learning-mode instructions. If neither file sets it and the environment variable is absent, learning mode is off. | In all cases below, OPENCODE_LEARNING_MODE is absent. Use two projects, A and B, where B has no opencode.json. (1) Global unset, A sets "learning_mode": true: A's request contains the learning-mode prompt and B's does not. (2) Global sets true, A unset: requests from both A and B contain it, and A's request contains the same learning-mode instructions as in case (1). (3) Neither file sets it: neither request contains it. | No | Metamorphic: moving learning_mode from project A to global preserves A's instructions and enables B; removing both settings disables both projects. | [R2: moving the setting from project to global changes only its scope](../packages/opencode/test/session/learning-mode.property.test.ts#L127) | H4 |
| R3 | O-15, O-16 | When OPENCODE_LEARNING_MODE is not set and the global and project configs disagree, the project setting decides. | With OPENCODE_LEARNING_MODE absent: global "learning_mode": true with project false: the request contains no learning-mode prompt. Global false with project true: the request contains it. | No | Model / oracle: for both conflicting boolean pairs, the effective config and captured request agree with the project-setting oracle. | [R3: conflicting configs agree with the project-setting oracle](../packages/opencode/test/session/learning-mode.property.test.ts#L167) | H3 |
| R4 | O-10, O-11, O-17 | Setting OPENCODE_LEARNING_MODE to a recognized value (true, 1, false or 0, ignoring case and leading/trailing whitespace) overrides both config files for that process only. A value that is empty after trimming is treated the same as the variable being absent. The override is never persisted: config settings remain unchanged, and the next run without the variable goes back to the config setting. Normal config initialization may add a missing $schema field; after initialization, both files remain byte-for-byte unchanged across these runs. | Set global learning_mode to false and project learning_mode to true. Launch run 1 with OPENCODE_LEARNING_MODE=false: its request contains no learning-mode instructions. Launch run 2 with the variable absent: its request contains the learning-mode instructions. Repeat with global true and project false and OPENCODE_LEARNING_MODE=true. In both cases, all persisted settings remain unchanged; a first load may only add missing $schema metadata. Files that already have $schema remain byte-for-byte unchanged from the start, and initialized file bytes remain unchanged on subsequent runs with the variable absent or empty. OPENCODE_LEARNING_MODE=" TRUE " behaves like true; empty and whitespace-only values behave like the variable is absent. | Yes | Round-trip: apply a generated recognized environment override, then launch separate processes with the variable absent and empty; verify file-based behavior returns, no override is persisted, and file bytes remain unchanged after normal initialization. P5 adds a model/oracle property: 200 generated spellings, read in-process, must parse to the value they were built from. | [R4: a one-process override returns to unchanged file configuration](../packages/opencode/test/session/learning-mode.property.test.ts#L196)<br>[R4: every override spelling parses to the value it was built from](../packages/opencode/test/session/learning-mode.property.test.ts#L262) | H1, H3; H2 (after strengthening, parser property) |
| R5 | C-10, C-11, S-16, S-18, O-8 | Changing learning_mode in a config file takes effect the next time opencode loads that project's config: the next time opencode is started in that project, or when it reloads its config. Until then, the running opencode keeps the setting it loaded. Messages and replies already in a session's history are never changed by the setting, and switching back restores the previous behavior from the next load. | Start opencode with project "learning_mode": false, open session 1 and send message 1: its request has no learning-mode prompt. Quit opencode, edit the project opencode.json to true, and start opencode again. Start session 2 and send a message: its request contains the learning-mode prompt. Resume session 1 and send message 2: its request contains the learning-mode prompt, and message 1 and its reply are unchanged in the request. Quit, change the setting back to false, start opencode again and start session 3: its request has no learning-mode prompt. | Yes | Round-trip: switch off to on to off across process restarts; check cached behavior before restart, new and resumed sessions after restart, and preservation of generated conversation history. | [R5: restart applies a toggle and toggling back preserves session history](../packages/opencode/test/session/learning-mode.property.test.ts#L289) | None |
| R6 | S-1, S-15, S-22, C-17, C-18, O-19, O-20 | While a session is open, the TUI always shows whether learning mode is on, in the status area under the prompt next to the agent name (build/plan). The label shows the value actually in effect after the config files and the environment variable are combined. It is a persistent label, not a popup. | With project "learning_mode": true and no environment variable, the status area shows "learning: on". With the same config and OPENCODE_LEARNING_MODE=false, it shows "learning: off". Sending a message never opens a dialog about learning mode. | No | Not selected for these properties (TUI status label). | No property test; not implemented yet. | No property |
| R7 | O-17, O-18, C-20–C-23, O-21, O-22 | If OPENCODE_LEARNING_MODE is set to a value that is not empty after trimming and is not recognized under R4, opencode logs one warning when it loads its config (normally once, at startup), naming the variable, the value it received and the accepted values, and keeps running with the config-file setting. | With project "learning_mode": true and OPENCODE_LEARNING_MODE=yes, opencode starts normally and its log contains exactly one warning that contains "OPENCODE_LEARNING_MODE", "yes", and the accepted values true, 1, false and 0; run with --print-logs, the warning is printed to the terminal. The request contains the learning-mode prompt. With OPENCODE_LEARNING_MODE=true or a value that is empty after trimming, no such warning is logged. | Yes | Invariant: an invalid generated value preserves file-based behavior and logs exactly one warning across repeated prompts; recognized and empty/whitespace-only values are negative controls. | [R7: invalid overrides warn once and preserve the configured behavior](../packages/opencode/test/session/learning-mode.property.test.ts#L353) | H1, H4, H5 |

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

Each mutant is a patch in [`mutants/xinruil3/`](../mutants/xinruil3/) against the PR #19 code. To run it: `git apply mutants/xinruil3/H1.patch`, then `(cd packages/opencode && bun test test/session/learning-mode.property.test.ts)`, then `git apply -R mutants/xinruil3/H1.patch` to revert.

| ID | Requirement targeted | Change | Predicted killer | Actual result |
|---|---|---|---|---|
| H1 | R4 | `packages/core/src/flag/flag.ts:75`: `.trim()` is removed before `.toLowerCase()`, so a padded value such as `" TRUE "` is no longer recognized and the config file decides instead. This is the bug found in P4, reintroduced as a regression. | R4 ("a one-process override returns to unchanged file configuration"): its override generator pads recognized values with spaces, tabs and newlines, and the fixed example `" TRUE "` runs every time, so the overridden request will lack the learning-mode prompt. R7 should also kill it: its recognized negative controls `"\tFaLsE "` and `" TrUe\r\n"` would now log a warning. | Killed by R4 and R7, as predicted. |
| H2 | R4 | `packages/core/src/flag/flag.ts:77`: the numeric alias for false is dropped (`value === "false" \|\| value === "0"` becomes `value === "false"`), so `OPENCODE_LEARNING_MODE=0` is treated as unrecognized while `1` still works. | R4, but only sometimes. `"0"` is generated only when the override is false and the word draw picks `"0"` (about 1 in 8 generated cases), and neither fixed example uses it. R4 runs 8 cases and its 2 fixed examples count toward them, so only 6 are random; the chance that none of them is `"0"` is (7/8)^6 ≈ 45%, so the result depends on the seed. No other property generates `"0"`. | Survived, both in a first run with a random seed and in a re-run with seed 42. In both runs none of R4's 6 random cases was `"0"` with a false override, so the missing alias was never exercised. This matches the prediction that R4 catches it only when `"0"` happens to be generated. After strengthening, the new parser property kills it (see Strengthening). |
| H3 | R3 | `packages/opencode/src/config/config.ts:587`: `Flag.OPENCODE_LEARNING_MODE` becomes `Flag.OPENCODE_LEARNING_MODE ?? global.learning_mode`. This is a plausible reading of "the global setting supplies the default", but it makes the global value beat the project value. | R3 ("conflicting configs agree with the project-setting oracle"): it checks both conflict directions in every run, so it should fail every time. R4 should also kill it, because its run without the override has global and project disagreeing. R2 should not kill it, because R2 never sets both files at once. | Killed by R3 and R4, as predicted. R2 passed, so R2 alone does not detect a global-over-project precedence bug. |
| H4 | R2 | `packages/opencode/src/session/prompt.ts:1281`: `cfg.learning_mode ? …` becomes `cfg.learning_mode !== false ? …`, so an unset setting counts as on. | R2 ("moving the setting from project to global changes only its scope"): project B has no setting in case (1), and neither file sets it in case (3), so those requests will contain the prompt. R7 should also kill it through its fixed example whose config file has no `learning_mode`. R1, R3 and R5 always set an explicit boolean, so they cannot. | Killed by R2 and R7, as predicted. |
| H5 | R7 | `packages/opencode/src/config/config.ts:592`: `Effect.logWarning` becomes `Effect.logDebug`. The default log level is INFO, so the warning is silently dropped, even with `--print-logs`. | R7 ("invalid overrides warn once and preserve the configured behavior"): it requires exactly one WARN line naming `OPENCODE_LEARNING_MODE`, and with this mutant there are none. No other property reads the logs. | Killed by R7 only, as predicted. |
| H6 | R1 | `packages/opencode/src/session/prompt.ts:1276`: the system prompt is refactored into two branches (learning mode on and off), and the learning-mode branch forgets `mcpInstructions`. Everything else is the same, so it looks like a harmless refactor. | Survives. R1 compares the whole request with learning mode on and off, so in principle it covers this. But the fixture configures no MCP servers, so `mcpInstructions` is `undefined` in both requests and both branches build the same prompt. The generator never reaches the case this mutant breaks. | Survived, as predicted. With no MCP server in the fixture, `mcpInstructions` is `undefined` in both requests, so R1 sees identical prompts. After strengthening, R1 kills it (see Strengthening). |


## Stryker comparison

**Setup.** Config: [`packages/opencode/stryker.xinruil3.config.json`](../packages/opencode/stryker.xinruil3.config.json). It uses the command runner with `bun test --bail test/session/learning-mode.property.test.ts`, so only my property file runs. It mutates only the lines my requirements cover: `src/config/config.ts:587-596` (the environment override and its warning) and `src/session/prompt.ts:1281` (adding the learning-mode prompt). The fast-check seed is **42**, passed as `seed: 42` to every `fc.assert`. Report: [`mutants/xinruil3/mutation.html`](../mutants/xinruil3/mutation.html).

**Score (first run, before strengthening).** 16 mutants: 16 killed, 0 survived, 0 timed out, 0 without coverage. Stryker's score is **100.00%**. I claim no equivalent mutants (every mutant was killed, so none can be equivalent), so the score with equivalent mutants excluded is also **100%**.

The table lists every Stryker mutant. Because of `--bail`, bun stops at the first failing test and runs the properties in file order (R1, R2, R3, R4, R5, R7). So "first property to fail" is the earliest property that kills the mutant, and every property before it passed. For example, "R7" means R1 to R5 all missed that mutant.

| # | Location | Mutator | Change | First property to fail |
|---|---|---|---|---|
| 0 | config.ts:588 | ConditionalExpression | `if (learningMode !== undefined)` becomes `if (true)` | R1 |
| 1 | config.ts:588 | ConditionalExpression | `if (learningMode !== undefined)` becomes `if (false)` | R4 |
| 2 | config.ts:588 | EqualityOperator | `!==` becomes `===` | R1 |
| 3 | config.ts:588-590 | BlockStatement | the override assignment block is emptied | R4 |
| 4 | config.ts:591 | ConditionalExpression | the whole warning condition becomes `true` | R7 |
| 5 | config.ts:591 | ConditionalExpression | the whole warning condition becomes `false` | R7 |
| 6 | config.ts:591 | LogicalOperator | `&&` becomes `\|\|` | R7 |
| 7 | config.ts:591 | ConditionalExpression | `learningMode === undefined` becomes `true` | R7 |
| 8 | config.ts:591 | EqualityOperator | `learningMode === undefined` becomes `!== undefined` | R7 |
| 9 | config.ts:591 | MethodExpression | `.trim()` is removed from the warning condition | R7 |
| 10 | config.ts:591 | OptionalChaining | `?.trim()` becomes `.trim()` | R1 |
| 11 | config.ts:591-596 | BlockStatement | the warning block is emptied | R7 |
| 12 | config.ts:593 | StringLiteral | the warning message becomes `""` | R7 |
| 13 | config.ts:594 | ObjectLiteral | `{ value: ... }` becomes `{}` | R7 |
| 14 | prompt.ts:1281 | ArrayDeclaration | `[PROMPT_LEARNING_MODE]` becomes `[]` | R1 |
| 15 | prompt.ts:1281 | ArrayDeclaration | the off branch `[]` becomes `["Stryker was here"]` | R1 |

### Which hand-written mutants did Stryker never generate, and why?

None of H1 to H6 appear in the report. The reasons differ:

- **H1 and H2** are in `packages/core/src/flag/flag.ts`. Stryker runs inside `packages/opencode` and can only mutate files in that package, so the flag parser is out of its reach. Stryker does have operators for both changes. MethodExpression removes `.trim()`, which is H1. ConditionalExpression turns `value === "0"` inside `||` into `false`, which behaves exactly like H2. So both would have been generated if the parser were in scope. Stryker did make the H1 kind of change in `config.ts`: mutant 9 removes `.trim()` from the warning condition.
- **H3** adds new code (`?? global.learning_mode`). Stryker only replaces or deletes code that already exists and never adds an operand. Line 587 (`const learningMode = Flag.OPENCODE_LEARNING_MODE`) has no operator at all, so Stryker made no mutant on it.
- **H4** changes the condition of a `? :` expression. In Stryker 10.1.1 the ConditionalExpression mutator does not touch ternary conditions (that case is commented out in its source). `cfg.learning_mode` is a plain property read, not a comparison, so EqualityOperator does not apply either. Line 1281 got only the two ArrayDeclaration mutants.
- **H5** swaps `logWarning` for `logDebug`. MethodExpression only swaps a fixed list of built-in methods, such as `trim`, `toLowerCase`/`toUpperCase`, `startsWith`/`endsWith` and `min`/`max`, and Effect's logging methods are not on it. Instead, Stryker deleted the warning (11), emptied its message (12) or emptied its data (13).
- **H6** is a two-branch refactor of the system array on line 1279, outside my mutate range. Even inside the range, ArrayDeclaration replaces a whole array with `[]`. It never drops one element or rewrites code into branches.

### Which Stryker survivors would I never have thought of? Are any plausible bugs?

No Stryker mutant survived with seed 42, so there are no survivors to discuss. Several killed mutants were ones I would not have written myself:

- **10** (`?.trim()` becomes `.trim()`): when the variable is unset, loading the config throws and the server never starts. This is a plausible bug for a developer who only ever tests with the variable set. R1 caught it because it runs without the variable.
- **15** (`"Stryker was here"` in the off branch): I only thought about the on branch going wrong. A realistic version is a developer adding a "learning mode is off" note to the off branch. R1 caught it because it compares the whole request.
- **12 and 13** (empty warning message, or warning data without the value): a plausible bug is logging the warning without the bad value. R7 caught both because it checks for the value and for the accepted words.
- **4, 6, 7, 8 and 9** each make the warning condition fire too often. R7 kills them only because of its negative controls: a recognized padded value and a blank value must not warn. 6 (`&&` to `||`) and 9 (dropping `.trim()`) are plausible slips. 9 is the same kind of bug I found in P4.

### What does each approach find that the other doesn't?

- **Stryker** is systematic. It tried every operator in the covered lines, including ones I never targeted: a crash when the variable is unset, the contents of the log line, and each part of the warning condition. It also showed that every negative control in R7 is needed. Its limits: it only makes small syntactic changes, never adds code, and only sees the files and lines I give it. A 100% score here covers 16 mutants on 11 lines, not the whole feature.
- **Hand-written mutants** come from the requirements, so they test meaning: which setting wins (H3), the default when nothing is set (H4), the log level (H5), the parser in another package (H1, H2), and a refactor that drops an unrelated input (H6). They found two real gaps while Stryker reported 100%. H2 survived because 8 server-level runs rarely draw `"0"`. H6 survived because the fixture never configures an MCP server.

## Strengthening

| Mutant | What I changed | Result after the change |
|---|---|---|
| H2 | New property **"R4: every override spelling parses to the value it was built from"** (kind: model/oracle, `learning-mode.property.test.ts:262`). It reads `Flag.OPENCODE_LEARNING_MODE` in-process, so it can afford 200 cases. It reuses the `override` and `invalid` generators and adds blank values. Recognized values are weighted 4:1:1, so each case has a 1 in 12 chance of being `"0"`. | Killed. The full file with H2 applied fails only on the new parser property; the server-level R4 still passes, so it still never draws `"0"`. In an isolated check the shrunk counterexample was `{"enabled":false,"value":"0"}`. |
| H6 | R1 now draws an optional MCP server that sends instructions (new fixture `test/session/learning-mode.mcp-server.ts`, and `Scenario.mcp` in the fixture config). It also checks that the instructions really appear in both requests, so a case cannot pass by having no MCP block at all. | Killed by R1 only. With H6 applied, the learning-mode request is missing the MCP instructions, and R1 fails (it now configures an MCP server in most cases). |

Equivalent mutants: none claimed.

Baseline after strengthening: all 7 properties pass (`bun test test/session/learning-mode.property.test.ts`, 208 s).

**Final score (after strengthening, seed 42).** Stryker re-run: 16 / 16 killed, **100.00%**. Excluding equivalent mutants (none): **100%**. Hand-written mutants: **6 / 6 killed** (H1, H3, H4 and H5 were already killed, and H2 and H6 are now killed too).


## Agent failure case

None of my P4 properties came from opencode, so I asked opencode (running from this repository with `bun dev`, Build agent, model GPT-5.6 Luna) to write a new property for R7. The session took about four and a half minutes (8:36 to 8:40 AM on 11/9).

**Transcript.** Share link: https://opncd.ai/share/TzMvC14S. Prompt:

> Write one fast-check property test for this requirement of the learning-mode feature, in a new file packages/opencode/test/session/learning-mode.opencode.property.test.ts:
>
> R7: If OPENCODE_LEARNING_MODE is set to a value that is not empty after trimming and is not recognized (recognized values are true, 1, false or 0, ignoring case and leading/trailing whitespace), opencode logs one warning when it loads its config (normally once, at startup), naming the variable, the value it received and the accepted values, and keeps running with the config-file setting.
>
> Use the helpers in packages/opencode/test/session/learning-mode.fixture.ts (withLearningMode, config, fixture.start(value), fixture.send, and server.stop(), which returns the server logs). Write the property yourself: do not read or copy packages/opencode/test/session/learning-mode.property.test.ts. Use fc.assert with { seed: 42, numRuns: 4 }, because every case starts real opencode servers. Do not change any other file. When you are done, run only your new file from packages/opencode: bun test test/session/learning-mode.opencode.property.test.ts

I told it not to read my own property file, so that it would design the property itself instead of copying my R7.

Response (excerpts from `/export`, tool calls omitted). After reading the fixture, it said:

> The fixture starts real isolated servers and exposes the exact config path, prompt sender, and startup logs needed for this requirement. I'm checking the production warning shape and learning-mode observable before writing the property so assertions stay behavioral rather than implementation-specific.

It then read `config.ts` lines 570 to 607 and `learning-mode.txt`, and planned the property:

> I'll add one property using safe generated non-empty invalid values and both boolean config-file settings. Each case will start one server, send one real prompt to prove the server remains functional and preserves the file setting, then inspect stopped-server logs for exactly one warning containing the required details.

Its first run failed because Bun's default 5-second test timeout expired:

> The requested test command ran, but Bun's per-test default timeout (5 seconds) expired while the real server cases were still running. I'm adjusting only the new test's timeout, then rerunning the same command; no production or fixture files will change.

The second run passed (`1 pass, 0 fail, 40 expect() calls`, 9.86 s), and it finished with "Added `packages/opencode/test/session/learning-mode.opencode.property.test.ts` ... Result: 1 pass, 0 failures."

Two things in the transcript explain the result below. Its plan only ever mentions "non-empty invalid values", so it never considered the half of R7 that says which values must not warn. And although it said it wanted assertions that are "behavioral rather than implementation-specific", it copied the exact warning string from `config.ts` into its oracle. It did follow my instruction not to open my property file.

The property it wrote is in commit `03e6d3e` (`learning-mode.opencode.property.test.ts`, before strengthening). It generates random strings of letters, spaces and `_-+.`, filters out the recognized words, and checks that the log contains the warning exactly once, the value, the variable name and the accepted values, and that the request follows the config file.

**Mutants it let survive.** It passed with H1, H2, H3, H4 and H6 applied, and killed only H5. The two that matter for R7 are:

- **H1** (`flag.ts` stops trimming): `" TRUE "` is no longer recognized, so opencode warns about a value R7 says is valid.
- **H2** (`flag.ts` drops the `"0"` alias): `OPENCODE_LEARNING_MODE=0` now warns and is ignored.

H3, H4 and H6 break other requirements (R3, R2 and R1), so this property is not expected to catch them.

Stryker with the same seed scored the property **50%** (7 killed, 1 timed out, 8 survived; report: [`mutants/xinruil3/agent-before.html`](../mutants/xinruil3/agent-before.html)). The survivors in R7's code were the warning condition replaced by `true` (#4), `&&` changed to `||` (#6), `learningMode === undefined` replaced by `true` (#7), `.trim()` removed (#9) and `?.trim()` changed to `.trim()` (#10). The override being ignored (#1, #3) and the text added to the off branch (#15) also survived.

**Why the property was too weak.** Its generator never reaches the bug. R7 has two halves: unrecognized values must warn, and recognized values, blank values and an unset variable must not. The generator filters out every recognized value and never leaves the variable blank or unset. So every mutant that makes the warning fire too often, or breaks a valid spelling, behaves exactly like the original on every input it can produce. Two of its assertions are also weaker than they look. `toContain("OPENCODE_LEARNING_MODE")` is already implied by the exact warning text it checks first. `toContain(value)` can pass by coincidence when a short value appears elsewhere in the logs.

**Strengthened version.** I kept every original assertion and added negative controls to the same property (commit `886933a`):

- Every case starts a server for each of the four recognized words (`true`, `1`, `false`, `0`) with generated padding and letter case. Each must apply its own value and log no warning. Checking all four words in every case means the numeric aliases are always tested and do not depend on the seed.
- Every case also starts a server with a blank value and one with the variable unset. Both must keep the config-file setting and log no warning.

**Evidence.** All with seed 42.

| | Original (opencode) | Strengthened |
|---|---|---|
| Baseline | passes (9.9 s, 40 assertions) | passes (55 s, 208 assertions) |
| H1 | survived | **killed** |
| H2 | survived | **killed** |
| H5 | killed | killed |
| H3, H4, H6 (other requirements) | survived | survived |
| Stryker | 50.00% (7 killed, 1 timed out, 8 survived) | **93.75%** (14 killed, 1 timed out, 1 survived) |
| Stryker on `config.ts` (R7's code) | 50.00% | **100.00%** |

Reports: [`agent-before.html`](../mutants/xinruil3/agent-before.html) and [`agent-after.html`](../mutants/xinruil3/agent-after.html). The only remaining survivor is #15 (`"Stryker was here"` added to the learning-mode-off branch in `prompt.ts`). That is not R7 behavior, and my R1 property kills it. H3, H4 and H6 break R3, R2 and R1, and my own properties for those requirements kill them.
