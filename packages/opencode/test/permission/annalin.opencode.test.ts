import { expect, test } from "bun:test"
import fc from "fast-check"
import { Permission } from "../../src/permission"

const target = fc
  .array(fc.stringMatching(/^[a-zA-Z0-9._-]+$/), { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join("/"))

test("R4: changing a deletion target preserves denial under an effective rm * rule", () => {
  fc.assert(
    fc.property(target, target, fc.boolean(), fc.boolean(), (first, second, firstFolder, secondFolder) => {
      const ruleset = Permission.fromConfig({ bash: { "*": "allow", "rm *": "deny" } })
      const firstCommand = firstFolder ? `rm -r ${first}/` : `rm ${first}`
      const secondCommand = secondFolder ? `rm -r ${second}/` : `rm ${second}`
      const firstDecision = Permission.evaluate("bash", firstCommand, ruleset)
      const secondDecision = Permission.evaluate("bash", secondCommand, ruleset)

      expect(firstDecision.action).toBe("deny")
      expect(secondDecision.action).toBe(firstDecision.action)
    }),
    { numRuns: 100, seed: 42 },
  )
})
