/**
 * Electron `<webview>` guests (and iframes) take the mouse while it is over them, even mid-drag
 * with pointer capture, so a drag released over the browser never sees its pointerup and stays
 * stuck. Drags call this to make embedded content transparent to the pointer until they end.
 */
let holders = 0;
const previousPointerEvents = new Map<HTMLElement, string>();

export function shieldEmbeddedContent(doc: Document = document): () => void {
  holders += 1;
  if (holders === 1) {
    for (const element of doc.querySelectorAll<HTMLElement>("webview, iframe")) {
      previousPointerEvents.set(element, element.style.pointerEvents);
      element.style.pointerEvents = "none";
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders > 0) return;
    for (const [element, value] of previousPointerEvents) element.style.pointerEvents = value;
    previousPointerEvents.clear();
  };
}
