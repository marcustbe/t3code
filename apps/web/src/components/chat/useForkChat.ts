import type { OrchestrationMessageContext, RuntimeMode, ScopedThreadRef } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useGT } from "gt-react";
import { useRef } from "react";

import { newMessageId, newThreadId } from "~/lib/utils";
import { useStableCallback } from "../../hooks/useStableCallback";
import type { prepareTurnAttachments } from "./chatViewSend";
import { waitForThreadShell } from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";

/** The fork's first message: the composer's text, context and uploaded attachments. */
export interface ForkChatMessage {
  readonly text: string;
  readonly context?: OrchestrationMessageContext;
  readonly attachments: Awaited<ReturnType<typeof prepareTurnAttachments>>;
}

/**
 * Ghost: ⌘⏎ while a chat runs. Forks `threadRef` through its latest finished run into a
 * normal chat ("<title> fork") and sends `prompt` there; the source keeps running. `send`
 * resolves the new chat's ref, or null when it did not start or another fork is starting.
 */
export function useForkChat(input: {
  readonly threadRef: ScopedThreadRef | null;
  readonly title: string;
  readonly runtimeMode: RuntimeMode;
  readonly onError: (message: string) => void;
}) {
  const gt = useGT();
  const pendingRef = useRef(false);
  const forkThread = useAtomCommand(threadEnvironment.forkFromRun, { reportFailure: false });
  const deleteThread = useAtomCommand(threadEnvironment.delete, { reportFailure: false });
  const startThreadTurn = useOrchestrationCommand(threadEnvironment.startTurn, {
    reportFailure: false,
  });
  const reportFailure = (
    failure: Extract<AtomCommandResult<unknown, unknown>, { readonly _tag: "Failure" }>,
    fallback: string,
  ) => {
    if (isAtomCommandInterrupted(failure)) return;
    const error = squashAtomCommandFailure(failure);
    input.onError(error instanceof Error ? error.message : fallback);
  };
  const start = async (
    threadRef: ScopedThreadRef,
    text: string,
    prepareMessage: (() => Promise<ForkChatMessage>) | undefined,
  ) => {
    // Uploads run while the fork is created; a failed upload leaves no fork behind.
    const messagePromise = prepareMessage?.();
    messagePromise?.catch(() => {});
    const targetThreadId = newThreadId();
    const targetRef = scopeThreadRef(threadRef.environmentId, targetThreadId);
    const fork = await forkThread({
      environmentId: threadRef.environmentId,
      input: {
        sourceThreadId: threadRef.threadId,
        targetThreadId,
        title: `${input.title} fork`,
      },
    });
    if (fork._tag === "Failure") {
      reportFailure(fork, gt("Could not fork the chat."));
      return null;
    }
    // Drops the empty fork a failed start leaves behind; one that got its message stays.
    const discard = () =>
      void deleteThread({
        environmentId: threadRef.environmentId,
        input: { threadId: targetThreadId, onlyIfUnused: true },
      });
    if (!(await waitForThreadShell(targetRef))) {
      input.onError(gt("The fork was created, but it did not reach this client."));
      discard();
      return null;
    }
    let message: ForkChatMessage = { text, attachments: [] };
    if (messagePromise) {
      try {
        message = await messagePromise;
      } catch (error) {
        input.onError(
          error instanceof Error ? error.message : gt("Could not upload the attachments."),
        );
        discard();
        return null;
      }
    }
    // No title seed: the fork keeps "<title> fork", like the sidebar's Fork conversation.
    const turn = await startThreadTurn({
      environmentId: threadRef.environmentId,
      input: {
        threadId: targetThreadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: message.text,
          attachments: message.attachments,
          ...(message.context === undefined ? {} : { context: message.context }),
        },
        runtimeMode: input.runtimeMode,
        interactionMode: "default",
        createdAt: new Date().toISOString(),
      },
    });
    if (turn._tag === "Failure") {
      reportFailure(turn, gt("Could not send the message to the fork."));
      discard();
      return null;
    }
    return targetRef;
  };
  const send = async (prompt: string, prepareMessage?: () => Promise<ForkChatMessage>) => {
    const { threadRef } = input;
    const text = prompt.trim();
    if (!threadRef || (!text && !prepareMessage) || pendingRef.current) return null;
    pendingRef.current = true;
    return start(threadRef, text, prepareMessage).finally(() => {
      pendingRef.current = false;
    });
  };
  return { available: input.threadRef !== null, send: useStableCallback(send) };
}
