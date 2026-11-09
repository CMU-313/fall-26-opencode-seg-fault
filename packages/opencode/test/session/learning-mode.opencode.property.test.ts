import { expect, test } from "bun:test"
import fc from "fast-check"
import { config, session, systemText, withLearningMode } from "./learning-mode.fixture"

// Original property written by opencode (R7). Strengthened parts are marked
// "Strengthened". The original only generated unrecognized values, so it never
// checked the other half of R7: values that must NOT warn.
test("R7 warns once for an unrecognized learning-mode value and keeps the file setting", async () => {
  const invalidValue = fc
    .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ _-+."), {
      minLength: 1,
      maxLength: 20,
    })
    .map((characters) => characters.join(""))
    .filter((value) => value.trim() !== "" && !/^(true|1|false|0)$/i.test(value.trim()))

  // Strengthened: padding and letter case for the recognized spellings, and a
  // blank value. Every case checks all four recognized words, so the numeric
  // aliases are always reached instead of depending on the seed.
  const spelling = fc.record({
    left: fc.constantFrom("", " ", "\t", "\n"),
    right: fc.constantFrom("", " ", "\t", "\r\n"),
    upper: fc.boolean(),
  })
  const blank = fc.constantFrom("", " ", "\t\r\n")

  await fc.assert(
    fc.asyncProperty(invalidValue, fc.boolean(), spelling, blank, async (value, enabled, style, empty) => {
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
          const warnings = (text: string) => text.split(warning).length - 1

          expect(logs.split(warning).length - 1).toBe(1)
          expect(logs).toContain(value)
          expect(logs).toContain("OPENCODE_LEARNING_MODE")
          expect(logs).toContain("true, 1, false or 0")
          expect(systemText(request).includes("Learning mode is enabled.")).toBe(enabled)

          // Strengthened: every recognized spelling applies its own value and never warns.
          for (const [word, on] of [
            ["true", true],
            ["1", true],
            ["false", false],
            ["0", false],
          ] as const) {
            const control = await fixture.start(style.left + (style.upper ? word.toUpperCase() : word) + style.right)
            const controlClient = control.client()
            const recognized = await fixture.send(controlClient, await session(controlClient))
            expect(warnings(await control.stop())).toBe(0)
            expect(systemText(recognized).includes("Learning mode is enabled.")).toBe(on)
          }

          // Strengthened: a blank value and an absent variable both keep the file
          // setting and never warn.
          for (const fallbackValue of [empty, undefined]) {
            const fallback = await fixture.start(fallbackValue)
            const fallbackClient = fallback.client()
            const kept = await fixture.send(fallbackClient, await session(fallbackClient))
            expect(warnings(await fallback.stop())).toBe(0)
            expect(systemText(kept).includes("Learning mode is enabled.")).toBe(enabled)
          }
        },
      )
    }),
    { seed: 42, numRuns: 4 },
  )
}, 240_000)
