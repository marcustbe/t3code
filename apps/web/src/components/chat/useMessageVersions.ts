import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { newMessageId, newThreadId } from "~/lib/utils";
import { refreshArchivedThreadsForEnvironment } from "../../lib/archivedThreadsState";
import { useMessageVersionStore } from "../../messageVersionStore";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { waitForThreadShell } from "../../state/entities";
import { environmentThreadDetails, threadEnvironment } from "../../state/threads";
import { waitForAtomValue } from "../../state/waitForAtomValue";
import { useAtomCommand } from "../../state/use-atom-command";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { useStableCallback } from "../../hooks/useStableCallback";
import { buildThreadRouteParams } from "../../threadRoutes";
import type { makeThreadErrorSetter } from "../ChatView.logic";
import type { MessageEditTarget } from "./MessagesTimeline.logic";

export interface MessageEditInput {
  readonly messageId: MessageId;
  readonly text: string;
  readonly edit: MessageEditTarget;
}

export interface MessageVersionSwitch {
  readonly groupId: string;
  readonly from: number;
  readonly to: number;
}

interface MessageVersionsInput {
  readonly environmentId: EnvironmentId;
  readonly activeThread: EnvironmentThreadShell | undefined;
  readonly isWorking: boolean;
  readonly setThreadError: ReturnType<typeof makeThreadErrorSetter>;
}

/**
 * Edits your earlier messages into versions you can flip between. Each edit forks the chat at the
 * run before the message (or starts a fresh thread for the first message), sends the new text
 * there, and archives the thread you left, so the sidebar and other clients show one chat.
 */
