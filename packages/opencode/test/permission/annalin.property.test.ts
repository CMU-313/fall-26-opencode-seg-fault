import { expect, test } from "bun:test"
import fc from "fast-check"
import { Cause, Effect, Exit, Fiber, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Permission } from "../../src/permission"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { InstanceStore } from "../../src/project/instance-store"
import { SessionID } from "../../src/session/schema"
import { pollWithTimeout, testEffect } from "../lib/effect"

const noopBootstrap = Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void }))
const env = AppNodeBuilder.build(
  LayerNode.group([Permission.node, EventV2Bridge.node, CrossSpawnSpawner.node, InstanceStore.node]),
  [[InstanceStore.bootstrapNode, noopBootstrap]],
)
const it = testEffect(env)
const runs = { numRuns: 100 }

// Mix explicit boundaries with generated paths: nested files/folders, spaces,
// Windows separators, Unicode, long names, and regex metacharacters. These are
// permission input strings; no generated shell command is actually executed.
const target = fc.oneof(
  fc.constantFrom(
    "file.txt",
    "folder/file.txt",
    "folder/",
    "a b.txt",
    "a\\b.txt",
    "文档/é.txt",
    "[x](a)+$.txt",
    "x".repeat(256),
  ),
  fc
    .array(fc.constantFrom("a", "Z", "0", "_", "-", ".", "/", " ", "é", "中", "[", "]", "+", "$"), {
      minLength: 1,
      maxLength: 80,
    })
    .map((parts) => parts.join("")),
)
const action = fc.constantFrom<PermissionV1.Action>("allow", "deny", "ask")

// R1: When the effective (last matching) rule is deny, the permission gate
// must fail and must not continue to the command execution step.
// Kind: invariant. Vary the denied command's position among allowed commands
// to check that a denial anywhere in a batch prevents the continuation.
it.instance(
  "R1: effective deny blocks the execution continuation",
  () =>
    Effect.gen(function* () {
      const permission = yield* Permission.Service
      const context = yield* Effect.context<Permission.Service>()
      yield* Effect.promise(() =>
        fc.assert(
          fc.asyncProperty(
            target,
            action,
            fc.nat({ max: 4 }),
            fc.nat({ max: 4 }),
            async (name, fallback, before, after) => {
              // Bridge fast-check's Promise callback into the existing test context.
              // Each generated case gets a scope so failures cannot leak fibers.
              await Effect.gen(function* () {
                const continued: string[] = []
                const patterns = [...Array(before).fill("git status"), `rm ${name}`, ...Array(after).fill("git status")]
                const ruleset = Permission.fromConfig({
                  bash: { "*": fallback, "git *": "allow", "rm *": "deny" },
                  edit: "allow",
                })
                expect(Permission.evaluate("bash", `rm ${name}`, ruleset).action).toBe("deny")
                const result = yield* permission
                  .ask({
                    sessionID: SessionID.make("session_annalin_r1"),
                    permission: "bash",
                    patterns,
                    metadata: {},
                    always: [],
                    ruleset,
                  })
                  .pipe(Effect.andThen(Effect.sync(() => continued.push("executed"))), Effect.exit)
                expect(Exit.isFailure(result)).toBe(true)
                if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.DeniedError)
                expect(continued).toEqual([])
                expect(yield* permission.list()).toEqual([])
              }).pipe(Effect.scoped, Effect.provide(context), Effect.runPromise)
            },
          ),
          runs,
        ),
      )
    }),
  { git: true },
)

