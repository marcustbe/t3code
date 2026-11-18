import { presentThreadShell } from "@t3tools/client-runtime/state/models";
import { isShownUnderParent } from "@t3tools/client-runtime/state/threads";
import { threadKey } from "@t3tools/client-runtime/state/entities";
import type { EnvironmentId, GhostPetChat, ThreadId } from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import type { AtomRegistry } from "effect/reactivity";

import { hasUnseenCompletion, resolveSidebarRowStatus } from "./components/Sidebar.logic";
import {
  getClientSettings,
  subscribeClientSettings,
  updateClientSettings,
} from "./hooks/useSettings";
import { environmentSummaries } from "./state/presentation";
import { environmentShell } from "./state/shell";
import { environmentThreadShells } from "./state/threads";

const SEND_DELAY_MS = 150;

/** The chats the Ghost pet shows, using the sidebar's own status rules. */
function collectChats(registry: AtomRegistry.AtomRegistry): GhostPetChat[] {
  const hidden = registry.get(environmentThreadShells.hiddenThreadKeysAtom);
  const delegatedUnderParent = registry.get(environmentThreadShells.delegatedUnderParentAtom);
  const chats: Array<GhostPetChat & { readonly updatedAt: number }> = [];
  for (const environmentId of registry.get(environmentSummaries.environmentIdsAtom)) {
    const shell = registry.get(environmentShell.stateValueAtom(environmentId));
    if (shell.status !== "live" || Option.isNone(shell.snapshot)) continue;
    const requests = registry.get(
      environmentThreadShells.pendingSubagentRequestsAtom(environmentId),
    );
    for (const raw of shell.snapshot.value.threads) {
      if (raw.archivedAt !== null) continue;
      if (hidden.has(threadKey({ environmentId, threadId: raw.id }))) continue;
      if (
        isShownUnderParent({ environmentId, threadId: raw.id }, raw.lineage, delegatedUnderParent)
      ) {
        continue;
      }
      const thread = presentThreadShell(environmentId, raw, requests.get(raw.id) ?? null);
      const status = resolveSidebarRowStatus(thread);
      const state: GhostPetChat["state"] | null =
        status === "approval" || status === "input" || status === "request"
          ? "needs"
          : status === "working" || status === "preparing" || status === "waiting"
            ? "working"
            : status === "failed" || status === "limited"
              ? "failed"
              : hasUnseenCompletion(thread)
                ? "done"
                : null;
      if (state === null) continue;
      chats.push({
        environmentId,
        threadId: thread.id,
        title: thread.title,
        state,
        updatedAt: DateTime.toEpochMillis(raw.updatedAt),
      });
    }
  }
  return chats
    .toSorted((a, b) => b.updatedAt - a.updatedAt)
    .map(({ updatedAt: _updatedAt, ...chat }) => chat);
}

/** Feeds the desktop's floating Ghost pet and opens the chats it is clicked for. */
export function startGhostPetFeed(registry: AtomRegistry.AtomRegistry, router: AnyRouter) {
  const bridge = window.desktopBridge;
  if (!bridge?.setGhostPet || !bridge.onGhostPetCommand) return () => {};
  const setGhostPet = bridge.setGhostPet;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let sent: string | null = null;
  const send = () => {
    timer = undefined;
    const chats = getClientSettings().ghostPetEnabled ? collectChats(registry) : null;
    const serialized = JSON.stringify(chats);
    if (serialized === sent) return;
    sent = serialized;
    void setGhostPet(chats === null ? null : { chats }).catch(() => {
      sent = null;
    });
  };
  const schedule = () => {
    timer ??= setTimeout(send, SEND_DELAY_MS);
  };

  const environmentSubscriptions = new Map<EnvironmentId, () => void>();
  const syncEnvironments = () => {
    const ids = new Set(registry.get(environmentSummaries.environmentIdsAtom));
    for (const [id, unsubscribe] of environmentSubscriptions) {
      if (ids.has(id)) continue;
      unsubscribe();
      environmentSubscriptions.delete(id);
    }
    for (const id of ids) {
      if (environmentSubscriptions.has(id)) continue;
      const stops = [
        registry.subscribe(environmentShell.stateValueAtom(id), schedule),
        registry.subscribe(environmentThreadShells.pendingSubagentRequestsAtom(id), schedule),
      ];
      environmentSubscriptions.set(id, () => stops.forEach((stop) => stop()));
    }
    schedule();
  };

  const stops = [
    registry.subscribe(environmentSummaries.environmentIdsAtom, syncEnvironments),
    registry.subscribe(environmentThreadShells.hiddenThreadKeysAtom, schedule),
    registry.subscribe(environmentThreadShells.delegatedUnderParentAtom, schedule),
    subscribeClientSettings(schedule),
    bridge.onGhostPetCommand((command) => {
      if (command.type === "hide") {
        void updateClientSettings({ ghostPetEnabled: false });
        return;
      }
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: {
          environmentId: command.environmentId as EnvironmentId,
          threadId: command.threadId as ThreadId,
        },
      });
    }),
  ];
  syncEnvironments();

  return () => {
    clearTimeout(timer);
    for (const stop of stops) stop();
    for (const unsubscribe of environmentSubscriptions.values()) unsubscribe();
    environmentSubscriptions.clear();
  };
}
