import type { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

/**
 * Edited messages, ChatGPT style. Each edit forks the chat on the server into its own thread and
 * archives the version you left, so only this client knows which threads are versions of one
 * message. Nothing here reaches the server: other clients just see ordinary forks and archives.
 */
export interface MessageVersion {
  /** The thread whose own message this version is. */
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  /** The thread you were on when you last left this version (a later edit may have moved you). */
  readonly leafThreadId: ThreadId | null;
}

export interface MessageVersionGroup {
  readonly id: string;
  readonly environmentId: EnvironmentId;
  readonly versions: ReadonlyArray<MessageVersion>;
}

export interface MessageVersionMatch {
  readonly group: MessageVersionGroup;
  readonly index: number;
}

interface MessageVersionStoreState {
  groups: Record<string, MessageVersionGroup>;
  /**
   * Threads the sidebar leaves out while a version swap is in flight: the new version until it is
   * ready, then the one you left until its archive lands. One swap replaces the row in place.
   */
  hiddenThreadKeys: ReadonlySet<string>;
  setThreadsHidden: (input: { hide?: ReadonlyArray<string>; show?: ReadonlyArray<string> }) => void;
  addVersion: (input: {
    environmentId: EnvironmentId;
    edited: { threadId: ThreadId; messageId: MessageId };
    /** The thread you are leaving, so switching back returns there. */
    leftThreadId: ThreadId;
    next: { threadId: ThreadId; messageId: MessageId };
  }) => void;
  setLeaf: (groupId: string, index: number, leafThreadId: ThreadId) => void;
}

const MESSAGE_VERSION_STORAGE_KEY = "t3code:message-versions:v1";

export function findMessageVersion(
  groups: Record<string, MessageVersionGroup>,
  environmentId: EnvironmentId,
  threadId: ThreadId,
  messageId: MessageId,
): MessageVersionMatch | null {
  for (const group of Object.values(groups)) {
    if (group.environmentId !== environmentId) continue;
    const index = group.versions.findIndex(
      (version) => version.threadId === threadId && version.messageId === messageId,
    );
    if (index !== -1) return { group, index };
  }
  return null;
}

/** Whether `threadId` is an edited version, so its fork from the original chat stays unmarked. */
export function isMessageVersionThread(
  groups: Record<string, MessageVersionGroup>,
  environmentId: EnvironmentId,
  threadId: ThreadId,
): boolean {
  return Object.values(groups).some(
    (group) =>
      group.environmentId === environmentId &&
      group.versions.some((version, index) => index > 0 && version.threadId === threadId),
  );
}

export const useMessageVersionStore = create<MessageVersionStoreState>()(
  persist(
    (set) => ({
      groups: {},
      hiddenThreadKeys: new Set<string>(),
      setThreadsHidden: ({ hide = [], show = [] }) =>
        set((state) => {
          const next = new Set(state.hiddenThreadKeys);
          for (const key of show) next.delete(key);
          for (const key of hide) next.add(key);
          return { hiddenThreadKeys: next };
        }),
      addVersion: ({ environmentId, edited, leftThreadId, next }) =>
        set((state) => {
          const match = findMessageVersion(
            state.groups,
            environmentId,
            edited.threadId,
            edited.messageId,
          );
          const group: MessageVersionGroup = match?.group ?? {
            id: `${environmentId}:${edited.threadId}:${edited.messageId}`,
            environmentId,
            versions: [{ ...edited, leafThreadId: null }],
          };
          const editedIndex = match?.index ?? 0;
          const versions = group.versions.map((version, index) =>
            index === editedIndex ? { ...version, leafThreadId: leftThreadId } : version,
          );
          return {
            groups: {
              ...state.groups,
              [group.id]: { ...group, versions: [...versions, { ...next, leafThreadId: null }] },
            },
          };
        }),
      setLeaf: (groupId, index, leafThreadId) =>
        set((state) => {
          const group = state.groups[groupId];
          const version = group?.versions[index];
          if (!group || !version || version.leafThreadId === leafThreadId) return state;
          return {
            groups: {
              ...state.groups,
              [groupId]: {
                ...group,
                versions: group.versions.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, leafThreadId } : entry,
                ),
              },
            },
          };
        }),
    }),
    {
      name: MESSAGE_VERSION_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ groups: state.groups }),
    },
  ),
);
