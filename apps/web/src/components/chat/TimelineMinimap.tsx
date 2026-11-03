import { resolveTimelineMinimapPreview, type TimelineMinimapItem } from "./timelineMinimapItems";
import { useRef, useState, type MouseEvent } from "react";
import {
  resolveTimelineMinimapHeightStyle,
  resolveTimelineMinimapIndexFromPointer,
  resolveTimelineMinimapInteractiveWidth,
  resolveTimelineMinimapTopPercent,
  TIMELINE_MINIMAP_MIN_ITEMS,
} from "./MessagesTimeline.logic";
import { cn } from "~/lib/utils";

function timelineMinimapEventTargetsPreview(target: EventTarget): boolean {
  return target instanceof Element && target.closest("[data-minimap-preview]") !== null;
}

// A release outside the window can skip `mouseup`, so the next button-free
// `mousemove` also counts.
function onMouseButtonsReleased(onRelease: () => void): () => void {
  const check = (event: globalThis.MouseEvent) => {
    if (event.buttons !== 0) return;
    stop();
    onRelease();
  };
  const stop = () => {
    window.removeEventListener("mouseup", check);
    window.removeEventListener("mousemove", check);
  };
  window.addEventListener("mouseup", check);
  window.addEventListener("mousemove", check);
  return stop;
}

