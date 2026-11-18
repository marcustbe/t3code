/**
 * Records which worktree changes a thread's own tool calls made, so a turn's
 * changed files leave out edits and commits from other threads, scheduled jobs
 * and the user in the same repository. See docs/internals/overview.md.
 */
import type { CheckpointRef, RunId, ThreadId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as KeyedLock from "@t3tools/shared/KeyedLock";

import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";

const CHECKPOINT_REFS_PREFIX = "refs/t3/orchestration-v2/checkpoints/";
const OWN_REFS_PREFIX = "refs/t3/orchestration-v2/own/";
const SNAPSHOT_INDEX_NAME = "t3-own-changes.index";
const STALE_RUN_MS = 24 * 60 * 60 * 1000;
const MAX_TREE_LISTING_BYTES = 64_000_000;
const OWN_COMMIT_ENV = {
  GIT_AUTHOR_NAME: "Ghost",
  GIT_AUTHOR_EMAIL: "t3code@users.noreply.github.com",
  GIT_COMMITTER_NAME: "Ghost",
  GIT_COMMITTER_EMAIL: "t3code@users.noreply.github.com",
};

/** The ref holding a turn's own-changes tree, next to its checkpoint ref. */
export function ownRefForCheckpointRef(checkpointRef: CheckpointRef): CheckpointRef {
  return (
    checkpointRef.startsWith(CHECKPOINT_REFS_PREFIX)
      ? OWN_REFS_PREFIX + checkpointRef.slice(CHECKPOINT_REFS_PREFIX.length)
      : `${checkpointRef}-own`
  ) as CheckpointRef;
}

export type JournaledTool = "tree" | "file";

/** Tools whose writes are journaled: shell commands snapshot the whole worktree, edits one file. */
export function journaledToolKind(toolName: string): JournaledTool | null {
  switch (toolName) {
    case "Bash":
    case "PowerShell":
      return "tree";
    case "Edit":
    case "MultiEdit":
    case "Write":
    case "NotebookEdit":
      return "file";
    default:
      return null;
  }
}

export class OwnChangesRepositoryError extends Schema.TaggedError<OwnChangesRepositoryError>()(
  "OwnChangesRepositoryError",
  { cwd: Schema.String },
) {
  override get message(): string {
    return `No Git repository paths for ${this.cwd}.`;
  }
}

export interface OwnChangeEntry {
  readonly mode: string;
  readonly oid: string;
}

export interface OwnChange {
  readonly path: string;
  readonly pre: OwnChangeEntry | null;
  readonly post: OwnChangeEntry | null;
}

export interface OwnChangeDelta {
  readonly threadId: ThreadId;
  readonly runId: RunId | null;
  readonly repo: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly changes: ReadonlyArray<OwnChange>;
}

const sameEntry = (left: OwnChangeEntry | null, right: OwnChangeEntry | null) =>
  left === null || right === null ? left === right : left.oid === right.oid;

/**
 * Replays a run's own changes onto `base`, path by path. Another thread's change that
 * landed inside one of this run's windows becomes the starting point for that path,
 * so a long shell command does not claim edits other threads made meanwhile.
 * `merge` applies pre→post onto current and returns the merged blob, or null if it cannot.
 */
export const replayOwnChanges = Effect.fnUntraced(function* <E, R>(input: {
  readonly base: ReadonlyMap<string, OwnChangeEntry>;
  readonly own: ReadonlyArray<OwnChangeDelta>;
  readonly others: ReadonlyArray<OwnChangeDelta>;
  readonly merge: (
    current: OwnChangeEntry,
    pre: OwnChangeEntry,
    post: OwnChangeEntry,
  ) => Effect.Effect<OwnChangeEntry | null, E, R>;
}) {
  const result = new Map<string, OwnChangeEntry | null>();
  const ordered = input.own.toSorted((left, right) => left.endedAt - right.endedAt);
  for (const delta of ordered) {
    for (const change of delta.changes) {
      let pre = change.pre;
      let latestOther = -Infinity;
      for (const other of input.others) {
        if (other.endedAt <= delta.startedAt || other.endedAt > delta.endedAt) continue;
        if (other.endedAt < latestOther) continue;
        const otherChange = other.changes.find((candidate) => candidate.path === change.path);
        if (otherChange === undefined) continue;
        latestOther = other.endedAt;
        pre = otherChange.post;
      }
      if (sameEntry(pre, change.post)) continue;

      const current = result.has(change.path)
        ? (result.get(change.path) ?? null)
        : (input.base.get(change.path) ?? null);
      let next: OwnChangeEntry | null;
      if (change.post === null || pre === null || current === null || sameEntry(current, pre)) {
        next = change.post;
      } else {
        next = (yield* input.merge(current, pre, change.post)) ?? change.post;
      }
      result.set(change.path, next);
    }
  }
  return result;
});

function parseRawDiff(stdout: string): OwnChange[] {
  const records = stdout.split("\0");
  const changes: OwnChange[] = [];
  for (let index = 0; index + 1 < records.length; index += 2) {
    const header = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) [A-Z]/.exec(records[index]!);
    const path = records[index + 1]!;
    if (header === null || path.length === 0) continue;
    const [, preMode, postMode, preOid, postOid] = header;
    const isZero = (oid: string) => /^0+$/.test(oid);
    changes.push({
      path,
      pre: preMode === "000000" || isZero(preOid!) ? null : { mode: preMode!, oid: preOid! },
      post: postMode === "000000" || isZero(postOid!) ? null : { mode: postMode!, oid: postOid! },
    });
  }
  return changes;
}

