import { expect, test } from "bun:test"
import fc from "fast-check"
import { Permission } from "../../src/permission"

// Strengthened generator: file and folder names may contain any character a real
// filename can hold, including spaces, line breaks, Unicode, and regex symbols.
const segment = fc
  .array(fc.constantFrom("a", "Z", "0", ".", "_", "-", " ", "\n", "\t", "é", "中", "[", "+", "$", "*", "?"), {
    minLength: 1,
    maxLength: 12,
  })
  .map((chars) => chars.join(""))
const target = fc.array(segment, { minLength: 1, maxLength: 4 }).map((parts) => parts.join("/"))

test("R4 (strengthened): changing a deletion target preserves denial under an effective rm * rule", () => {
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