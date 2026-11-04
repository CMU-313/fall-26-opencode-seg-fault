export const HintSetting = ["subtle", "moderate", "detailed", "none"] as const

export type HintSetting = (typeof HintSetting)[number]
export type HintLevel = Exclude<HintSetting, "none">

export const hintUsage = "Usage: /hint subtle | moderate | detailed | none"

export function applyHintCommand(
  input: string,
  active: HintLevel | undefined,
):
  | { handled: false }
  | {
      handled: true
      clearInput: boolean
      hintLevel: HintLevel | undefined
      toast: { message: string; variant: "error" | "info" }
    } {
  const match = input.trim().match(/^\/hint(?:\s+(\S+))?$/)
  if (!match) return { handled: false } as const

  const setting = match[1]?.toLowerCase()
  if (setting === "none") {
    return {
      handled: true,
      clearInput: true,
      hintLevel: undefined,
      toast: { message: "Hint level disabled", variant: "info" as const },
    }
  }

  if (isHintLevel(setting)) {
    return {
      handled: true,
      clearInput: true,
      hintLevel: setting,
      toast: { message: `Hint level: ${setting}`, variant: "info" as const },
    }
  }

  return {
    handled: true,
    clearInput: false,
    hintLevel: active,
    toast: { message: hintUsage, variant: "error" as const },
  }
}

function isHintLevel(setting: string | undefined): setting is HintLevel {
  return setting === "subtle" || setting === "moderate" || setting === "detailed"
}
