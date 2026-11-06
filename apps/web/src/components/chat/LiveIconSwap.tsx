import { useEffect, useRef, useState, type ReactNode } from "react";

// Cross-fades the live activity icon (the Thinking Ghost, a terminal, a file...) when it changes.
// The Thinking row and a tool row are different timeline rows, so a freshly mounted live row
// picks up the icon the previous live row was showing and plays the swap from it.

interface ShownIcon {
  readonly key: string;
  readonly node: ReactNode;
}

const HANDOFF_MS = 400;
// One slot per visual variant: the shimmer overlay renders a second, highlighted copy.
const lastLiveIcon = new Map<string, { icon: ShownIcon; unmountedAt: number | null }>();

function handoff(slot: string, key: string): ShownIcon | null {
  const last = lastLiveIcon.get(slot);
  if (!last || last.icon.key === key) return null;
  if (last.unmountedAt !== null && performance.now() - last.unmountedAt > HANDOFF_MS) return null;
  return last.icon;
}

export function LiveIconSwap({
  iconKey,
  slot,
  children,
}: {
  iconKey: string;
  /** Rows that should hand their icon to the next live row share a slot; omit to only swap in place. */
  slot?: string | undefined;
  children: ReactNode;
}) {
  const [state, setState] = useState(() => {
    const previous = slot ? handoff(slot, iconKey) : null;
    return { key: iconKey, node: children, previous, entering: previous !== null };
  });
  if (state.key !== iconKey) {
    setState({
      key: iconKey,
      node: children,
      previous: { key: state.key, node: state.node },
      entering: true,
    });
  }

  const latest = useRef<ShownIcon>({ key: iconKey, node: children });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- records the shown icon outside React so the next live row can animate from it
  useEffect(() => {
    latest.current = { key: iconKey, node: children };
    if (slot) lastLiveIcon.set(slot, { icon: latest.current, unmountedAt: null });
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- marks when this live row left, so a later unrelated row does not animate from a stale icon
  useEffect(() => {
    if (!slot) return;
    return () => {
      const entry = lastLiveIcon.get(slot);
      if (entry && entry.icon === latest.current) entry.unmountedAt = performance.now();
    };
  }, [slot]);

  return (
    <span className="relative inline-flex size-4 items-center justify-center">
      {state.previous ? (
        <span
          key={`out:${state.previous.key}`}
          data-live-icon="out"
          className="absolute inset-0 flex items-center justify-center"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) {
              setState((current) => ({ ...current, previous: null }));
            }
          }}
        >
          {state.previous.node}
        </span>
      ) : null}
      <span
        key={`in:${iconKey}`}
        data-live-icon={state.entering ? "in" : undefined}
        className="flex items-center justify-center"
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) {
            setState((current) => ({ ...current, entering: false }));
          }
        }}
      >
        {children}
      </span>
    </span>
  );
}