// R2: When the effective rule is ask, OpenCode must request approval and
// block the execution continuation until an approving reply arrives.
// Kind: invariant. Generate one or several commands and both approval and
// rejection; wait for observable pending state rather than a fixed delay.
it.instance(
  "R2: ask waits for approval and rejection prevents continuation",
  () =>
    Effect.gen(function* () {
      const permission = yield* Permission.Service
      const context = yield* Effect.context<Permission.Service>()
      yield* Effect.promise(() =>
        fc.assert(
          fc.asyncProperty(
            fc.array(fc.oneof(fc.constant(""), target), { minLength: 1, maxLength: 4 }),
            fc.constantFrom("once", "always", "reject"),
            action,
            async (names, reply, fallback) => {
              await Effect.gen(function* () {
                const continued: string[] = []
                const patterns = names.map((name) => (name ? `git push ${name}` : "git push"))
                const fiber = yield* permission
                  .ask({
                    sessionID: SessionID.make("session_annalin_r2"),
                    permission: "bash",
                    patterns,
                    metadata: {},
                    always: [],
                    ruleset: Permission.fromConfig({ bash: { "*": fallback, "git push *": "ask" } }),
                  })
                  .pipe(Effect.andThen(Effect.sync(() => continued.push("executed"))), Effect.forkScoped)
                const pending = yield* pollWithTimeout(
                  permission.list().pipe(Effect.map((items) => (items.length === 1 ? items[0] : undefined))),
                  "R2: approval request was not published",
                )
                expect(pending.patterns).toEqual(patterns)
                expect(pending.permission).toBe("bash")
                expect(fiber.pollUnsafe()).toBeUndefined()
                expect(continued).toEqual([])
                yield* permission.reply({ requestID: pending.id, reply })
                const result = yield* Fiber.await(fiber)
                expect(Exit.isSuccess(result)).toBe(reply !== "reject")
                if (reply === "reject" && Exit.isFailure(result)) {
                  expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.RejectedError)
                }
                expect(continued).toEqual(reply !== "reject" ? ["executed"] : [])
                expect(yield* permission.list()).toEqual([])
              }).pipe(Effect.scoped, Effect.provide(context), Effect.runPromise)
            },
          ),
          runs,
        ),
      )
    }),
  { git: true },
)

// R3: Restoring a previous permission setting must restore the original
// permission behavior for subsequent evaluations with the same context.
// Kind: round-trip. Generate all three original actions and nonempty sequences
// of intermediate settings, including an explicit allow -> deny -> allow case.
test("R3: restoring a setting restores the original decision", () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.constant(""), target),
      action,
      fc.array(action, { minLength: 1, maxLength: 10 }),
      (name, original, changes) => {
        const command = name ? `git push ${name}` : "git push"
        const config = { bash: { "*": "ask" as PermissionV1.Action, [command]: original }, edit: "deny" as const }
        const initial = Permission.fromConfig(config)
        const initialDecision = Permission.evaluate("bash", command, initial)
        for (const setting of [...changes, original === "allow" ? ("deny" as const) : ("allow" as const), original]) {
          config.bash[command] = setting
          const current = Permission.fromConfig(config)
          expect(Permission.evaluate("bash", command, current).action).toBe(setting)
          expect(Permission.evaluate("edit", name, current).action).toBe("deny")
        }
        expect(Permission.evaluate("bash", command, Permission.fromConfig(config))).toEqual(initialDecision)
      },
    ),
    { ...runs, examples: [["", "allow", ["deny"]]] },
  )
})

// R4: Commands governed by the same effective permission pattern must receive
// the same decision; changing a deletion target alone must preserve denial.
// Kind: metamorphic. Generate independent targets and file/folder command
// forms; earlier fallback rules and later nonmatching rules must not interfere.
test("R4: changing a deletion target preserves denial under rm *", () => {
  fc.assert(
    fc.property(target, target, action, (first, second, fallback) => {
      const ruleset = Permission.fromConfig({ bash: { "*": fallback, "rm *": "deny", "git *": "ask" } })
      const original = Permission.evaluate("bash", `rm ${first}`, ruleset)
      const renamed = Permission.evaluate("bash", `rm ${second}`, ruleset)
      const folder = Permission.evaluate("bash", `rm -r ${second}/`, ruleset)
      expect(original.action).toBe("deny")
      expect(renamed).toEqual(original)
      expect(folder).toEqual(original)
    }),
    runs,
  )
})
