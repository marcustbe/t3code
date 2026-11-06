let current: WeakRef<HTMLMediaElement> | null = null;

/** Pauses whatever audio or video was playing before this one starts. Muted previews don't count. */
export function claimExclusivePlayback(element: HTMLMediaElement) {
  if (element.muted) return;
  const previous = current?.deref();
  if (previous && previous !== element && !previous.paused) previous.pause();
  current = new WeakRef(element);
}
