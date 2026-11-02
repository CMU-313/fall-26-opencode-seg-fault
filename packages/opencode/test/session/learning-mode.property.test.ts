import { expect, test } from "bun:test"
import fc from "fast-check"
import PROMPT_LEARNING_MODE from "../../src/session/prompt/learning-mode.txt"
import { config, requestMessages, session, systemText, withLearningMode } from "./learning-mode.fixture"

// Generate realistic questions with loop boundaries, quotes, multiline code and
// Unicode. Vary model IDs, tool availability, other instructions and history
// length so preservation checks cannot pass by always comparing an empty request.
const turn = fc.record({
  question: fc.oneof(
    fc
      .integer({ min: -1, max: 20 })
      .map((limit) => `Why does this loop stop?\nfor (let i = 0; i < ${limit}; i++) console.log(i)`),
    fc.constantFrom(
      'Why does copying ["a", "b"] change both lists?',
      "解释一下递归的 base case。",
      "Explain x === 0.\r\nWhat if x is negative?",
    ),
  ),
  answer: fc.constantFrom(
    "Check the loop boundary first.",
    "A copy can share the same underlying object.",
    "先检查终止条件。\nThen trace one step.",
  ),
})
const scenario = fc.record({
  model: fc.constantFrom("test-model", "test-alternate"),
  read: fc.boolean(),
  glob: fc.boolean(),
  instruction: fc.constantFrom(
    "Keep the project's naming conventions.",
    "Use TypeScript examples.\nPreserve existing comments.",
    "Explain variable names in 中文.",
  ),
  turns: fc.array(turn, { minLength: 1, maxLength: 3 }),
})

// Construct recognized values from a known truth value, independently of the
// production parser. Mixed case, numeric aliases and asymmetric whitespace are
// deliberate boundaries. The expected boolean is retained before formatting.
const override = fc.boolean().chain((enabled) =>
  fc
    .record({
      enabled: fc.constant(enabled),
      word: fc.constantFrom(...(enabled ? ["true", "TRUE", "tRuE", "1"] : ["false", "FALSE", "fAlSe", "0"])),
      left: fc.constantFrom("", " ", "\t", "\n"),
      right: fc.constantFrom("", " ", "\t", "\r\n"),
    })
    .map((input) => ({ enabled: input.enabled, value: input.left + input.word + input.right })),
)

// Near-misses exercise warning and fallback, not just arbitrary garbage. The prefixed
// family also covers values beyond the named examples without filtering away
// most generated inputs or accidentally producing a recognized boolean.
const invalid = fc.oneof(
  fc.constantFrom("yes", "no", "on", "off", "2", "-1", "tru", "falsee", "null", " true! "),
  fc
    .array(fc.constantFrom("a", "b", "0", "1", "_"), { minLength: 1, maxLength: 8 })
    .map((chars) => `invalid:${chars.join("")}`),
)

// R1: Enabling or disabling learning mode must preserve the selected model,
// tool definitions, user messages, conversation history and all other system
// instructions; only the learning-mode instructions may be added or removed.
// Kind: invariant
test("R1: toggling learning mode preserves the rest of every model request", async () => {
  await fc.assert(
    fc.asyncProperty(scenario, async (input) => {
      await withLearningMode(input, async (fixture) => {
        const server = await fixture.start()
        const client = server.client()
        await config(fixture.file, false)
        const disabled = await session(client)
        const baseline: Record<string, unknown>[] = []
        for (const message of input.turns) baseline.push(await fixture.send(client, disabled, message))

        await config(fixture.file, true)
        await client.instance.dispose({}, { throwOnError: true })
        const enabled = await session(client)
        for (const [index, message] of input.turns.entries()) {
          const request = await fixture.send(client, enabled, message)
          expect(systemText(baseline[index])).not.toContain(PROMPT_LEARNING_MODE)
          expect(systemText(request).split(PROMPT_LEARNING_MODE)).toHaveLength(2)
          expect(systemText(request)).toContain(input.instruction)
          expect(request.tools).toEqual(baseline[index].tools)
          expect(Array.isArray(request.tools) && request.tools.length > 0).toBe(true)
          // Remove exactly the injected block and its joining newline. Do not
          // normalize other instructions, model options, tools or conversation.
          expect(baseline[index]).toEqual({
            ...request,
            messages: requestMessages(request).map((entry) =>
              entry.role === "system"
                ? { ...entry, content: entry.content.replace(`\n${PROMPT_LEARNING_MODE}`, "") }
                : entry,
            ),
          })
        }
      })
    }),
    { numRuns: 8 },
  )
}, 180_000)

