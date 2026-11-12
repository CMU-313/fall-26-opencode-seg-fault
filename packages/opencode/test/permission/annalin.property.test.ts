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
import { GlobalBus } from "../../src/bus/global"
import { Wildcard } from "@opencode-ai/core/util/wildcard"
import { pollWithTimeout, testEffect } from "../lib/effect"

const noopBootstrap = Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void }))
const env = AppNodeBuilder.build(
  LayerNode.group([Permission.node, EventV2Bridge.node, CrossSpawnSpawner.node, InstanceStore.node]),
  [[InstanceStore.bootstrapNode, noopBootstrap]],
)
const it = testEffect(env)
const runs = { numRuns: 100, seed: 42 }

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

// ---------------------------------------------------------------------------
// P5 strengthening. These properties were added after the first Stryker run
// to kill surviving mutants. Every case is generated; none are example tests.
// ---------------------------------------------------------------------------

// Stop at the first failing case instead of shrinking, so mutation runs stay fast.
const fast = { ...runs, endOnFailure: true }

// Literal pattern text with no wildcard characters, including regex
// metacharacters, spaces, separators and letters of both cases.
const literal = fc
  .array(fc.constantFrom("a", "B", "c", "Z", "0", "_", "-", ".", "/", " ", "é", "[", "]", "+", "$", "(", ")", "^"), {
    minLength: 1,
    maxLength: 20,
  })
  .map((parts) => parts.join(""))
const nonSpace = fc.constantFrom("a", "B", "0", ".", "/", "é", "[", "$")

// R4: a rule's pattern must describe whole commands exactly, so that two
// commands get the same decision only when the same pattern governs both.
// Kind: invariant over generated literal patterns. Checks whole-string
// anchoring, that `?` stands for exactly one character, that `*` also covers
// commands spanning several lines, and case sensitivity off Windows.
test("R4: rule patterns match whole commands exactly", () => {
  fc.assert(
    fc.property(literal, literal, nonSpace, (text, extra, one) => {
      expect(Wildcard.match(text, text)).toBe(true)
      // Anchors: extra text before or after the command must not match.
      expect(Wildcard.match(extra + text, text)).toBe(extra + text === text)
      expect(Wildcard.match(text + one, text)).toBe(false)
      // `?` matches exactly one character.
      expect(Wildcard.match(text + one + extra, text + "?" + extra)).toBe(true)
      expect(Wildcard.match(text + extra, text + "?" + extra)).toBe(false)
      expect(Wildcard.match(text + one + one + extra, text + "?" + extra)).toBe(false)
      // `*` covers commands that contain line breaks.
      expect(Wildcard.match(`rm ${text}\n${extra}`, "rm *")).toBe(true)
      // Off Windows, a pattern that differs only in letter case is a different pattern.
      if (process.platform !== "win32" && text.toUpperCase() !== text) {
        expect(Wildcard.match(text.toUpperCase(), text)).toBe(false)
      }
    }),
    fast,
  )
})

// R2: when no rule matches a command, the effective decision is ask.
// Kind: invariant. Rules exist only for other permissions, so nothing matches.
test("R2: a command with no matching rule defaults to ask", () => {
  fc.assert(
    fc.property(fc.oneof(fc.constant(""), target), action, (name, other) => {
      const command = name ? `git push ${name}` : "git push"
      const ruleset = Permission.fromConfig({ edit: { "*": other }, webfetch: other })      
      expect(Permission.evaluate("bash", command, ruleset)).toEqual({ action: "ask", permission: "bash", pattern: "*" })
      expect(Permission.evaluate("bash", command)).toEqual({ action: "ask", permission: "bash", pattern: "*" })
    }),
    fast,
  )
})

// Shared helpers for the service-level properties below.
let counter = 0
const fresh = (label: string) => `${label === "ses" ? "ses" : "annalin"}_annalin_${label}_${counter++}`
const replied: Array<{ sessionID: string; requestID: string; reply: string }> = []
GlobalBus.on("event", (event) => {
  if (event.payload?.type === "permission.replied") replied.push(event.payload.properties)
})
const repliedFor = (requestID: string) => replied.filter((item) => item.requestID === requestID)

