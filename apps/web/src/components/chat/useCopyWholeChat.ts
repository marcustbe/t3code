import { useEffect, useEffectEvent } from "react";
import type { TimelineEntry } from "../../session-logic";
import { chatTranscriptMarkdown } from "./chatTranscriptMarkdown";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * ⌘A outside a text field selects the whole chat; the next ⌘C copies it as Markdown
 * built from the messages, since the virtualized list only has the visible rows in the DOM.
 */
export function useCopyWholeChat(
  viewport: HTMLElement | null,
  entries: ReadonlyArray<TimelineEntry>,
) {
  const transcript = useEffectEvent(() => chatTranscriptMarkdown(entries));

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- listens for document-level select-all and copy keys
  useEffect(() => {
    if (!viewport) return;
    let armed = false;

    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === "a" && !event.shiftKey && !event.altKey) {
        if (event.defaultPrevented || isEditableTarget(event.target)) return;
        const active = document.activeElement;
        if (active && active !== document.body && !viewport.contains(active)) return;
        if (viewport.getClientRects().length === 0) return;
        event.preventDefault();
        window.getSelection()?.selectAllChildren(viewport);
        armed = true;
        return;
      }
      if (mod && key === "c") return;
      if (["Meta", "Control", "Shift", "Alt"].includes(event.key)) return;
      armed = false;
    };
    const disarm = () => {
      armed = false;
    };
    const onCopy = (event: ClipboardEvent) => {
      if (!armed || !event.clipboardData) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.clipboardData.setData("text/plain", transcript());
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", disarm, true);
    document.addEventListener("copy", onCopy, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", disarm, true);
      document.removeEventListener("copy", onCopy, true);
    };
  }, [viewport]);
}