// R2: A project's learning_mode applies only to that project; global supplies
// the default, enabling globally or locally yields the same learning instructions,
// and with neither config nor environment override learning mode is off.
// Kind: metamorphic
test("R2: moving the setting from project to global changes only its scope", async () => {
  await fc.assert(
    fc.asyncProperty(scenario, async (input) => {
      await withLearningMode(input, async (fixture) => {
        await config(fixture.global, undefined)
        await config(fixture.file, true)
        const local = await fixture.start()
        const localA = await fixture.send(local.client(), await session(local.client()))
        const localB = await fixture.send(local.client(fixture.other), await session(local.client(fixture.other)))
        expect(systemText(localA)).toContain(PROMPT_LEARNING_MODE)
        expect(systemText(localB)).not.toContain(PROMPT_LEARNING_MODE)
        await local.stop()

        await config(fixture.global, true)
        await config(fixture.file, undefined)
        const global = await fixture.start()
        const globalA = await fixture.send(global.client(), await session(global.client()))
        const globalB = await fixture.send(global.client(fixture.other), await session(global.client(fixture.other)))
        expect(systemText(globalA)).toEqual(systemText(localA))
        expect(systemText(globalB)).toBe(`${systemText(localB)}\n${PROMPT_LEARNING_MODE}`)
        await global.stop()

        await config(fixture.global, undefined)
        const unset = await fixture.start()
        expect(systemText(await fixture.send(unset.client(), await session(unset.client())))).not.toContain(
          PROMPT_LEARNING_MODE,
        )
        expect(
          systemText(await fixture.send(unset.client(fixture.other), await session(unset.client(fixture.other)))),
        ).not.toContain(PROMPT_LEARNING_MODE)
        expect(await Bun.file(`${fixture.other}/opencode.json`).exists()).toBe(false)
      })
    }),
    { numRuns: 6 },
  )
}, 180_000)

// R3: When OPENCODE_LEARNING_MODE is absent and global and project configs
// disagree, the project setting decides.
// Kind: model / oracle
test("R3: conflicting configs agree with the project-setting oracle", async () => {
  await fc.assert(
    fc.asyncProperty(scenario, async (input) => {
      await withLearningMode(input, async (fixture) => {
        // Both conflict directions run for every generated request context. The
        // oracle is simply the project boolean, not a copy of the merge algorithm.
        for (const project of [false, true]) {
          await config(fixture.global, !project)
          await config(fixture.file, project)
          const server = await fixture.start()
          expect(
            systemText(await fixture.send(server.client(), await session(server.client()))).includes(
              PROMPT_LEARNING_MODE,
            ),
          ).toBe(project)
          expect((await server.client().config.get({}, { throwOnError: true })).data?.learning_mode).toBe(project)
          await server.stop()
        }
      })
    }),
    { numRuns: 8 },
  )
}, 180_000)

