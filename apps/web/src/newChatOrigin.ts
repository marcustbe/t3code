import type { ScopedThreadRef } from "@t3tools/contracts";
import type { DraftId } from "./composerDraftStore";

// The chat a new chat was opened from, so ⌘W on the unsent new chat goes back to it.
const originByDraftId = new Map<DraftId, ScopedThreadRef>();

export function rememberNewChatOrigin(draftId: DraftId, origin: ScopedThreadRef | null): void {
  if (origin) originByDraftId.set(draftId, origin);
  else originByDraftId.delete(draftId);
}

export function readNewChatOrigin(draftId: DraftId): ScopedThreadRef | null {
  return originByDraftId.get(draftId) ?? null;
}