function parseIndexEntries(stdout: string): Map<string, OwnChangeEntry> {
  const entries = new Map<string, OwnChangeEntry>();
  for (const record of stdout.split("\0")) {
    // ls-files -s: "<mode> <oid> <stage>\t<path>"; ls-tree: "<mode> <type> <oid>\t<path>".
    const match = /^(\d{6}) (?:blob |commit )?([0-9a-f]+)(?: \d)?\t(.+)$/s.exec(record);
    if (match === null) continue;
    entries.set(match[3]!, { mode: match[1]!, oid: match[2]! });
  }
  return entries;
}

interface RepoInfo {
  readonly root: string;
  readonly snapshotIndex: string;
  readonly index: string;
  readonly gitDir: string;
}

interface TreeSnapshot {
  readonly head: string | null;
  readonly tree: string;
}

type PendingCall =
  | {
      readonly kind: "tree";
      readonly threadId: ThreadId;
      readonly runId: RunId | null;
      readonly repo: RepoInfo;
      readonly startedAt: number;
      readonly snapshot: TreeSnapshot;
    }
  | {
      readonly kind: "file";
      readonly threadId: ThreadId;
      readonly runId: RunId | null;
      readonly repo: RepoInfo;
      readonly startedAt: number;
      readonly filePath: string;
      readonly entry: (OwnChangeEntry & { readonly path: string }) | null;
    };

interface RunState {
  readonly threadId: ThreadId;
  readonly runId: RunId;
  readonly startedAt: number;
  degraded: boolean;
}

export interface OwnChangesJournalShape {
  /** Marks a run as journaled; runs never started here fall back to checkpoint diffs. */
  readonly startRun: (input: {
    readonly threadId: ThreadId;
    readonly runId: RunId;
  }) => Effect.Effect<void>;
  readonly beginCall: (input: {
    readonly threadId: ThreadId;
    readonly runId: RunId | null;
    readonly callId: string;
    readonly cwd: string;
    readonly toolName: string;
    readonly filePath?: string;
  }) => Effect.Effect<void>;
  readonly endCall: (input: {
    readonly threadId: ThreadId;
    readonly callId: string;
  }) => Effect.Effect<void>;
  /**
   * Writes `ownRef`: `baseRef`'s tree plus only this run's own changes.
   * Returns false when the run was not fully journaled, so callers keep the checkpoint diff.
   */
  readonly buildOwnTree: (input: {
    readonly threadId: ThreadId;
    readonly runId: RunId;
    readonly cwd: string;
    readonly baseRef: CheckpointRef;
    readonly ownRef: CheckpointRef;
  }) => Effect.Effect<boolean>;
}

export class OwnChangesJournal extends Context.Service<OwnChangesJournal, OwnChangesJournalShape>()(
  "t3/checkpointing/OwnChanges/OwnChangesJournal",
) {}

