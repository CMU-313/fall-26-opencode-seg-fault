Cross-team red team — Anna Lin (`annalin`), Team SegFault → Tiffany Liu (`tiffany4`), Team LETZ, Directory Summary.

Target commit: `6b7881bc84ff20f0307e895cb14f369d30bf9839` ([pinned source](https://github.com/CMU-313/fall-26-opencode-letz/blob/6b7881bc84ff20f0307e895cb14f369d30bf9839/packages/opencode/src/tool/directory_summary.ts)). I studied `traceability/tiffany4.md` and `packages/opencode/test/tool/directory_summary.property.test.ts` at that same commit. Each patch applies independently to the original target commit; do not stack them.

Patch archive: `mutants/annalin/redteam/` on SegFault PR #22 (`annalin-properties`).

Predictions below come from inspecting the exact generators and assertions. All three patches were checked for clean application and reversal and parsed with Bun. The full target properties were not executed; survival is a prediction, not a measured result.

### RT1: P1 — ignore tsconfig baseUrl

An alias-resolution simplification always anchors paths at the tsconfig directory, dropping compilerOptions.baseUrl. With baseUrl="src", paths={"@lib/*":["lib/*"]}, module/index.ts importing "@lib/value", and src/lib/value.ts present, the import becomes unresolved (or resolves to a wrong root-level lib/value.ts). This violates P1: the resolved outward target and directory must be reported.

Expected to evade P1 model/oracle: resolved dependency targets. Its tsconfig generator defines paths but never baseUrl, so the mutated base is identical on every generated case. P2/P3 use relative imports and P4 uses external packages; R2–R6 do not exercise configured aliases. A stronger property would generate non-default baseUrl values and distinguish root-level decoys from the intended targets.

```diff
--- a/packages/opencode/src/tool/directory_summary.ts
+++ b/packages/opencode/src/tool/directory_summary.ts
@@ -62,7 +62,7 @@
         Schema.decodeUnknownOption(TsConfig)(parse(text, [], { allowTrailingComma: true })),
       )?.compilerOptions
       // TypeScript resolves `paths` relative to `baseUrl`, or to the tsconfig directory when it is unset.
-      const base = path.resolve(path.dirname(config), options?.baseUrl ?? ".")
+      const base = path.resolve(path.dirname(config))
       return Object.entries(options?.paths ?? {})
         .map(([pattern, targets]): Alias => {
           const star = pattern.indexOf("*")
```

### RT2: P2 — collapse distinct targets with the same basename

A developer shortens the dependency-map key to the target filename. In one module/index.ts, imports of ../lib/a/value and ../lib/b/value resolve to two distinct value.ts files, but the second edge is dropped. This violates P2: distinct (source file, target) pairs must each count once, yielding two edges and one contribution to each related directory.

Expected to evade P2 metamorphic: duplicate imports preserve frequency. Its targets are lib/item{id}.ts with unique ids, so distinct targets always have distinct basenames. P1 similarly uses item{id}.ts even across group directories; P3 has only one outward target, and P4 has no repository edges. Alternate specifiers in P2 still deduplicate correctly for the same target. A stronger property would generate repeated basenames across distinct target directories.

```diff
--- a/packages/opencode/src/tool/directory_summary.ts
+++ b/packages/opencode/src/tool/directory_summary.ts
@@ -319,7 +319,7 @@
               }
               // Imports that stay inside the summarized directory, including its subdirectories, are internal structure.
               if (FSUtil.contains(directory, resolved.target)) continue
-              const key = `${file.name}\0${resolved.target}`
+              const key = `${file.name}\0${path.basename(resolved.target)}`
               if (dependencies.has(key)) continue
               dependencies.set(key, {
                 file: file.name,
```

### RT3: R4 — omit parent components from missing-directory errors

An error-formatting refactor reconstructs a working-directory path from the directory basename, losing intermediate folders. A request for missing nested parent/gone fails with Directory not found: <working-directory>/gone instead of the required absolute <working-directory>/parent/gone. This violates R4 for both never-created and deleted nested directories; failure still occurs, but identifies the wrong requested path.

Expected to evade R4 invariant: missing and deleted directories have explicit errors. It generates only top-level missing{id} names under instance.directory; reconstruction under instance.directory gives the expected path for those top-level names. Other properties request existing directories and never execute this branch. A stronger property would generate nested missing/deleted paths and check the full resolved requested path.

```diff
--- a/packages/opencode/src/tool/directory_summary.ts
+++ b/packages/opencode/src/tool/directory_summary.ts
@@ -103,7 +103,7 @@
             Effect.catchReason("PlatformError", "NotFound", () => Effect.void),
             Effect.catch(inaccessible),
           )
-          if (!stat) return yield* Effect.fail(new Error(`Directory not found: ${directory}`))
+          if (!stat) return yield* Effect.fail(new Error(`Directory not found: ${path.join(instance.directory, path.basename(directory))}`))
           if (stat.type !== "Directory") return yield* Effect.fail(new Error(`Path is not a directory: ${directory}`))
 
           const entries = (yield* fs.readDirectoryEntries(directory).pipe(Effect.catch(inaccessible))).toSorted(
```