// R1 and R2 (inverse): when every command in a request is allowed, it must run
// at once, with no approval request and no deny. When a request is denied,
// the error must list exactly the rules for that permission.
// Kind: invariant over generated batches of allowed commands.
it.instance(
  "R1/R2: allowed requests run without asking, denials report only their rules",
  () =>
    Effect.gen(function* () {
      const permission = yield* Permission.Service
      const context = yield* Effect.context<Permission.Service>()
      yield* Effect.promise(() =>
        fc.assert(
          fc.asyncProperty(fc.array(target, { minLength: 0, maxLength: 4 }), target, async (names, denied) => {
            await Effect.gen(function* () {
              const continued: string[] = []
              const ruleset = Permission.fromConfig({
                bash: { "*": "ask", "git *": "allow", "rm *": "deny" },
                edit: "allow",
              })
              const result = yield* permission
                .ask({
                  sessionID: SessionID.make("session_annalin_allow"),
                  permission: "bash",
                  patterns: names.map((name) => `git status ${name}`),
                  metadata: {},
                  always: [],
                  ruleset,
                })
                .pipe(
                  Effect.andThen(Effect.sync(() => continued.push("executed"))),
                  Effect.timeoutOption("2 seconds"),
                )
              expect(result._tag).toBe("Some")
              expect(continued).toEqual(["executed"])
              expect(yield* permission.list()).toEqual([])

              const denial = yield* permission
                .ask({
                  sessionID: SessionID.make("session_annalin_allow"),
                  permission: "bash",
                  patterns: [`rm ${denied}`],
                  metadata: {},
                  always: [],
                  ruleset,
                })
                .pipe(Effect.flip)
              expect(denial).toBeInstanceOf(PermissionV1.DeniedError)
              expect((denial as PermissionV1.DeniedError).ruleset).toEqual(
                ruleset.filter((rule) => rule.permission === "bash"),
              )
            }).pipe(Effect.scoped, Effect.provide(context), Effect.runPromise)
          }),
          fast,
        ),
      )
    }),
  { git: true },
)

// R2: the approval request the user sees must be the request that was made,
// replies must be handled exactly once, and cancelled or unknown requests
// must not leave stale or broken state.
// Kind: invariant. Generates explicit or missing IDs, rejection feedback,
// and whether the asking operation is cancelled before any reply.
it.instance(
  "R2: approval requests keep their identity and every reply is handled once",
  () =>
    Effect.gen(function* () {
      const permission = yield* Permission.Service
      const context = yield* Effect.context<Permission.Service>()
      yield* Effect.promise(() =>
        fc.assert(
          fc.asyncProperty(
            fc.boolean(),
            fc.constantFrom("once", "always", "reject", "cancel"),
            fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            async (explicit, reply, message) => {
              await Effect.gen(function* () {
                const id = explicit ? PermissionV1.ID.ascending() : undefined
                const fiber = yield* permission
                  .ask({
                    id,
                    sessionID: SessionID.make(fresh("ses")),
                    permission: "bash",
                    patterns: ["git push"],
                    metadata: {},
                    always: [],
                    ruleset: Permission.fromConfig({ bash: { "git push *": "ask" } }),
                  })
                  .pipe(Effect.forkScoped)
                const pending = yield* pollWithTimeout(
                  permission.list().pipe(Effect.map((items) => (items.length === 1 ? items[0] : undefined))),
                  "R2: approval request was not published",
                )
                if (id) expect(pending.id).toBe(id)
                expect(String(pending.id).startsWith("per")).toBe(true)

                if (reply === "cancel") {
                  yield* Fiber.interrupt(fiber)
                  expect(yield* permission.list()).toEqual([])
                } else {
                  yield* permission.reply({
                    requestID: pending.id,
                    reply,
                    message: reply === "reject" ? message : undefined,
                  })
                  // The reply itself removes the request, before the asker resumes.
                  expect(yield* permission.list()).toEqual([])
                  const result = yield* Fiber.await(fiber)
                  expect(Exit.isSuccess(result)).toBe(reply !== "reject")
                  if (reply === "reject" && Exit.isFailure(result)) {
                    const error = Cause.squash(result.cause)
                    if (message) {
                      expect(error).toBeInstanceOf(PermissionV1.CorrectedError)
                      expect((error as PermissionV1.CorrectedError).feedback).toBe(message)
                    } else expect(error).toBeInstanceOf(PermissionV1.RejectedError)
                  }
                  yield* pollWithTimeout(
                    Effect.sync(() => (repliedFor(pending.id).length > 0 ? true : undefined)),
                    "R2: reply event was not published",
                  )
                  expect(repliedFor(pending.id)).toEqual([{ sessionID: pending.sessionID, requestID: pending.id, reply }])
                }

                // Replying to a request that is not pending is a typed error naming that request.
                const missing = yield* permission.reply({ requestID: pending.id, reply: "once" }).pipe(Effect.flip)
                expect(missing).toBeInstanceOf(PermissionV1.NotFoundError)
                expect(missing.requestID).toBe(pending.id)
              }).pipe(Effect.scoped, Effect.provide(context), Effect.runPromise)
            },
          ),
          fast,
        ),
      )
    }),
  { git: true },
)

