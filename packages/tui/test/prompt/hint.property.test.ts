import { expect, test } from "bun:test"
import fc from "fast-check"
import { HintSetting, applyHintCommand } from "../../src/prompt/hint"

fc.configureGlobal({ seed: 42 })

const supportedSettings = new Set<string>(HintSetting)
const activeLevels = [undefined, "subtle", "moderate", "detailed"] as const
const commandWhitespace = fc.constantFrom(" ", "  ", "\t", "\n")
const outerWhitespace = fc.constantFrom("", " ", "\t", "\n")

test("invalid hint levels are rejected with an error that lists every supported level", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...activeLevels),
      fc.string().filter((value) => value.length > 0 && !/\s/.test(value) && !supportedSettings.has(value.toLowerCase())),
      commandWhitespace,
      outerWhitespace,
      (active, invalidSetting, separator, padding) => {
        const result = applyHintCommand(`${padding}/hint${separator}${invalidSetting}${padding}`, active)

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
