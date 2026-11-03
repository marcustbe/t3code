import * as Electron from "electron";

interface WindowBlurAddon {
  readonly setWindowBackgroundBlurRadius: (
    windowNumber: number,
    radius: number,
    nativeWindowHandle: Buffer,
  ) => number;
  // Missing from builds before the backdrop layer.
  readonly setWindowBackdropBlur?: (nativeWindowHandle: Buffer, radius: number) => void;
}

// The window server's blur stops at 60 points; the backdrop layer keeps going. Its radius is a
// different scale: measured over the same stripes, 0.32× matches the window server's (19 ≈ 60,
// 16 ≈ 50), so a saved setting looks the same as before.
const BACKDROP_RADIUS_PER_POINT = 0.32;

// Loaded once; null when no build of native/window-blur exists (blur is then skipped).
let addon: WindowBlurAddon | null | undefined;

function loadAddon(candidatePaths: ReadonlyArray<string>): WindowBlurAddon | null {
  if (addon !== undefined) return addon;
  addon = null;
  for (const candidatePath of candidatePaths) {
    try {
      const module = { exports: {} as Partial<WindowBlurAddon> };
      process.dlopen(module, candidatePath);
      if (typeof module.exports.setWindowBackgroundBlurRadius === "function") {
        addon = module.exports as WindowBlurAddon;
        break;
      }
    } catch {
      // Try the next location.
    }
  }
  return addon;
}

/**
 * Blurs the desktop behind a transparent window (macOS). The window number is the CGWindowID in
 * Electron's media source id ("window:<id>:0").
 */
export function setWindowBackgroundBlur(
  window: Electron.BrowserWindow,
  radius: number,
  candidatePaths: ReadonlyArray<string>,
): void {
  if (window.isDestroyed()) return;
  const blur = loadAddon(candidatePaths);
  if (!blur) return;
  const windowNumber = Number(window.getMediaSourceId().split(":")[1]);
  if (!Number.isInteger(windowNumber) || windowNumber <= 0) return;
  const points = Math.max(0, Math.round(radius));
  if (blur.setWindowBackdropBlur) {
    blur.setWindowBackgroundBlurRadius(windowNumber, 0, window.getNativeWindowHandle());
    blur.setWindowBackdropBlur(window.getNativeWindowHandle(), points * BACKDROP_RADIUS_PER_POINT);
    return;
  }
  blur.setWindowBackgroundBlurRadius(windowNumber, points, window.getNativeWindowHandle());
}