// R4: Recognized OPENCODE_LEARNING_MODE values (case/whitespace insensitive)
// override both files for that process only; empty after trimming acts like absent.
// The override is never persisted. Normal initialization may add $schema; after
// initialization file bytes stay unchanged and the next run uses the file setting.
// Kind: round-trip
test("R4: a one-process override returns to unchanged file configuration", async () => {
  // Keep unrelated request context fixed while shrinking the override and schema
  // presence. Both initialized and schema-less files remain in the input domain:
  // first-load metadata initialization must never persist the temporary override.
  const regression = {
    model: "test-model",
    read: false,
    glob: false,
    instruction: "Preserve existing comments.",
    turns: [{ question: "Why does my loop stop?", answer: "Check the loop boundary first." }],
  }
  await fc.assert(
    fc.asyncProperty(fc.noShrink(scenario), override, fc.boolean(), async (input, env, schema) => {
      await withLearningMode(input, async (fixture) => {
        await config(fixture.global, env.enabled, schema)
        await config(fixture.file, !env.enabled, schema)
        const before = await Promise.all([fixture.global, fixture.file].map((file) => Bun.file(file).text()))
        const forced = await fixture.start(env.value)
        const overridden = await fixture.send(forced.client(), await session(forced.client()))
        await forced.stop()
        const initialized = await Promise.all([fixture.global, fixture.file].map((file) => Bun.file(file).text()))
        if (schema) expect(initialized).toEqual(before)
        for (const [file, setting] of [
          [fixture.global, env.enabled],
          [fixture.file, !env.enabled],
        ] as const) {
          const saved = await Bun.file(file).json()
          // Only optional schema metadata may differ after a first load. All
          // actual settings, including learning_mode, must still match the files.
          expect(saved).toEqual({
            learning_mode: setting,
            ...(saved.$schema === undefined ? {} : { $schema: "https://opencode.ai/config.json" }),
          })
        }
        const normal = await fixture.start()
        const restored = await fixture.send(normal.client(), await session(normal.client()))
        await normal.stop()
        const empty = await fixture.start("")
        const fallback = await fixture.send(empty.client(), await session(empty.client()))
        await empty.stop()

        expect(systemText(overridden).includes(PROMPT_LEARNING_MODE)).toBe(env.enabled)
        expect(systemText(restored).includes(PROMPT_LEARNING_MODE)).toBe(!env.enabled)
        expect(systemText(fallback)).toEqual(systemText(restored))
        expect(await Promise.all([fixture.global, fixture.file].map((file) => Bun.file(file).text()))).toEqual(
          initialized,
        )
      })
    }),
    {
      numRuns: 8,
      // Always replay the schema-less counterexample and a padded recognized
      // value, in addition to generated variants and both override directions.
      examples: [
        [regression, { enabled: false, value: "false" }, false],
        [regression, { enabled: true, value: " TRUE " }, true],
      ],
    },
  )
}, 240_000)

// R5: Config-file changes take effect at the next config load; until then the
// running instance retains its setting. Previous messages and replies never
// change, and switching back restores the previous behavior after the next load.
// Kind: round-trip
test("R5: restart applies a toggle and toggling back preserves session history", async () => {
  await fc.assert(
    fc.asyncProperty(scenario, async (input) => {
      await withLearningMode(input, async (fixture) => {
        await config(fixture.file, false)
        const original = await fixture.start()
        const id = await session(original.client())
        for (const message of input.turns) {
          expect(systemText(await fixture.send(original.client(), id, message))).not.toContain(PROMPT_LEARNING_MODE)
        }
        await config(fixture.file, true)
        // Editing the file alone must not refresh the running instance, even for
        // a newly created session in that same process.
        expect(systemText(await fixture.send(original.client(), await session(original.client())))).not.toContain(
          PROMPT_LEARNING_MODE,
        )
        const before = (await original.client().session.messages({ sessionID: id }, { throwOnError: true })).data!
        await original.stop()

        const restarted = await fixture.start()
        expect(systemText(await fixture.send(restarted.client(), await session(restarted.client())))).toContain(
          PROMPT_LEARNING_MODE,
        )
        const resumed = await fixture.send(restarted.client(), id)
        expect(systemText(resumed)).toContain(PROMPT_LEARNING_MODE)
        const history = input.turns.flatMap((message) => [
          { role: "user", content: message.question },
          { role: "assistant", content: message.answer },
        ])
        expect(
          requestMessages(resumed)
            .filter((message) => message.role !== "system")
            .slice(0, history.length),
        ).toEqual(history)
        const after = (await restarted.client().session.messages({ sessionID: id }, { throwOnError: true })).data!
        expect(after.slice(0, before.length)).toEqual(before)
        await restarted.stop()

        await config(fixture.file, false)
        const restored = await fixture.start()
        expect(systemText(await fixture.send(restored.client(), await session(restored.client())))).not.toContain(
          PROMPT_LEARNING_MODE,
        )
        expect((await restored.client().session.messages({ sessionID: id }, { throwOnError: true })).data).toEqual(
          after,
        )
        expect(systemText(await fixture.send(restored.client(), id))).not.toContain(PROMPT_LEARNING_MODE)
        expect(
          (await restored.client().session.messages({ sessionID: id }, { throwOnError: true })).data!.slice(
            0,
            after.length,
          ),
        ).toEqual(after)
      })
    }),
    { numRuns: 6 },
  )
}, 180_000)

