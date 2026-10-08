# Progressive Hint Mode — User Guide

## Overview

Progressive Hint Mode provides users with different levels of assistance while
working with OpenCode. The feature is composed of three components:

- **Hint-Level Selection (#10)** — Anna
- **Learning Mode Configuration (#11)** — Leo
- **Hint-Only Response Mode (#9)** — Lily

This guide explains how to use and manually verify each component, as well as
where the corresponding automated tests are located.


---

# 1. Hint-Level Selection (#10)

**Contributor:** Anna

## Feature Description

Hint-Level Selection lets users choose how much guidance they want from OpenCode. Users can choose between subtle, moderate, and detailed hints, which change the instructions sent to the model.

## How to Use

1. Start OpenCode in the terminal.
2. Enter `/hint subtle`, `/hint moderate`, or `/hint detailed`.
3. Enter a programming question normally.
4. Use `/hint` again to change levels, or `/hint none` to disable the selected level.

## Manual User Testing

1. Start OpenCode with a model provider connected.
2. Enter `/hint subtle` and ask a programming question, such as "How can I reverse a linked list in Python?"
3. Ask the same question using `/hint moderate` and `/hint detailed`.
4. Verify that subtle gives the least guidance, moderate gives more guidance, and detailed gives the most guidance.
5. Enter `/hint none` and verify that the selected hint level is disabled.

### Expected Result

OpenCode should recognize the selected level and provide different amounts of guidance for subtle, moderate, and detailed.

## Automated Tests

**Test location:**  
`packages/opencode/test/session/prompt.test.ts`

Run from `packages/opencode`:

    bun test test/session/prompt.test.ts

The test verifies that:

- Subtle, moderate, and detailed each add the correct hint instruction.
- The three levels produce different system prompts.

### Why These Tests Are Sufficient

The test covers all three required hint levels and verifies that OpenCode handles each one differently, covering the main acceptance criteria. I also manually tested the same question at all three levels and confirmed that the responses provided different amounts of guidance. The app and TUI typechecks pass, and CI passes on the feature branch.


---

# 2. Learning Mode Configuration (#11)

**Contributor:** Leo

## Feature Description

Learning Mode Configuration adds a `learning_mode` setting that turns
OpenCode into a learning-oriented assistant. It is the on/off switch for the
Progressive Hint Mode user story (#5).

When learning mode is on, OpenCode adds a system prompt
(`packages/opencode/src/session/prompt/learning-mode.txt`) to every request it
sends to the model. The prompt tells the model that the user is a student
learning programming, and that it should explain the reasoning and key
concepts behind its answers so the student can apply them later. When
learning mode is off or not set, this prompt is not added, so OpenCode behaves
exactly as it did before.

The feature includes:

- a `learning_mode` boolean in the core and v1 config schemas, kept when an
  old v1 config is migrated, and exposed in the JS SDK `Config` type
- an `OPENCODE_LEARNING_MODE` environment variable that turns learning mode on
  or off for a single run, overriding the config files
- code in `SessionPrompt` that adds the learning-mode system prompt only when
  `learning_mode` is on
- documentation in `packages/web/src/content/docs/config.mdx` and `cli.mdx`

## How to Use

1. Add `learning_mode` to a project `opencode.json` / `opencode.jsonc` or to
   the global config at `~/.config/opencode/opencode.json`:
```json
   {
     "$schema": "https://opencode.ai/config.json",
     "learning_mode": true
   }
```
2. Start OpenCode and ask a programming question, for example "why does my
   loop run forever?". The model explains the reasoning and concepts behind
   its answer instead of only giving a fix.
3. To turn learning mode off, set `"learning_mode": false` or remove the key.
   Project config takes precedence over global config, so you can turn it off
   for one project while it stays on globally.
4. To override the config for a single run, set the environment variable:
   `OPENCODE_LEARNING_MODE=true opencode` (or `1`) turns it on, and
   `OPENCODE_LEARNING_MODE=false opencode` (or `0`) turns it off. The value is
   not case-sensitive. Any other value is ignored, and the config file
   decides.

## Manual User Testing

To manually verify Learning Mode Configuration:

1. Check out `xinruil3-learning-mode`, run `bun install`, and `cd` into an
   empty test directory. (Below, `opencode` means
   `bun run <repo>/packages/opencode/src/index.ts`.)
2. Create `opencode.json` with `{ "learning_mode": true }` and run
   `opencode debug config`. Verify that the output shows
   `"learning_mode": true`.
3. Run `OPENCODE_LEARNING_MODE=false opencode debug config`. Verify that the
   output shows `"learning_mode": false`, because the environment variable
   overrides the config file.
4. Delete `opencode.json` and run `opencode debug config`. Verify that
   `learning_mode` is not in the output (off by default). Then run
   `OPENCODE_LEARNING_MODE=1 opencode debug config` and verify that it shows
   `true`. Run `OPENCODE_LEARNING_MODE=yes opencode debug config` and verify
   that the value is ignored.
5. With a model provider configured, start OpenCode with learning mode on and
   ask "why does my loop run forever?". Then turn learning mode off and ask
   the same question. With learning mode on, the answer should focus on
   explaining the underlying concept. With it off, you should get OpenCode's
   normal answer.
6. Set `{ "learning_mode": "yes" }` in `opencode.json` and run any command.
   Verify that OpenCode rejects the config with
   `Expected boolean | undefined, got "yes"`.

### Expected Result

- OpenCode reads `learning_mode` from the config files and from
  `OPENCODE_LEARNING_MODE`. The environment variable wins when it is `true`,
  `1`, `false` or `0`, and is ignored otherwise.
- When learning mode is on, every model request includes the learning-mode
  system prompt, and responses focus on explaining reasoning and concepts.
- When learning mode is off or not set, the learning-mode prompt is never
  sent, so OpenCode behaves normally.
- Project config overrides global config, and non-boolean values in config
  files are rejected with a clear error.

## Automated Tests

**Test location:**
- `packages/opencode/test/config/config.test.ts`
- `packages/opencode/test/session/prompt.test.ts`
- `packages/opencode/test/server/httpapi-config.test.ts`
- `packages/core/test/config/config.test.ts`

Run from `packages/opencode` (and `packages/core` for the core tests):
```bash
bun test test/config/config.test.ts test/session/prompt.test.ts test/server/httpapi-config.test.ts
```

The automated tests verify:

- **Behavior reaches the model (`prompt.test.ts`):** using a fake LLM server,
  the session loop's request to the model contains the learning-mode prompt
  when `learning_mode: true`. It does **not** contain the prompt when
  `learning_mode: false` or when the setting is missing.
- **Config loading and precedence (`config.test.ts`):** the setting is off
  by default, `learning_mode: true` is loaded correctly, and project
  `false` overrides global `true`.
- **Environment variable override (`config.test.ts`, 10 cases):** `true`,
  `1` and `TRUE` turn learning mode on even when the config says `false`.
  `false`, `0` and `FALSE` turn it off even when the config says `true`.
  Unrecognized values (`yes`) and empty values are ignored, so the config
  decides. When the variable is unset, the config value (or nothing) is
  used.
- **HTTP API (`httpapi-config.test.ts`):** `GET /config` returns
  `learning_mode` as `true` and as `false` when the project config sets it,
  so clients such as the TUI and desktop app can see whether learning mode
  is on.
- **Schema and migration (core `config.test.ts`):** the current config
  schema parses `learning_mode: true`, and a v1 config with
  `learning_mode: false` keeps `false` after migration.

### Why These Tests Are Sufficient

| Acceptance criterion | Covered by |
|---|---|
| Users can enable and disable learning mode | Config loading tests, all 10 env var cases, core schema and migration tests |
| OpenCode recognizes whether learning mode is enabled | `Config.get()` assertions and the `GET /config` HTTP API tests |
| Disabling learning mode restores normal behavior | Prompt tests confirm the learning-mode prompt is absent for both `false` and unset |
| Tests verify the configuration is correctly applied | Prompt tests check the actual request sent to the model, not just the stored config |

The tests follow the setting through every layer of the feature: parsing
(core schema and v1 migration), resolution (default value, global vs. project
precedence, environment variable override), exposure (HTTP API), and effect
(the system prompt sent to the model). The environment variable tests cover
every branch of the parser: values that turn it on, values that turn it off,
and values that are ignored, each checked against a config value pointing the
other way. The prompt tests cover all three states (on, off, unset), which
shows that learning mode changes behavior only when it is turned on.


---

# 3. Hint-Only Response Mode (#9)

**Contributor:** Lily

## Feature Description

Hint-Only Response Mode is a built-in `hint` agent for learners who want help solving a programming problem without immediately receiving the complete implementation. It starts with a concise conceptual nudge or clarifying question, then gives progressively more concrete guidance in later messages. Before the user explicitly asks for a complete solution, the agent uses prose and language-agnostic pseudocode rather than executable or copy-paste-ready code. It also has read-only workspace permissions: it can inspect relevant files, but cannot edit files, run shell commands, or delegate tasks.


## How to Use

1. Start OpenCode and create or open a session.
2. Open the agent selector in the composer and select **Hint**. Alternatively, start OpenCode with `--agent hint`, or set `"default_agent": "hint"` in the OpenCode configuration to use Hint mode by default.
3. Enter an example request, such as: “Help me implement binary search in TypeScript.”
4. The agent should respond with a conceptual hint or clarifying question. On follow-up requests, it should give progressively more specific guidance while avoiding executable code unless you clearly request the complete solution.

## Manual User Testing

To manually verify Hint-Only Response Mode:

1. Start OpenCode and open a new session.
2. Select the **Hint** agent from the agent selector.
3. Enter a request that would normally allow a complete solution, such as: “Write a TypeScript function that checks whether a string is a palindrome.”
4. Verify that the response gives guidance, reasoning, or language-agnostic pseudocode rather than a complete copy-paste-ready implementation.
5. Ask a follow-up question such as: “Can you make the hint more concrete and explain the edge cases?”
6. Verify that the response becomes more specific, but still does not provide the complete implementation. Then explicitly ask for “the complete solution” and verify that the agent may provide it.

### Expected Result

The Hint agent is available as a visible primary agent. It provides concise, progressively stronger tutoring guidance and can inspect workspace context when useful. It does not edit files, execute commands, delegate work, or provide complete executable code until the user clearly requests the complete solution.

## Automated Tests

**Test location:**  
`packages/opencode/test/agent/agent.test.ts`


The automated tests verify:

- The built-in `hint` agent is registered, native, visible, and available as a primary agent.
- Its description and system prompt preserve the progressive-hints and no-complete-code behavior.
- Read-only permissions (`read`, `glob`, `grep`, and `lsp`) are allowed.
- File editing, shell execution, custom tools, task delegation, and external-directory access are denied by default.
- `hint` can be selected through the `default_agent` configuration.

### Why These Tests Are Sufficient

The tests cover the feature at its configuration boundary: they verify that Hint mode is discoverable and selectable, that its tutoring policy is installed in the agent prompt, and that its effective permissions enforce read-only operation. This demonstrates the intended behavior without relying on nondeterministic live-model responses. 