export function useMessageVersions(input: MessageVersionsInput) {
  const { environmentId, activeThread, isWorking, setThreadError } = input;
  const navigate = useNavigate();
  const forkThreadFromRun = useAtomCommand(threadEnvironment.forkFromRun, {
    reportFailure: false,
  });
  const startThreadTurn = useOrchestrationCommand(threadEnvironment.startTurn, {
    reportFailure: false,
  });
  const archiveThread = useOrchestrationCommand(threadEnvironment.archive, {
    reportFailure: false,
  });
  const unarchiveThread = useOrchestrationCommand(threadEnvironment.unarchive, {
    reportFailure: false,
  });

  const reportFailure = (
    threadId: ThreadId,
    result: AtomCommandResult<unknown, unknown>,
    fallback: string,
  ) => {
    if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
    const error = squashAtomCommandFailure(result);
    setThreadError(threadId, error instanceof Error ? error.message : fallback);
  };

  // Opens a version once its messages are loaded, so the chat swaps in one step instead of
  // painting an empty timeline first. The subscription is held until the chat has mounted its own.
  const openThread = async (threadId: ThreadId) => {
    const ref = scopeThreadRef(environmentId, threadId);
    const status = environmentThreadDetails.statusAtom(ref);
    const release = appAtomRegistry.subscribe(status, () => {});
    // A promise chain, not try/finally: React Compiler can't compile `finally`.
    const opened = waitForAtomValue({
      registry: appAtomRegistry,
      atom: status,
      predicate: (value) => value === "live",
      timeoutMs: 3_000,
    }).then(() =>
      navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) }),
    );
    const releaseNextFrame = () => requestAnimationFrame(release);
    void opened.then(releaseNextFrame, releaseNextFrame);
    await opened;
  };

  // Hides the version you left; a refused archive (say, it is still running) leaves it visible.
  const hideThread = async (threadId: ThreadId) => {
    const result = await archiveThread({ environmentId, input: { threadId } });
    if (result._tag === "Success") {
      refreshArchivedThreadsForEnvironment(environmentId);
    } else {
      useMessageVersionStore.getState().setThreadsHidden({
        show: [scopedThreadKey(scopeThreadRef(environmentId, threadId))],
      });
    }
  };

  const onEditMessage = async ({ messageId, text, edit }: MessageEditInput): Promise<boolean> => {
    const thread = activeThread;
    const trimmed = text.trim();
    if (!thread || isWorking || trimmed.length === 0) return false;
    setThreadError(thread.id, null);
    const targetThreadId = newThreadId();
    const nextMessageId = newMessageId();
    const createdAt = new Date().toISOString();
    const versionStore = useMessageVersionStore.getState();
    const leftKey = scopedThreadKey(scopeThreadRef(environmentId, thread.id));
    const targetKey = scopedThreadKey(scopeThreadRef(environmentId, targetThreadId));
    // The new version stays out of the sidebar until it replaces this chat's row.
    versionStore.setThreadsHidden({ hide: [targetKey] });
    const fail = () => {
      versionStore.setThreadsHidden({ show: [targetKey] });
      return false;
    };

    if (edit.base !== null) {
      const forkResult = await forkThreadFromRun({
        environmentId,
        input: {
          sourceThreadId: edit.base.threadId,
          targetThreadId,
          runId: edit.base.runId,
          title: thread.title,
        },
      });
      if (forkResult._tag === "Failure") {
        reportFailure(thread.id, forkResult, "Failed to edit this message.");
        return fail();
      }
      if (!(await waitForThreadShell(scopeThreadRef(environmentId, targetThreadId)))) {
        setThreadError(thread.id, "The edited version was created but did not reach this app.");
        return fail();
      }
    }

    const startResult = await startThreadTurn({
      environmentId,
      input: {
        threadId: targetThreadId,
        message: { messageId: nextMessageId, role: "user", text: trimmed, attachments: [] },
        // No title seed: it would retitle the version, and it should keep the chat's title.
        modelSelection: thread.modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        ...(edit.base === null
          ? {
              bootstrap: {
                createThread: {
                  projectId: thread.projectId,
                  title: thread.title,
                  modelSelection: thread.modelSelection,
                  runtimeMode: thread.runtimeMode,
                  interactionMode: thread.interactionMode,
                  branch: thread.branch,
                  worktreePath: thread.worktreePath,
                  createdAt,
                },
              },
            }
          : {}),
        createdAt,
      },
    });
    if (startResult._tag === "Failure") {
      reportFailure(thread.id, startResult, "Failed to send the edited message.");
      return fail();
    }

    versionStore.setThreadsHidden({ hide: [leftKey], show: [targetKey] });
    versionStore.addVersion({
      environmentId,
      edited: { threadId: edit.ownerThreadId, messageId },
      leftThreadId: thread.id,
      next: { threadId: targetThreadId, messageId: nextMessageId },
    });
    await openThread(targetThreadId);
    await hideThread(thread.id);
    return true;
  };

  const onSwitchMessageVersion = async ({ groupId, from, to }: MessageVersionSwitch) => {
    const thread = activeThread;
    const store = useMessageVersionStore.getState();
    const target = store.groups[groupId]?.versions[to];
    if (!thread || isWorking || !target || from === to) return;
    setThreadError(thread.id, null);
    store.setLeaf(groupId, from, thread.id);
    const leftKey = scopedThreadKey(scopeThreadRef(environmentId, thread.id));
    let targetThreadId = target.leafThreadId ?? target.threadId;
    const keyFor = (threadId: ThreadId) => scopedThreadKey(scopeThreadRef(environmentId, threadId));
    // The version you switch to stays out of the sidebar until it replaces this chat's row.
    store.setThreadsHidden({ hide: [keyFor(targetThreadId), keyFor(target.threadId)] });
    let unarchived = await unarchiveThread({ environmentId, input: { threadId: targetThreadId } });
    // The thread you last left this version on may be gone; fall back to the version itself.
    if (unarchived._tag === "Failure" && targetThreadId !== target.threadId) {
      targetThreadId = target.threadId;
      unarchived = await unarchiveThread({ environmentId, input: { threadId: targetThreadId } });
    }
    refreshArchivedThreadsForEnvironment(environmentId);
    if (!(await waitForThreadShell(scopeThreadRef(environmentId, targetThreadId)))) {
      store.setThreadsHidden({ show: [keyFor(targetThreadId), keyFor(target.threadId)] });
      if (unarchived._tag === "Failure") {
        reportFailure(thread.id, unarchived, "That version is no longer available.");
      } else {
        setThreadError(thread.id, "That version is no longer available.");
      }
      return;
    }
    store.setThreadsHidden({
      hide: [leftKey],
      show: [keyFor(targetThreadId), keyFor(target.threadId)],
    });
    await openThread(targetThreadId);
    await hideThread(thread.id);
  };

  return {
    onEditMessageStable: useStableCallback(onEditMessage),
    onSwitchMessageVersionStable: useStableCallback(onSwitchMessageVersion),
  };
}
