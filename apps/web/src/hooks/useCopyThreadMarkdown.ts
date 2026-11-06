import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { chatTranscriptMarkdown } from "../components/chat/chatTranscriptMarkdown";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { deriveTimelineEntriesFromVisibleTurnItems } from "../session-logic";
import { orchestrationEnvironment } from "../state/orchestration";
import { useAtomCommand } from "../state/use-atom-command";
import { useCopyToClipboard } from "./useCopyToClipboard";

function failureToast(title: string, error: unknown) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "An error occurred.",
    }),
  );
}

/** Loads a thread's transcript and copies its conversation as Markdown. */
export function useCopyThreadMarkdown() {
  const loadThreadTranscript = useAtomCommand(orchestrationEnvironment.threadTranscript, {
    reportFailure: false,
  });
  const { copyToClipboard } = useCopyToClipboard<void>({
    onCopy: () => {
      toastManager.add({ type: "success", title: "Chat copied as Markdown" });
    },
    onError: (error) => failureToast("Failed to copy chat", error),
  });

  return async (threadRef: ScopedThreadRef) => {
    const result = await loadThreadTranscript({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId },
    });
    if (result._tag !== "Success") {
      failureToast("Failed to copy chat", squashAtomCommandFailure(result));
      return;
    }
    const entries = deriveTimelineEntriesFromVisibleTurnItems({
      visibleTurnItems: result.value.items,
      optimisticMessages: [],
    });
    copyToClipboard(chatTranscriptMarkdown(entries));
  };
}
