import { useEffect, useRef } from "react";

import { observeResize } from "~/lib/observeResize";

import { forwardWheelToTimeline } from "./timelineMinimapWheel";

const MIN_THUMB_HEIGHT = 28;

/**
 * The chat's scrollbar, drawn over the timeline instead of the native one: a ::-webkit-scrollbar
 * thumb can't animate its width, and its asymmetric borders clipped the pill's ends. It sits in
 * the scroller's gutter, runs from under the header to the window's bottom corner, and widens to
 * the left while hovered or dragged (`.timeline-scrollbar` in `index.css`).
 */
export function TimelineScrollbar({ scrollNode }: { scrollNode: HTMLElement | null }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- follows the list's DOM scroller and size
  useEffect(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!scrollNode || !track || !thumb) return;
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const { scrollTop, scrollHeight, clientHeight } = scrollNode;
      const trackHeight = track.clientHeight;
      const range = scrollHeight - clientHeight;
      if (range <= 1 || trackHeight <= 0) {
        track.dataset.hidden = "true";
        return;
      }
      delete track.dataset.hidden;
      const thumbHeight = Math.min(
        trackHeight,
        Math.max(MIN_THUMB_HEIGHT, (trackHeight * clientHeight) / scrollHeight),
      );
      const offset = (Math.min(Math.max(scrollTop, 0), range) / range) * (trackHeight - thumbHeight);
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.transform = `translateY(${offset}px)`;
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };
    update();
    scrollNode.addEventListener("scroll", schedule, { passive: true });
    const observeSizes = () => observeResize([scrollNode, track, ...scrollNode.children], schedule);
    let stopObservingSizes = observeSizes();
    // LegendList swaps and resizes its content container as rows lay out.
    const mutationObserver = new MutationObserver(() => {
      stopObservingSizes();
      stopObservingSizes = observeSizes();
      schedule();
    });
    mutationObserver.observe(scrollNode, { childList: true });
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      scrollNode.removeEventListener("scroll", schedule);
      stopObservingSizes();
      mutationObserver.disconnect();
    };
  }, [scrollNode]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- native listener: React's wheel is passive
  useEffect(() => {
    const track = trackRef.current;
    if (!scrollNode || !track) return;
    const onWheel = (event: WheelEvent) => forwardWheelToTimeline(event, scrollNode);
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => track.removeEventListener("wheel", onWheel);
  }, [scrollNode]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!scrollNode || !track || !thumb || event.button !== 0) return;
    event.preventDefault();
    const range = scrollNode.scrollHeight - scrollNode.clientHeight;
    const travel = track.clientHeight - thumb.offsetHeight;
    if (range <= 0 || travel <= 0) return;
    const trackTop = track.getBoundingClientRect().top;
    const thumbRect = thumb.getBoundingClientRect();
    // A press on the track jumps the thumb's middle there; a press on the thumb keeps its grip.
    const grip =
      event.clientY >= thumbRect.top && event.clientY <= thumbRect.bottom
        ? event.clientY - thumbRect.top
        : thumb.offsetHeight / 2;
    const scrollToPointer = (clientY: number) => {
      const offset = Math.min(Math.max(clientY - trackTop - grip, 0), travel);
      scrollNode.scrollTo({ top: (offset / travel) * range, behavior: "instant" });
    };
    scrollToPointer(event.clientY);
    track.setPointerCapture(event.pointerId);
    track.dataset.dragging = "true";
    const onMove = (moveEvent: PointerEvent) => scrollToPointer(moveEvent.clientY);
    const onEnd = () => {
      delete track.dataset.dragging;
      track.removeEventListener("pointermove", onMove);
      track.removeEventListener("pointerup", onEnd);
      track.removeEventListener("pointercancel", onEnd);
    };
    track.addEventListener("pointermove", onMove);
    track.addEventListener("pointerup", onEnd);
    track.addEventListener("pointercancel", onEnd);
  };

  return (
    <div
      ref={trackRef}
      aria-hidden="true"
      className="timeline-scrollbar"
      data-hidden="true"
      onPointerDown={handlePointerDown}
    >
      <div ref={thumbRef} className="timeline-scrollbar-thumb" />
    </div>
  );
}
