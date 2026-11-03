import type { ClientSettings } from "@t3tools/contracts/settings";

// Upstream's grain: fractal noise drawn at 3.5% (index.css). The setting scales that strength.
const UPSTREAM_GRAIN_OPACITY = 0.035;
// Sidebar rows pad their own content 8px; the rest of the side padding is the rows' inset.
const SIDEBAR_ROW_CONTENT_INSET = 8;

function grainImage(percent: number): string {
  if (percent <= 0) return "none";
  const opacity = ((UPSTREAM_GRAIN_OPACITY * percent) / 100).toFixed(4);
  const svg = `<svg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='${opacity}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Writes Settings › Appearance's grain, top bar blur and edge paddings onto the document. */
export function applyAppearanceLayout(root: HTMLElement, settings: ClientSettings): void {
  const style = root.style;
  style.setProperty("--surface-grain", grainImage(settings.backgroundGrain));
  style.setProperty("--surface-grain-size", "256px 256px");
  style.setProperty("--top-bar-blur", `${settings.topBarBlur}px`);
  const side = settings.sidebarSidePadding;
  style.setProperty("--sidebar-side-padding", `${side}px`);
  style.setProperty("--sidebar-side-inset", `${Math.max(0, side - SIDEBAR_ROW_CONTENT_INSET)}px`);
  style.setProperty(
    "--sidebar-row-content-inset",
    `${Math.min(SIDEBAR_ROW_CONTENT_INSET, side)}px`,
  );
  style.setProperty("--sidebar-bottom-padding", `${settings.sidebarBottomPadding}px`);
  style.setProperty("--topbar-side-padding", `${settings.topBarSidePadding}px`);
  style.setProperty("--browser-side-padding", `${settings.browserSidePadding}px`);
  style.setProperty("--browser-top-padding", `${settings.browserTopPadding}px`);
  style.setProperty("--browser-bottom-padding", `${settings.browserBottomPadding}px`);
  // The window buttons are native, so the desktop app places them (and sizes the top bar to them).
  void window.desktopBridge?.setWindowButtonInsets?.({
    top: settings.windowTopPadding,
    left: side,
  });
}
