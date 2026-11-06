import { useEffect, useEffectEvent } from "react";
import { isEditableFocused } from "../../lib/editableFocus";
import { isPreviewFocused } from "../../lib/previewFocus";
import { isTerminalFocused } from "../../lib/terminalFocus";
import { registerCommands } from "../../shortcuts/dispatcher";
import { TYPE_TO_FOCUS_FLOATING_LAYER_SELECTOR } from "./composerFocusRedirect";

function isComposerTarget(event: KeyboardEvent): boolean {
  const target = event.target instanceof Element ? event.target : null;
  return target?.closest('[data-testid="composer-editor"]') != null;
}

function escapeBelongsElsewhere(event: KeyboardEvent): boolean {
  return (
    document.querySelector(TYPE_TO_FOCUS_FLOATING_LAYER_SELECTOR) !== null ||
    (isEditableFocused(event.target) && !isComposerTarget(event)) ||
    isTerminalFocused() ||
    isPreviewFocused()
  );
}

/**
 * Escape stops the running turn when nothing else claims it: no open menu or dialog, no editor
 * but the composer, no terminal or browser. Layers are read in the capture phase, because one
 * that closes on this Escape is already gone when it bubbles. ProseMirror prevents the default of
 * every Escape in the composer, so that alone doesn't count as consumed there; the composer's own
 * menu dismissal stops propagation, so its Escape never reaches the observer.
 */
export function useEscapeToStop(input: { readonly enabled: boolean; readonly stop: () => void }) {
  const stop = useEffectEvent(() => {
    if (input.enabled) input.stop();
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers keyboard dispatcher scopes for Escape for the component's lifetime
  useEffect(() => {
    let claimed = false;
    let fromComposer = false;
    const disposeCapture = registerCommands(
      {},
      {
        capture: true,
        onKeyDown: (event) => {
          if (event.key === "Escape") {
            claimed = escapeBelongsElsewhere(event);
            fromComposer = isComposerTarget(event);
          }
          return false;
        },
      },
    );
    const disposeObserver = registerCommands(
      {},
      {
        observe: (event, consumed) => {
          if (event.key !== "Escape") return;
          const wasClaimed = claimed;
          const wasFromComposer = fromComposer;
          claimed = false;
          fromComposer = false;
          if ((consumed && !wasFromComposer) || wasClaimed) return;
          if (event.repeat || event.isComposing || event.keyCode === 229) return;
          stop();
        },
      },
    );
    return () => {
      disposeCapture();
      disposeObserver();
    };
  }, []);
}
