import { expect, test } from "bun:test"
import fc from "fast-check"
import { applyHintCommand, type HintLevel, type HintSetting } from "../../../tui/src/prompt/hint"

const supportedSettings = ["subtle", "moderate", "detailed", "none"] as const satisfies ReadonlyArray<HintSetting>
const activeLevels = [undefined, "subtle", "moderate", "detailed"] as const satisfies ReadonlyArray<HintLevel | undefined>

const supportedSetting = fc.constantFrom(...supportedSettings)
const activeLevel = fc.constantFrom(...activeLevels)
const unsupportedLevel = fc
  .stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,15}$/)
  .filter((value) => !supportedSettings.some((setting) => setting.toLowerCase() === value.toLowerCase()))
const settingWithCasing = supportedSetting.chain((setting) =>
  fc.array(fc.boolean(), { minLength: setting.length, maxLength: setting.length }).map((casing) => ({ setting, casing })),
)

function expectedLevel(setting: HintSetting) {
  if (setting === "none") return undefined
  return setting
}

function mixedCase(setting: HintSetting, casing: readonly boolean[]) {
  return setting
    .split("")
    .map((letter, index) => (casing[index] ? letter.toUpperCase() : letter.toLowerCase()))
    .join("")
}

const letter = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split(""))
const isSupported = (value: string) => supportedSettings.some((s) => s === value.toLowerCase())

const abbreviation = supportedSetting.chain((setting) =>
  fc.integer({ min: 1, max: setting.length - 1 }).map((n) => setting.slice(0, n)),
)

const misspelling = supportedSetting
  .chain((s) =>
    fc.oneof(
      fc.integer({ min: 0, max: s.length - 1 }).map((i) => s.slice(0, i) + s.slice(i + 1)),
      fc.tuple(fc.integer({ min: 0, max: s.length - 1 }), letter).map(([i, c]) => s.slice(0, i) + c + s.slice(i + 1)),
      fc.integer({ min: 0, max: s.length - 2 }).map((i) => s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2)),
      fc.tuple(fc.integer({ min: 0, max: s.length }), letter).map(([i, c]) => s.slice(0, i) + c + s.slice(i)),
    ),
  )
  .filter((value) => value.length > 0 && !isSupported(value))

// R1: When a user enters a hint level that is not one of subtle, moderate,
// detailed, or none, the system must reject the selection and return an error
// toast that lists the supported hint levels.
// Kind: invariant
// Generator choice: generate identifier-like values outside the supported set,
// which exercises invalid command arguments without accidentally creating a valid setting.
test("R1: unsupported hint levels always show the usage error", () => {
  fc.assert(
    fc.property(activeLevel, unsupportedLevel, (active, unsupported) => {
      const result = applyHintCommand(`/hint ${unsupported}`, active)

      expect(result).toMatchObject({
        handled: true,
        clearInput: false,
        hintLevel: active,
        toast: { variant: "error" },
      })
      if (!result.handled) return
      for (const level of supportedSettings) {
        expect(result.toast?.message).toContain(level)
      }
    }),
  )
})

// R2: When an unsupported hint level is entered, the system must keep the
// previously active hint level.
// Kind: invariant
// Generator choice: pair every possible active setting with invalid command arguments
// so rejection is checked from each starting state, including disabled hints.
test("R2: rejected hint levels preserve the active setting", () => {
  fc.assert(
    fc.property(activeLevel, unsupportedLevel, (active, unsupported) => {
      const result = applyHintCommand(`/hint ${unsupported}`, active)

      expect(result.handled).toBe(true)
      if (!result.handled) return
      expect(result.hintLevel).toBe(active)
      expect(result.toast?.variant).toBe("error")
    }),
  )
})

// R3: Hint-level selection must be case-insensitive.
// Kind: metamorphic
// Generator choice: vary the case of every character in every supported setting,
// rather than checking only a few manually chosen spellings.
test("R3: changing a supported setting's casing preserves its meaning", () => {
  fc.assert(
    fc.property(settingWithCasing, ({ setting, casing }) => {
      const original = applyHintCommand(`/hint ${setting}`, undefined,)

      const transformed = applyHintCommand(`/hint ${mixedCase(setting, casing)}`, undefined,)

      expect(transformed).toEqual(original)

      expect(transformed.handled).toBe(true)

      if (!transformed.handled) return

      expect(transformed.hintLevel).toBe(
        expectedLevel(setting),
      )
      expect(transformed.clearInput).toBe(true)
    }),
  )
})

// R5: Misspelled hint levels and abbreviations must not be applied as a hint level.
// Kind: invariant
// Generator choice: derive near-misses from the supported levels (prefixes and one-edit
// typos) instead of random strings, since random strings almost never land close to a
// valid name. Filtering out anything that happens to equal a valid level keeps every
// generated input genuinely invalid.
test("R5: misspellings and abbreviations are rejected and the active setting is preserved", () => {
  fc.assert(
    fc.property(activeLevel, fc.oneof(abbreviation, misspelling), (active, input) => {
      const result = applyHintCommand(`/hint ${input}`, active)

      expect(result.handled).toBe(true)
      if (!result.handled) return
      expect(result.hintLevel).toBe(active)
      expect(result.clearInput).toBe(false)
      expect(result.toast?.variant).toBe("error")
    }),
  )
})

// R8: When a user successfully changes their hint level, the
// command handler must return an informational toast identifying
// the newly active hint level.
// Kind: invariant
// Generator choice: sample active and requested settings,
// skipping unchanged states to test successful transitions.
test("R8: successful hint changes always provide confirmation", () => {
  fc.assert(
    fc.property(activeLevel, supportedSetting, (active, setting) => {
      if (active === expectedLevel(setting)) return

      const result = applyHintCommand(`/hint ${setting}`, active)

      expect(result).toEqual({
        handled: true,
        clearInput: true,
        hintLevel: expectedLevel(setting),
        toast: {
          message: setting === "none" ? "Hint level disabled" : `Hint level: ${setting}`,
          variant: "info",
        },
      })
    }),
  )
})