export function TimelineMinimap({
  hasPersistentGutter,
  hitStripWidth,
  currentIndex,
  items,
  stripMap,
  onWheel,
  onSelect,
}: {
  hasPersistentGutter: boolean;
  hitStripWidth: number;
  currentIndex: number | null;
  items: ReadonlyArray<TimelineMinimapItem>;
  stripMap: Map<string, HTMLSpanElement>;
  onWheel: (event: WheelEvent) => void;
  onSelect: (item: TimelineMinimapItem) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const wheelTargetRef = (node: HTMLDivElement | null) => {
    if (!node) return;
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  };

  const pressedOnStripRef = useRef(false);
  const [passThrough, setPassThrough] = useState(false);

  const resolvedActiveIndex =
    activeIndex !== null && activeIndex < items.length ? activeIndex : null;
  const activeItem = resolveTimelineMinimapPreview(
    resolvedActiveIndex === null ? null : (items[resolvedActiveIndex] ?? null),
  );
  const activeTopPercent =
    resolvedActiveIndex === null
      ? 0
      : resolveTimelineMinimapTopPercent(resolvedActiveIndex, items.length);
  const activeTooltipTranslate =
    resolvedActiveIndex === null
      ? "-50%"
      : resolvedActiveIndex === 0
        ? "0%"
        : resolvedActiveIndex === items.length - 1
          ? "-100%"
          : "-50%";
  const railPadding = `calc(0.5 * ${resolveTimelineMinimapHeightStyle(items.length)} / ${Math.max(1, items.length - 1)})`;
  const resolvedCurrentIndex =
    currentIndex !== null && currentIndex >= 0 && currentIndex < items.length ? currentIndex : null;

  const resolveActiveIndexFromPointer = (event: MouseEvent<HTMLElement>) => {
    // Measure the rail the strips sit on, not the button, which reaches half a gap past it.
    const rect = (event.currentTarget.parentElement ?? event.currentTarget).getBoundingClientRect();
    return resolveTimelineMinimapIndexFromPointer({
      itemCount: items.length,
      railTop: rect.top,
      railHeight: rect.height,
      pointerY: event.clientY,
    });
  };

  const updateActiveIndexFromPointer = (event: MouseEvent<HTMLElement>) => {
    const nextIndex = resolveActiveIndexFromPointer(event);
    setActiveIndex(nextIndex);
  };

  const moveActiveIndex = (delta: number) => {
    setActiveIndex((current) => {
      const base = current ?? 0;
      return Math.max(0, Math.min(items.length - 1, base + delta));
    });
  };

  // Without a gutter beside the chat (a narrow main area, both side panels open) it would sit on
  // the text, so it is left out until there is room again.
  if (items.length < TIMELINE_MINIMAP_MIN_ITEMS || !hasPersistentGutter) {
    return null;
  }

  return (
    <div
      className="group/minimap pointer-events-none absolute inset-y-0 left-0 z-40 hidden w-18 [@media(pointer:fine)]:block"
      data-testid="timeline-minimap"
      data-persistent-gutter={hasPersistentGutter ? "true" : "false"}
      ref={wheelTargetRef}
    >
      <div className="relative h-full w-full select-none">
        <div
          className={cn(
            "absolute top-1/2 left-3 -translate-y-1/2",
            hitStripWidth > 0 && !passThrough ? "pointer-events-auto" : "pointer-events-none",
          )}
          onMouseDown={() => {
            if (pressedOnStripRef.current) return;
            pressedOnStripRef.current = true;
            onMouseButtonsReleased(() => {
              pressedOnStripRef.current = false;
            });
          }}
          onMouseMove={(event) => {
            if (event.buttons === 0 || pressedOnStripRef.current || passThrough) return;
            setPassThrough(true);
            onMouseButtonsReleased(() => setPassThrough(false));
          }}
          style={{
            height: resolveTimelineMinimapHeightStyle(items.length),
            width: resolveTimelineMinimapInteractiveWidth(hitStripWidth, activeItem !== null),
          }}
        >
          <button
            aria-label={`Jump to message: ${activeItem?.userText ?? "User message"}`}
            className="absolute left-0 w-full cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
            // The first and last strips sit on the rail's edges; half a gap past each edge
            // centres every strip in its own hover band.
            style={{ top: `calc(-1 * ${railPadding})`, bottom: `calc(-1 * ${railPadding})` }}
            onBlur={() => setActiveIndex(null)}
            onClick={(event) => {
              if (timelineMinimapEventTargetsPreview(event.target)) {
                return;
              }
              const nextIndex = resolveActiveIndexFromPointer(event);
              const selectedItem = nextIndex === null ? null : (items[nextIndex] ?? null);
              if (selectedItem) {
                onSelect(selectedItem);
              }
              event.currentTarget.blur();
            }}
            onFocus={() => setActiveIndex((current) => current ?? resolvedCurrentIndex ?? 0)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveActiveIndex(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveActiveIndex(-1);
              } else if (event.key === "Home") {
                event.preventDefault();
                setActiveIndex(0);
              } else if (event.key === "End") {
                event.preventDefault();
                setActiveIndex(items.length - 1);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (activeItem) {
                  onSelect(activeItem);
                }
              }
            }}
            onMouseLeave={() => setActiveIndex(null)}
            onMouseMove={(event) => {
              if (event.buttons !== 0 && !pressedOnStripRef.current) return;
              updateActiveIndexFromPointer(event);
            }}
            onMouseDown={(event) => {
              if (timelineMinimapEventTargetsPreview(event.target)) {
                return;
              }
              event.preventDefault();
            }}
            type="button"
          >
            <span
              className="pointer-events-none absolute inset-x-0 block"
              style={{ top: railPadding, bottom: railPadding }}
            >
              {items.map((item, index) => {
                const top = `${resolveTimelineMinimapTopPercent(index, items.length)}%`;
                const activeDistance =
                  resolvedActiveIndex === null ? null : Math.abs(index - resolvedActiveIndex);
                return (
                  // Compositor-friendly on purpose: in-view state and the hover
                  // fisheye animate constantly (every scroll tick and streaming
                  // update flips a band of strips), so the strip animates only
                  // transform and opacity.
                  <span
                    aria-hidden="true"
                    className={cn(
                      "group/strip pointer-events-none absolute left-0 h-0.5 w-6 origin-left -translate-y-1/2 rounded-full transition-transform duration-150",
                      activeDistance === 0 ? "bg-muted-foreground/60" : "bg-muted-foreground/25",
                      activeDistance === 0
                        ? "scale-x-100"
                        : activeDistance === 1
                          ? "scale-x-[0.667]"
                          : activeDistance === 2
                            ? "scale-x-[0.417]"
                            : "scale-x-[0.333]",
                    )}
                    data-in-view="false"
                    data-minimap-strip
                    key={item.id}
                    ref={(node) => {
                      if (node) {
                        stripMap.set(item.id, node);
                      } else {
                        stripMap.delete(item.id);
                      }
                    }}
                    style={{ top }}
                  >
                    <span className="absolute inset-0 rounded-full bg-foreground/55 opacity-0 transition-opacity duration-150 group-data-[in-view=true]/strip:opacity-100" />
                  </span>
                );
              })}
              {activeItem ? (
                <span
                  className="pointer-events-auto absolute left-8 w-80 cursor-text select-text"
                  data-minimap-preview
                  onMouseMove={(event) => event.stopPropagation()}
                  style={{
                    top: `${activeTopPercent}%`,
                    transform: `translateY(${activeTooltipTranslate})`,
                  }}
                >
                  <span className="dropdown-glass block rounded-xl p-3 text-left text-popover-foreground shadow-xl shadow-black/25">
                    <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium leading-5">
                      {activeItem.userText ?? "User message"}
                    </span>
                    {activeItem.assistantText ? (
                      <span
                        className="mt-1 max-h-[3.75rem] overflow-hidden text-muted-foreground text-sm leading-5"
                        style={{
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 3,
                        }}
                      >
                        {activeItem.assistantText}
                      </span>
                    ) : null}
                  </span>
                </span>
              ) : null}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
