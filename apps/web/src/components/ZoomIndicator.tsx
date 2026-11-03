import { useEffect, useState } from "react";

const VISIBLE_MS = 1200;

/** Shows the window's zoom level for a moment after ⌘+ / ⌘− / ⌘0 change it (desktop). */
export function ZoomIndicator() {
  const [percent, setPercent] = useState<number | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- follows Chromium's zoom, which only surfaces as a window resize
  useEffect(() => {
    const readZoom = window.desktopBridge?.getWindowZoomFactor;
    if (!readZoom) return;
    let zoom = readZoom();
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      const next = readZoom();
      if (Math.abs(next - zoom) < 0.001) return;
      zoom = next;
      setPercent(Math.round(next * 100));
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setPercent(null), VISIBLE_MS);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(hideTimer);
    };
  }, []);

  if (percent === null) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      // Like Chrome's zoom bubble: top right, under the top-right buttons, on their right edge.
      className="popup-glass pointer-events-none fixed top-(--workspace-topbar-height) right-(--topbar-side-padding) z-50 rounded-full px-3 py-1 font-medium text-sm text-foreground tabular-nums shadow-lg"
    >
      {percent}%
    </div>
  );
}