// R7: A non-empty unrecognized OPENCODE_LEARNING_MODE logs one warning per
// config load, naming the variable, received value and accepted values, and
// continues using file configuration. Recognized values and values that are
// empty after trimming do not warn.
// Kind: invariant
test("R7: invalid overrides warn once and preserve the configured behavior", async () => {
  const regression = {
    model: "test-model" as const,
    read: false,
    glob: false,
    instruction: "Keep the project's naming conventions." as const,
    turns: [{ question: "Why does my loop stop?", answer: "Check the loop boundary first." as const }],
  }
  await fc.assert(
    fc.asyncProperty(
      fc.noShrink(scenario),
      invalid,
      fc.option(fc.boolean(), { nil: undefined }),
      // Empty and whitespace-only values are equivalent under R4; neither warns.
      fc.constantFrom("", " ", "\t\r\n"),
      async (input, value, enabled, emptyValue) => {
        await withLearningMode(input, async (fixture) => {
          await config(fixture.file, enabled)
          const server = await fixture.start(value)
          const id = await session(server.client())
          const first = await fixture.send(server.client(), id)
          const second = await fixture.send(server.client(), id)
          const logs = await server.stop()

          // Negative controls run in independent processes, including a recognized
          // padded override disagreeing with the file and a value empty after trimming.
          const valid = await fixture.start(enabled ? "\tFaLsE " : " TrUe\r\n")
          const recognized = await fixture.send(valid.client(), await session(valid.client()))
          const validLogs = await valid.stop()
          const empty = await fixture.start(emptyValue)
          const fallback = await fixture.send(empty.client(), await session(empty.client()))
          const emptyLogs = await empty.stop()

          expect(systemText(first).includes(PROMPT_LEARNING_MODE)).toBe(enabled === true)
          expect(systemText(second).includes(PROMPT_LEARNING_MODE)).toBe(enabled === true)
          expect(systemText(recognized).includes(PROMPT_LEARNING_MODE)).toBe(!enabled)
          expect(systemText(fallback).includes(PROMPT_LEARNING_MODE)).toBe(enabled === true)
          expect(warnings(validLogs)).toHaveLength(0)
          expect(warnings(emptyLogs)).toHaveLength(0)
          const warning = warnings(logs)
          expect(warning).toHaveLength(1)
          expect(warning[0]).toContain(value)
          for (const accepted of ["true", "1", "false", "0"]) {
            expect(warning[0].slice(warning[0].indexOf("OPENCODE_LEARNING_MODE"))).toMatch(
              new RegExp(`\\b${accepted}\\b`),
            )
          }
        })
      },
    ),
    {
      numRuns: 8,
      // Replay the failing yes/unset case, the stated true-config acceptance
      // criterion, and false config, with all three empty-value controls.
      examples: [
        [regression, "yes", undefined, ""],
        [regression, "yes", true, "\t\r\n"],
        [regression, "yes", false, " "],
      ],
    },
  )
}, 240_000)

function warnings(logs: string) {
  return logs.split(/\r?\n/).filter((line) => /\bWARN(?:ING)?\b/.test(line) && line.includes("OPENCODE_LEARNING_MODE"))
}