// Starts `count` asks for one permission in one session and waits until all are pending.
const startAsks = (
  permission: Permission.Interface,
  sessionID: string,
  name: string,
  requests: Array<{ patterns: string[]; always: string[] }>,
) =>
  Effect.gen(function* () {
    const fibers = []
    for (const request of requests) {
      const id = PermissionV1.ID.ascending()
      const fiber = yield* permission
        .ask({
          id,
          sessionID: SessionID.make(sessionID),
          permission: name,
          patterns: request.patterns,
          metadata: {},
          always: request.always,
          ruleset: Permission.fromConfig({ [name]: "ask" }),
        })
        .pipe(Effect.forkScoped)
      fibers.push({ id, fiber })
      yield* pollWithTimeout(
        permission.list().pipe(Effect.map((items) => (items.some((item) => item.id === id) ? true : undefined))),
        "approval request was not published",
      )
    }
    return fibers
  })

const pendingIDs = (permission: Permission.Interface) =>
  permission.list().pipe(Effect.map((items) => items.map((item) => String(item.id)).toSorted()))

// R2: rejecting one request rejects every other pending request in the same
// session, and only that session.
// Kind: invariant over generated numbers of pending requests in two sessions.
it.instance(
  "R2: rejecting a request rejects its whole session and no other",
  () =>
    Effect.gen(function* () {
      const permission = yield* Permission.Service
      const context = yield* Effect.context<Permission.Service>()
      yield* Effect.promise(() =>
        fc.assert(
          fc.asyncProperty(fc.integer({ min: 2, max: 4 }), fc.integer({ min: 1, max: 3 }), async (same, other) => {
            await Effect.gen(function* () {
              const name = fresh("reject")
              const mine = fresh("ses")
              const theirs = fresh("ses")
              const a = yield* startAsks(permission, mine, name, Array(same).fill({ patterns: ["x"], always: [] }))
              const b = yield* startAsks(permission, theirs, name, Array(other).fill({ patterns: ["x"], always: [] }))

              yield* permission.reply({ requestID: a[0].id, reply: "reject" })
              expect(yield* pendingIDs(permission)).toEqual(b.map((item) => String(item.id)).toSorted())
              for (const item of a) {
                const result = yield* Fiber.await(item.fiber)
                expect(Exit.isFailure(result)).toBe(true)
                if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.RejectedError)
              }
              for (const item of a.slice(1)) {
                yield* pollWithTimeout(
                  Effect.sync(() => (repliedFor(item.id).length > 0 ? true : undefined)),
                  "reject event was not published",
                )
                expect(repliedFor(item.id)).toEqual([{ sessionID: mine, requestID: item.id, reply: "reject" }])
              }
              for (const item of b) expect(item.fiber.pollUnsafe()).toBeUndefined()

              yield* permission.reply({ requestID: b[0].id, reply: "reject" })
              expect(yield* permission.list()).toEqual([])
            }).pipe(Effect.scoped, Effect.provide(context), Effect.runPromise)
          }),
          fast,
        ),
      )
    }),
  { git: true },
)

