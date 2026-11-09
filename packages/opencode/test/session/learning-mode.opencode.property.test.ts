import { expect, test } from "bun:test"
import fc from "fast-check"
import { config, session, systemText, withLearningMode } from "./learning-mode.fixture"

test("R7 warns once for an unrecognized learning-mode value and keeps the file setting", async () => {
  const invalidValue = fc
    .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ _-+."), {
      minLength: 1,
      maxLength: 20,
    })
    .map((characters) => characters.join(""))
    .filter((value) => value.trim() !== "" && !/^(true|1|false|0)$/i.test(value.trim()))

  await fc.assert(
    fc.asyncProperty(invalidValue, fc.boolean(), async (value, enabled) => {
      await withLearningMode(
        {
          model: "test-model",
          read: false,
          glob: false,
          instruction: "Explain the answer clearly.",
          turns: [{ question: "Why?", answer: "Because." }],
        },
        async (fixture) => {
          await config(fixture.file, enabled)
          const server = await fixture.start(value)
          const client = server.client()
          const request = await fixture.send(client, await session(client))
          const logs = await server.stop()
          const warning = "OPENCODE_LEARNING_MODE is invalid; expected true, 1, false or 0. Using config-file setting."

          expect(logs.split(warning).length - 1).toBe(1)
          expect(logs).toContain(value)
          expect(logs).toContain("OPENCODE_LEARNING_MODE")
          expect(logs).toContain("true, 1, false or 0")
          expect(systemText(request).includes("Learning mode is enabled.")).toBe(enabled)
        },
      )
    }),
    { seed: 42, numRuns: 4 },
  )
}, { timeout: 30_000 })
