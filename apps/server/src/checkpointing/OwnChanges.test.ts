// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";

import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { CheckpointRef, RunId, ThreadId, type VcsError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import { describe, expect } from "vite-plus/test";

import * as ServerConfig from "../config.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as OwnChanges from "./OwnChanges.ts";

const layerTest = OwnChanges.layer.pipe(
  Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-own-changes-test-" })),
  Layer.provideMerge(VcsProcess.layer),
  Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
);

const git = (cwd: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const vcsProcess = yield* VcsProcess.VcsProcess;
    const result = yield* vcsProcess.run({
      operation: "OwnChanges.test.git",
      command: "git",
      cwd,
      args: ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
      timeoutMs: 10_000,
    });
    return result.stdout;
  });

const lines = (count: number, replace: Record<number, string> = {}) =>
  Array.from({ length: count }, (_, index) => replace[index + 1] ?? `line ${index + 1}`).join(
    "\n",
  ) + "\n";

describe("OwnChangesJournal", () => {
  it.live("keeps only a thread's own files and hunks while another thread edits and commits", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const journal = yield* OwnChanges.OwnChangesJournal;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "own-changes-" });
      const write = (relativePath: string, contents: string) =>
        Effect.gen(function* () {
          yield* fileSystem.makeDirectory(NodePath.dirname(NodePath.join(root, relativePath)), {
            recursive: true,
          });
          yield* fileSystem.writeFileString(NodePath.join(root, relativePath), contents);
        });
      const copyDir = NodePath.join(root, "copy");
      yield* git(root, ["init", "-q"]);
      yield* write("copy/ad.md", lines(10));
      yield* write("launch/log.md", "log\n");
      yield* write(".gitignore", "out/\n");
      yield* git(root, ["add", "-A"]);
      yield* git(root, ["commit", "-qm", "init"]);
      const baseRef = CheckpointRef.make("refs/t3/orchestration-v2/checkpoints/test/ordinal/0");
      yield* git(root, ["update-ref", baseRef, "HEAD"]);

      const threadA = ThreadId.make("thread-a");
      const threadB = ThreadId.make("thread-b");
      const runA = RunId.make("run-a");
      const runB = RunId.make("run-b");
      yield* journal.startRun({ threadId: threadA, runId: runA });
      yield* journal.startRun({ threadId: threadB, runId: runB });
      const call = (
        threadId: ThreadId,
        runId: RunId,
        callId: string,
        toolName: string,
        body: Effect.Effect<
          void,
          PlatformError.PlatformError | VcsError,
          FileSystem.FileSystem | VcsProcess.VcsProcess
        >,
        filePath?: string,
      ) =>
        Effect.gen(function* () {
          yield* journal.beginCall({
            threadId,
            runId,
            callId,
            cwd: copyDir,
            toolName,
            ...(filePath === undefined ? {} : { filePath }),
          });
          yield* body;
          yield* journal.endCall({ threadId, callId });
        });

      // A edits line 2 of the shared ad; B then rewrites line 9 of it and adds a launch file.
      yield* call(threadA, runA, "a1", "Edit", write("copy/ad.md", lines(10, { 2: "A" })), "ad.md");
      yield* call(
        threadB,
        runB,
        "b1",
        "Bash",
        Effect.all([
          write("copy/ad.md", lines(10, { 2: "A", 9: "B" })),
          write("launch/new.md", "from b\n"),
        ]).pipe(Effect.asVoid),
      );
      // A's long shell command edits .gitignore and commits everything; B writes meanwhile.
      yield* journal.beginCall({
        threadId: threadA,
        runId: runA,
        callId: "a2",
        cwd: copyDir,
        toolName: "Bash",
      });
      yield* call(
        threadB,
        runB,
        "b2",
        "Write",
        write("launch/other.md", "also b\n"),
        NodePath.join(root, "launch/other.md"),
      );
      yield* write(".gitignore", "out/\nads/\n");
      yield* git(root, ["add", "-A"]);
      yield* git(root, ["commit", "-qm", "A commits everything"]);
      yield* journal.endCall({ threadId: threadA, callId: "a2" });
      // Someone outside Ghost edits a file between calls.
      yield* write("launch/log.md", "log\nby hand\n");

      const ownA = CheckpointRef.make("refs/t3/orchestration-v2/own/test/ordinal/1");
      const ownB = CheckpointRef.make("refs/t3/orchestration-v2/own/test-b/ordinal/1");
      expect(
        yield* journal.buildOwnTree({
          threadId: threadA,
          runId: runA,
          cwd: copyDir,
          baseRef,
          ownRef: ownA,
        }),
      ).toBe(true);
      expect(
        yield* journal.buildOwnTree({
          threadId: threadB,
          runId: runB,
          cwd: copyDir,
          baseRef,
          ownRef: ownB,
        }),
      ).toBe(true);

      const changed = (ref: string) =>
        git(root, ["diff", "--name-only", baseRef, ref]).pipe(
          Effect.map((stdout) => stdout.trim().split("\n")),
        );
      expect(yield* changed(ownA)).toEqual([".gitignore", "copy/ad.md"]);
      expect(yield* changed(ownB)).toEqual(["copy/ad.md", "launch/new.md", "launch/other.md"]);
      expect(yield* git(root, ["show", `${ownA}:copy/ad.md`])).toBe(lines(10, { 2: "A" }));
      expect(yield* git(root, ["show", `${ownB}:copy/ad.md`])).toBe(lines(10, { 9: "B" }));
    }).pipe(Effect.scoped, Effect.provide(layerTest)),
  );

  it.live("leaves runs it never started to the checkpoint diff", () =>
    Effect.gen(function* () {
      const journal = yield* OwnChanges.OwnChangesJournal;
      const built = yield* journal.buildOwnTree({
        threadId: ThreadId.make("thread-unknown"),
        runId: RunId.make("run-unknown"),
        cwd: process.cwd(),
        baseRef: CheckpointRef.make("refs/heads/none"),
        ownRef: CheckpointRef.make("refs/heads/none-own"),
      });
      expect(built).toBe(false);
    }).pipe(Effect.provide(layerTest)),
  );
});