// R2 (remembered approval, interview note S-16): after `always`, the saved
// patterns let later and already pending requests in the same session run
// without asking; `once` saves nothing; other sessions and requests that are
// only partly covered still ask.
// Kind: metamorphic. Run the same scenario with `once` and with `always` and
// compare which requests still need approval.
it.instance(
  "R2: always remembers approvals for the session, once does not",
  () =>
    Effect.gen(function* () {
      const permission = yield* Permission.Service
      const context = yield* Effect.context<Permission.Service>()
      yield* Effect.promise(() =>
        fc.assert(
          fc.asyncProperty(fc.constantFrom("once", "always"), literal, literal, async (reply, first, second) => {
            await Effect.gen(function* () {
              const name = fresh("always")
              const mine = fresh("ses")
              const theirs = fresh("ses")
              const [asked, covered, partial] = yield* startAsks(permission, mine, name, [
                { patterns: [`c ${first}`], always: ["c *"] },
                { patterns: [`c ${second}`], always: [] },
                { patterns: [`c ${second}`, `d ${second}`], always: [] },
              ])
              const [elsewhere] = yield* startAsks(permission, theirs, name, [{ patterns: [`c ${second}`], always: [] }])

              yield* permission.reply({ requestID: asked.id, reply })
              expect(Exit.isSuccess(yield* Fiber.await(asked.fiber))).toBe(true)

              const stillPending = (reply === "always" ? [partial, elsewhere] : [covered, partial, elsewhere]).map(
                (item) => String(item.id),
              )
              expect(yield* pendingIDs(permission)).toEqual(stillPending.toSorted())
              if (reply === "always") {
                expect(Exit.isSuccess(yield* Fiber.await(covered.fiber))).toBe(true)
                yield* pollWithTimeout(
                  Effect.sync(() => (repliedFor(covered.id).length > 0 ? true : undefined)),
                  "auto-approval event was not published",
                )
                expect(repliedFor(covered.id)).toEqual([{ sessionID: mine, requestID: covered.id, reply: "always" }])
              }

              // A new request in the same session is approved at once only after `always`.
              const later = yield* permission
                .ask({
                  sessionID: SessionID.make(mine),
                  permission: name,
                  patterns: [`c ${first}${second}`],
                  metadata: {},
                  always: [],
                  ruleset: Permission.fromConfig({ [name]: "ask" }),
                })
                .pipe(Effect.forkScoped)
              if (reply === "always") {
                expect(Exit.isSuccess(yield* Fiber.await(later))).toBe(true)
              } else {
                yield* pollWithTimeout(
                  permission.list().pipe(Effect.map((items) => (items.length === stillPending.length + 1 ? true : undefined))),
                  "once must not remember approvals",
                )
              }

              // Clean up whatever is still waiting.
              for (const item of yield* permission.list()) {
                yield* permission.reply({ requestID: item.id, reply: "reject" }).pipe(Effect.ignore)
              }
              expect(yield* permission.list()).toEqual([])
            }).pipe(Effect.scoped, Effect.provide(context), Effect.runPromise)
          }),
          fast,
        ),
      )
    }),
  { git: true },
)

// Red team defense (RT1 from Jay Yip): a denied command must be found even
// when commands that need approval come before it in the same batch.
// Kind: invariant. Generate how many ask commands come before and after the
// denied command; the request must fail with DeniedError at once and never ask.
it.instance(
  "R1: a denial is found even after commands that need approval",
  () =>
    Effect.gen(function* () {
      const permission = yield* Permission.Service
      const context = yield* Effect.context<Permission.Service>()
      yield* Effect.promise(() =>
        fc.assert(
          fc.asyncProperty(
            fc.array(fc.oneof(fc.constant(""), target), { minLength: 1, maxLength: 3 }),
            target,
            fc.nat({ max: 2 }),
            async (asks, denied, after) => {
              await Effect.gen(function* () {
                const continued: string[] = []
                const push = (name: string) => (name ? `git push ${name}` : "git push")
                const result = yield* permission
                  .ask({
                    sessionID: SessionID.make("session_annalin_rt1"),
                    permission: "bash",
                    patterns: [...asks.map(push), `rm ${denied}`, ...Array(after).fill("git push")],
                    metadata: {},
                    always: [],
                    ruleset: Permission.fromConfig({ bash: { "*": "allow", "git push *": "ask", "rm *": "deny" } }),
                  })
                  .pipe(
                    Effect.andThen(Effect.sync(() => continued.push("executed"))),
                    Effect.exit,
                    Effect.timeoutOption("2 seconds"),
                  )
                expect(result._tag).toBe("Some")
                if (result._tag === "Some") {
                  expect(Exit.isFailure(result.value)).toBe(true)
                  if (Exit.isFailure(result.value))
                    expect(Cause.squash(result.value.cause)).toBeInstanceOf(PermissionV1.DeniedError)
                }
                expect(continued).toEqual([])
                expect(yield* permission.list()).toEqual([])
              }).pipe(Effect.scoped, Effect.provide(context), Effect.runPromise)
            },
          ),
          fast,
        ),
      )
    }),
  { git: true },
)