export const make = Effect.gen(function* () {
  const git = yield* GitVcsDriver.GitVcsDriver;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const random = yield* SecureRandom.SecureRandom;
  const repoLocks = yield* KeyedLock.make<string>();

  const repos = new Map<string, RepoInfo>();
  const runs = new Map<string, RunState>();
  const pending = new Map<string, PendingCall>();
  const deltas: OwnChangeDelta[] = [];
  const runKey = (threadId: ThreadId, runId: RunId) => `${threadId}\0${runId}`;
  const callKey = (threadId: ThreadId, callId: string) => `${threadId}\0${callId}`;

  const run = (
    cwd: string,
    args: ReadonlyArray<string>,
    extra?: Partial<GitVcsDriver.ExecuteGitInput>,
  ) => git.execute({ operation: "OwnChangesJournal", cwd, args, ...extra });

  const resolveRepo = Effect.fn("OwnChangesJournal.resolveRepo")(function* (cwd: string) {
    const cached = repos.get(cwd);
    if (cached !== undefined) return cached;
    const result = yield* run(cwd, [
      "rev-parse",
      "--path-format=absolute",
      "--show-toplevel",
      "--git-dir",
      "--git-path",
      SNAPSHOT_INDEX_NAME,
      "--git-path",
      "index",
    ]);
    const [root, gitDir, snapshotIndex, index] = result.stdout.trimEnd().split("\n");
    if (!root || !gitDir || !snapshotIndex || !index) {
      return yield* new OwnChangesRepositoryError({ cwd });
    }
    const info = { root, gitDir, snapshotIndex, index };
    repos.set(cwd, info);
    return info;
  });

  const withSnapshotIndex = (repo: RepoInfo) => ({
    env: { GIT_INDEX_FILE: repo.snapshotIndex },
  });

  const ensureSnapshotIndex = Effect.fn("OwnChangesJournal.ensureSnapshotIndex")(function* (
    repo: RepoInfo,
  ) {
    if (yield* fileSystem.exists(repo.snapshotIndex)) return;
    // The real index carries stat data, so the first snapshot need not rehash every file.
    if (yield* fileSystem.exists(repo.index)) {
      yield* fileSystem.copyFile(repo.index, repo.snapshotIndex);
    }
  });

  const snapshotTree = (repo: RepoInfo) =>
    repoLocks.withLock(
      repo.root,
      Effect.gen(function* () {
        yield* ensureSnapshotIndex(repo);
        yield* run(
          repo.root,
          ["-c", "core.untrackedCache=true", "-c", "core.safecrlf=false", "add", "-A", "--", ":/"],
          withSnapshotIndex(repo),
        );
        const tree = (yield* run(repo.root, ["write-tree"], withSnapshotIndex(repo))).stdout.trim();
        const head = (yield* run(repo.root, ["rev-parse", "-q", "--verify", "HEAD^{commit}"], {
          allowNonZeroExit: true,
        })).stdout.trim();
        return { tree, head: head.length > 0 ? head : null } satisfies TreeSnapshot;
      }),
    );

  const snapshotFile = (repo: RepoInfo, filePath: string) =>
    repoLocks.withLock(
      repo.root,
      Effect.gen(function* () {
        yield* ensureSnapshotIndex(repo);
        const pathspec = `:(literal)${path.resolve(repo.root, filePath)}`;
        // Fails for a path that neither exists nor is indexed, which ls-files then reports as absent.
        yield* run(repo.root, ["-c", "core.safecrlf=false", "add", "-A", "--", pathspec], {
          ...withSnapshotIndex(repo),
          allowNonZeroExit: true,
        });
        const listed = yield* run(
          repo.root,
          ["ls-files", "-s", "-z", "--full-name", "--", pathspec],
          withSnapshotIndex(repo),
        );
        const [entry] = parseIndexEntries(listed.stdout);
        return entry === undefined ? null : { path: entry[0], ...entry[1] };
      }),
    );

  /** Paths whose change only mirrors HEAD moving to commits made before the call (a pull or checkout). */
  const importedPaths = Effect.fn("OwnChangesJournal.importedPaths")(function* (input: {
    readonly repo: RepoInfo;
    readonly preHead: string;
    readonly postHead: string;
    readonly startedAt: number;
    readonly changes: ReadonlyArray<OwnChange>;
  }) {
    const headDiff = yield* run(input.repo.root, [
      "diff-tree",
      "-r",
      "-z",
      "--no-renames",
      "--raw",
      "--no-abbrev",
      input.preHead,
      input.postHead,
    ]);
    const headChanges = new Map(
      parseRawDiff(headDiff.stdout).map((change) => [change.path, change]),
    );
    const authored = yield* run(input.repo.root, [
      "-c",
      "log.showSignature=false",
      "log",
      "--no-merges",
      "--format=",
      "--name-only",
      "-z",
      "--no-renames",
      `--since=@${Math.floor(input.startedAt / 1000) - 1}`,
      `${input.preHead}..${input.postHead}`,
    ]);
    const authoredPaths = new Set(authored.stdout.split("\0").filter((entry) => entry.length > 0));
    return new Set(
      input.changes
        .filter((change) => {
          const headChange = headChanges.get(change.path);
          return (
            headChange !== undefined &&
            !authoredPaths.has(change.path) &&
            sameEntry(headChange.pre, change.pre) &&
            sameEntry(headChange.post, change.post)
          );
        })
        .map((change) => change.path),
    );
  });

  const markDegraded = (threadId: ThreadId, runId: RunId | null) =>
    Effect.sync(() => {
      if (runId === null) return;
      const state = runs.get(runKey(threadId, runId));
      if (state !== undefined) state.degraded = true;
    });

  const prune = (now: number) => {
    for (const [key, state] of runs) {
      if (now - state.startedAt > STALE_RUN_MS) runs.delete(key);
    }
    for (const [key, call] of pending) {
      if (now - call.startedAt > STALE_RUN_MS) pending.delete(key);
    }
    const oldestActive = Math.min(
      ...[...runs.values()].map((state) => state.startedAt),
      ...[...pending.values()].map((call) => call.startedAt),
    );
    const kept = deltas.filter((delta) => delta.endedAt >= oldestActive);
    deltas.splice(0, deltas.length, ...kept);
  };

  const startRun: OwnChangesJournalShape["startRun"] = (input) =>
    Effect.map(Clock.currentTimeMillis, (now) => {
      prune(now);
      const key = runKey(input.threadId, input.runId);
      if (!runs.has(key)) {
        runs.set(key, {
          threadId: input.threadId,
          runId: input.runId,
          startedAt: now,
          degraded: false,
        });
      }
    });

  const beginCall: OwnChangesJournalShape["beginCall"] = (input) => {
    const kind = journaledToolKind(input.toolName);
    if (kind === null || (kind === "file" && input.filePath === undefined)) return Effect.void;
    return Effect.gen(function* () {
      const repo = yield* resolveRepo(input.cwd);
      const startedAt = yield* Clock.currentTimeMillis;
      const call: PendingCall =
        kind === "tree"
          ? {
              kind,
              threadId: input.threadId,
              runId: input.runId,
              repo,
              startedAt,
              snapshot: yield* snapshotTree(repo),
            }
          : {
              kind,
              threadId: input.threadId,
              runId: input.runId,
              repo,
              startedAt,
              filePath: path.resolve(input.cwd, input.filePath!),
              entry: yield* snapshotFile(repo, path.resolve(input.cwd, input.filePath!)),
            };
      pending.set(callKey(input.threadId, input.callId), call);
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logDebug("own-changes snapshot skipped", {
          cwd: input.cwd,
          cause: String(cause),
        }).pipe(Effect.andThen(markDegraded(input.threadId, input.runId))),
      ),
    );
  };

  const finishCall = Effect.fn("OwnChangesJournal.finishCall")(function* (call: PendingCall) {
    let changes: ReadonlyArray<OwnChange>;
    if (call.kind === "tree") {
      const after = yield* snapshotTree(call.repo);
      if (after.tree === call.snapshot.tree) return;
      const diff = yield* run(call.repo.root, [
        "diff-tree",
        "-r",
        "-z",
        "--no-renames",
        "--raw",
        "--no-abbrev",
        call.snapshot.tree,
        after.tree,
      ]);
      const all = parseRawDiff(diff.stdout);
      const imported =
        call.snapshot.head !== null && after.head !== null && call.snapshot.head !== after.head
          ? yield* importedPaths({
              repo: call.repo,
              preHead: call.snapshot.head,
              postHead: after.head,
              startedAt: call.startedAt,
              changes: all,
            })
          : new Set<string>();
      changes = all.filter((change) => !imported.has(change.path));
    } else {
      const after = yield* snapshotFile(call.repo, call.filePath);
      const changedPath = after?.path ?? call.entry?.path;
      if (changedPath === undefined || sameEntry(call.entry, after)) return;
      changes = [
        {
          path: changedPath,
          pre: call.entry === null ? null : { mode: call.entry.mode, oid: call.entry.oid },
          post: after === null ? null : { mode: after.mode, oid: after.oid },
        },
      ];
    }
    if (changes.length === 0) return;
    deltas.push({
      threadId: call.threadId,
      runId: call.runId,
      repo: call.repo.root,
      startedAt: call.startedAt,
      endedAt: yield* Clock.currentTimeMillis,
      changes,
    });
  });

  const endCall: OwnChangesJournalShape["endCall"] = (input) => {
    const key = callKey(input.threadId, input.callId);
    const call = pending.get(key);
    if (call === undefined) return Effect.void;
    pending.delete(key);
    return finishCall(call).pipe(
      Effect.catchCause((cause) =>
        Effect.logDebug("own-changes snapshot failed", { cause: String(cause) }).pipe(
          Effect.andThen(markDegraded(call.threadId, call.runId)),
        ),
      ),
    );
  };

  const writeOwnTree = Effect.fn("OwnChangesJournal.writeOwnTree")(function* (input: {
    readonly repo: RepoInfo;
    readonly threadId: ThreadId;
    readonly runId: RunId;
    readonly baseRef: CheckpointRef;
    readonly ownRef: CheckpointRef;
  }) {
    const own = deltas.filter(
      (delta) =>
        delta.repo === input.repo.root &&
        delta.threadId === input.threadId &&
        delta.runId === input.runId,
    );
    const others = deltas.filter(
      (delta) => delta.repo === input.repo.root && delta.threadId !== input.threadId,
    );
    const baseTree = `${input.baseRef}^{tree}`;
    const listing = yield* run(input.repo.root, ["ls-tree", "-r", "-z", "--full-tree", baseTree], {
      maxOutputBytes: MAX_TREE_LISTING_BYTES,
    });
    const base = parseIndexEntries(listing.stdout);
    const replayed = yield* replayOwnChanges({
      base,
      own,
      others,
      merge: (current, pre, post) =>
        run(
          input.repo.root,
          ["merge-file", "--object-id", "--theirs", current.oid, pre.oid, post.oid],
          { allowNonZeroExit: true },
        ).pipe(
          Effect.map((result) =>
            result.exitCode === 0 && /^[0-9a-f]+$/.test(result.stdout.trim())
              ? { mode: post.mode, oid: result.stdout.trim() }
              : null,
          ),
        ),
    });

    let tree = (yield* run(input.repo.root, ["rev-parse", baseTree])).stdout.trim();
    if (replayed.size > 0) {
      const buildIndex = path.join(
        input.repo.gitDir,
        `t3-own-build-${yield* random.uuidV4()}.index`,
      );
      const env = { env: { GIT_INDEX_FILE: buildIndex } };
      const zeroOid = "0".repeat(tree.length);
      tree = yield* Effect.gen(function* () {
        yield* run(input.repo.root, ["read-tree", baseTree], env);
        yield* run(input.repo.root, ["update-index", "-z", "--index-info"], {
          ...env,
          stdin: [...replayed]
            .map(([filePath, entry]) =>
              entry === null
                ? `0 ${zeroOid}\t${filePath}\0`
                : `${entry.mode} ${entry.oid}\t${filePath}\0`,
            )
            .join(""),
        });
        return (yield* run(input.repo.root, ["write-tree"], env)).stdout.trim();
      }).pipe(
        Effect.ensuring(
          Effect.forEach(
            [buildIndex, `${buildIndex}.lock`],
            (file) => fileSystem.remove(file, { force: true }).pipe(Effect.ignore),
            { discard: true },
          ),
        ),
      );
    }
    const commit = (yield* run(
      input.repo.root,
      [
        "commit-tree",
        tree,
        "-p",
        `${input.baseRef}^{commit}`,
        "-m",
        `t3 own changes ref=${input.ownRef}`,
      ],
      { env: OWN_COMMIT_ENV },
    )).stdout.trim();
    yield* run(input.repo.root, ["update-ref", input.ownRef, commit]);
  });

  const buildOwnTree: OwnChangesJournalShape["buildOwnTree"] = Effect.fn(
    "OwnChangesJournal.buildOwnTree",
  )(
    function* (input) {
      const key = runKey(input.threadId, input.runId);
      const state = runs.get(key);
      if (state === undefined) return false;
      // A call the turn never reported back ends now.
      for (const [pendingKey, call] of pending) {
        if (call.threadId === input.threadId && call.runId === input.runId) {
          pending.delete(pendingKey);
          yield* finishCall(call).pipe(
            Effect.catchCause(() => markDegraded(call.threadId, call.runId)),
          );
        }
      }
      runs.delete(key);
      if (state.degraded) return false;
      const repo = yield* resolveRepo(input.cwd);
      yield* writeOwnTree({ ...input, repo });
      prune(yield* Clock.currentTimeMillis);
      return true;
    },
    (effect, input) =>
      effect.pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("own-changes tree failed; using the checkpoint diff", {
            threadId: input.threadId,
            runId: input.runId,
            cause: String(cause),
          }).pipe(Effect.as(false)),
        ),
      ),
  );

  return OwnChangesJournal.of({ startRun, beginCall, endCall, buildOwnTree });
});

export const layer = Layer.effect(OwnChangesJournal, make).pipe(Layer.provide(GitVcsDriver.layer));
