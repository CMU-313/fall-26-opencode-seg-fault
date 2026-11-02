import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { withCliFixture } from "../lib/cli-process"
import { testProviderConfig } from "../lib/test-provider"

export type Scenario = {
  model: string
  read: boolean
  glob: boolean
  instruction: string
  turns: { question: string; answer: string }[]
}

type Client = ReturnType<typeof createOpencodeClient>
const messages = Schema.Array(Schema.Struct({ role: Schema.String, content: Schema.String }))

export function requestMessages(body: Record<string, unknown>) {
  return Schema.decodeUnknownSync(messages)(body.messages)
}

export function systemText(body: Record<string, unknown>) {
  return requestMessages(body)
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n")
}

export async function session(client: Client) {
  const result = await client.session.create({ title: "Learning-mode property" }, { throwOnError: true })
  expect(result.data?.id).toBeDefined()
  return result.data!.id
}

export async function config(file: string, enabled: boolean | undefined, schema = true) {
  await Bun.write(
    file,
    JSON.stringify({
      ...(schema ? { $schema: "https://opencode.ai/config.json" } : {}),
      ...(enabled === undefined ? {} : { learning_mode: enabled }),
    }),
  )
}

export function withLearningMode(
  scenario: Scenario,
  body: (fixture: Awaited<ReturnType<typeof setup>>) => Promise<void>,
) {
  return Effect.runPromise(
    withCliFixture((fixture) =>
      Effect.promise(async () => {
        const test = await setup(fixture, scenario)
        return body(test).finally(test.close)
      }),
    ).pipe(Effect.scoped),
  )
}

// Real server processes isolate globals and caches between generated cases.
// Only the provider is simulated: configuration, API, session persistence,
// request assembly and logging all run through production implementations.
async function setup(fixture: Parameters<Parameters<typeof withCliFixture>[0]>[0], scenario: Scenario) {
  const project = path.join(fixture.home, "project-a")
  const other = path.join(fixture.home, "project-b")
  const global = path.join(fixture.home, ".config", "opencode", "opencode.json")
  await Promise.all([project, other, path.dirname(global)].map((directory) => mkdir(directory, { recursive: true })))
  await Bun.write(path.join(project, "AGENTS.md"), scenario.instruction)
  const provider = testProviderConfig(fixture.llm.url)
  const processes: { stop: () => Promise<string> }[] = []

  const start = async (value?: string) => {
    const child = Bun.spawn(
      [
        process.execPath,
        "run",
        "--conditions=browser",
        path.resolve(import.meta.dir, "../../src/index.ts"),
        "serve",
        "--hostname",
        "127.0.0.1",
        "--port",
        "0",
        "--print-logs",
      ],
      {
        cwd: fixture.home,
        // Do not inherit OPENCODE_* or provider credentials from the test runner.
        // In particular, undefined means the variable is genuinely absent.
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          HOME: fixture.home,
          XDG_CONFIG_HOME: path.join(fixture.home, ".config"),
          XDG_DATA_HOME: path.join(fixture.home, ".local/share"),
          XDG_STATE_HOME: path.join(fixture.home, ".local/state"),
          XDG_CACHE_HOME: path.join(fixture.home, ".cache"),
          OPENCODE_TEST_HOME: fixture.home,
          OPENCODE_TEST_MANAGED_CONFIG_DIR: path.join(fixture.home, "managed"),
          OPENCODE_DB: path.join(fixture.home, "sessions.sqlite"),
          OPENCODE_PURE: "1",
          OPENCODE_DISABLE_AUTOUPDATE: "1",
          OPENCODE_DISABLE_MODELS_FETCH: "1",
          OPENCODE_DISABLE_AUTOCOMPACT: "1",
          OPENCODE_MODELS_PATH: process.env.OPENCODE_MODELS_PATH,
          OPENCODE_AUTH_CONTENT: "{}",
          ...(value === undefined ? {} : { OPENCODE_LEARNING_MODE: value }),
          OPENCODE_CONFIG_CONTENT: JSON.stringify({
            ...provider,
            snapshot: false,
            share: "disabled",
            model: `test/${scenario.model}`,
            tools: { read: scenario.read, glob: scenario.glob },
            provider: {
              test: {
                ...provider.provider.test,
                models: {
                  [scenario.model]: { ...provider.provider.test.models["test-model"], id: scenario.model },
                },
              },
            },
          }),
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const ready = Promise.withResolvers<string>()
    const stderr = new Response(child.stderr).text()
    const stdout = (async () => {
      const decoder = new TextDecoder()
      const reader = child.stdout.getReader()
      let output = ""
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        output += decoder.decode(chunk.value, { stream: true })
        const match = output.match(/listening on (http:\/\/[^\s]+)/)
        if (match) ready.resolve(match[1])
      }
    })()
    const stop = async () => {
      if (child.exitCode === null) child.kill()
      await child.exited
      await stdout
      return stderr
    }
    processes.push({ stop })
    const timer = setTimeout(() => ready.reject(new Error("learning-mode server did not become ready")), 20_000)
    const url = await Promise.race([
      ready.promise,
      child.exited.then(async () => {
        throw new Error(`learning-mode server exited before startup: ${await stderr}`)
      }),
    ]).finally(() => clearTimeout(timer))
    return {
      client: (directory = project) => createOpencodeClient({ baseUrl: url, directory }),
      stop,
    }
  }

  const send = async (client: Client, id: string, turn = scenario.turns[0]) => {
    const before = (await Effect.runPromise(fixture.llm.hits)).length
    await Effect.runPromise(fixture.llm.text(turn.answer))
    const result = await client.session.prompt(
      {
        sessionID: id,
        agent: "build",
        model: { providerID: "test", modelID: scenario.model },
        parts: [{ type: "text", text: turn.question }],
      },
      { throwOnError: true, signal: AbortSignal.timeout(20_000) },
    )
    expect(result.data?.info.error).toBeUndefined()
    const hits = await Effect.runPromise(fixture.llm.hits)
    expect(hits.length - before).toBe(1)
    const request = hits[before].body
    expect(request.model).toBe(scenario.model)
    expect(
      requestMessages(request)
        .filter((message) => message.role === "user")
        .at(-1)?.content,
    ).toBe(turn.question)
    return request
  }

  return {
    project,
    other,
    global,
    file: path.join(project, "opencode.json"),
    start,
    send,
    close: async () => {
      await Promise.all(processes.map((server) => server.stop()))
    },
  }
}
