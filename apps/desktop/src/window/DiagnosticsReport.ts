// @effect-diagnostics nodeBuiltinImport:off -- runs from a menu click while the renderer may be hung; plain Node I/O, no runtime needed.
// @effect-diagnostics globalTimers:off -- timeouts guard debugger calls a hung renderer may never answer.
// @effect-diagnostics globalDate:off -- wall-clock stamps for the report and its file name.
import * as Electron from "electron";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

// Help › Save Diagnostics Report, for a window that animates but takes no input: compositor
// animations keep running while the renderer's main thread is stuck, so the report pauses that
// thread through the debugger to see what it runs, then asks the page what is covering it.

const RECENT_EVENT_LIMIT = 200;
const RENDERER_ANSWER_TIMEOUT_MS = 2_000;

interface RecentEvent {
  readonly at: string;
  readonly kind: string;
  readonly detail: string;
}

const recentEvents = new WeakMap<Electron.WebContents, RecentEvent[]>();

function record(contents: Electron.WebContents, kind: string, detail: string): void {
  const events = recentEvents.get(contents) ?? [];
  events.push({ at: new Date().toISOString(), kind, detail });
  if (events.length > RECENT_EVENT_LIMIT) events.splice(0, events.length - RECENT_EVENT_LIMIT);
  recentEvents.set(contents, events);
}

/** Keeps the window's recent warnings, errors, hangs and crashes for the report. */
export function trackDiagnostics(window: Electron.BrowserWindow): void {
  const contents = window.webContents;
  contents.on("console-message", (event) => {
    if (event.level === "warning" || event.level === "error") {
      record(
        contents,
        `console.${event.level}`,
        `${event.message} (${event.sourceId}:${event.lineNumber})`,
      );
    }
  });
  window.on("unresponsive", () => record(contents, "unresponsive", "Window stopped responding"));
  window.on("responsive", () => record(contents, "responsive", "Window responds again"));
  contents.on("render-process-gone", (_event, details) =>
    record(contents, "render-process-gone", `${details.reason} (exit ${details.exitCode})`),
  );
  contents.on("preload-error", (_event, preloadPath, error) =>
    record(contents, "preload-error", `${preloadPath}: ${error.message}`),
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([
    promise,
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms)),
  ]);
}

/** What the page says about itself: focus, dialogs, and anything that could swallow input. */
const PAGE_STATE_SCRIPT = `(() => {
  const describe = (element) => {
    if (!element) return null;
    const id = element.id ? "#" + element.id : "";
    const classes = typeof element.className === "string" && element.className
      ? "." + element.className.trim().split(/\\s+/).slice(0, 4).join(".")
      : "";
    const slot = element.getAttribute && element.getAttribute("data-slot");
    return element.tagName.toLowerCase() + id + classes + (slot ? "[data-slot=" + slot + "]" : "");
  };
  const body = document.body;
  const bodyStyle = getComputedStyle(body);
  const centre = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  const openLayers = [...document.querySelectorAll(
    "[role=dialog], [role=alertdialog], [data-open], [data-popup-open], dialog[open], [inert]"
  )].slice(0, 30).map((element) => describe(element));
  const blockers = [...document.querySelectorAll("body *")].filter((element) => {
    const style = getComputedStyle(element);
    if (style.position !== "fixed" && style.position !== "absolute") return false;
    const rect = element.getBoundingClientRect();
    return rect.width >= innerWidth * 0.9 && rect.height >= innerHeight * 0.9 &&
      style.pointerEvents !== "none" && style.visibility !== "hidden";
  }).slice(0, 20).map((element) => describe(element) + " z=" + getComputedStyle(element).zIndex);
  return {
    url: location.href,
    title: document.title,
    visibility: document.visibilityState,
    hasFocus: document.hasFocus(),
    activeElement: describe(document.activeElement),
    elementAtCentre: describe(centre),
    bodyCursor: bodyStyle.cursor,
    bodyPointerEvents: bodyStyle.pointerEvents,
    bodyUserSelect: bodyStyle.userSelect,
    htmlAttributes: [...document.documentElement.attributes].map((a) => a.name + "=" + a.value.slice(0, 80)),
    bodyAttributes: [...body.attributes].map((a) => a.name + "=" + a.value.slice(0, 80)),
    openLayers,
    fullWindowLayers: blockers,
    domNodes: document.getElementsByTagName("*").length,
    jsHeapUsedMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  };
})()`;

/** Pauses the page's JavaScript for a moment and returns the stack it was running, if any. */
async function captureRendererStack(contents: Electron.WebContents): Promise<string> {
  const debuggerApi = contents.debugger;
  if (debuggerApi.isAttached()) return "Not captured: DevTools is attached.";
  try {
    debuggerApi.attach("1.3");
  } catch (error) {
    return `Not captured: ${String(error)}`;
  }
  try {
    const paused = new Promise<string>((resolve) => {
      debuggerApi.on("message", (_event, method, params) => {
        if (method !== "Debugger.paused") return;
        const frames = (params as { callFrames?: Array<Record<string, unknown>> }).callFrames ?? [];
        resolve(
          frames
            .slice(0, 40)
            .map((frame) => {
              const location = frame.location as { lineNumber: number; columnNumber: number };
              const name = (frame.functionName as string) || "(anonymous)";
              return `  at ${name} (${String(frame.url)}:${location.lineNumber + 1}:${location.columnNumber + 1})`;
            })
            .join("\n") || "  (paused with no JavaScript on the stack: the thread was idle)",
        );
      });
    });
    await withTimeout(debuggerApi.sendCommand("Debugger.enable"), RENDERER_ANSWER_TIMEOUT_MS);
    await withTimeout(debuggerApi.sendCommand("Debugger.pause"), RENDERER_ANSWER_TIMEOUT_MS);
    const stack = await withTimeout(paused, RENDERER_ANSWER_TIMEOUT_MS);
    await withTimeout(debuggerApi.sendCommand("Debugger.resume"), RENDERER_ANSWER_TIMEOUT_MS).catch(
      () => undefined,
    );
    return stack === "timeout" ? "Not captured: the renderer did not pause in time." : stack;
  } catch (error) {
    return `Not captured: ${String(error)}`;
  } finally {
    try {
      debuggerApi.detach();
    } catch {
      // Already detached (the renderer went away).
    }
  }
}

function formatMetrics(): string {
  return Electron.app
    .getAppMetrics()
    .map(
      (metric) =>
        `  ${metric.type.padEnd(10)} pid ${String(metric.pid).padEnd(7)} cpu ${metric.cpu.percentCPUUsage.toFixed(1).padStart(5)}%  memory ${Math.round(metric.memory.workingSetSize / 1024)} MB${metric.name ? `  ${metric.name}` : ""}`,
    )
    .join("\n");
}

/** Builds the report for the window, saves it in the app's logs folder and shows it in Finder. */
export async function saveDiagnosticsReport(window: Electron.BrowserWindow): Promise<string> {
  const contents = window.webContents;
  const pageState = await withTimeout(
    contents.executeJavaScript(PAGE_STATE_SCRIPT, true).catch((error: unknown) => ({
      error: String(error),
    })),
    RENDERER_ANSWER_TIMEOUT_MS,
  );
  const rendererBusy = pageState === "timeout";
  const stack = await captureRendererStack(contents);
  const events = recentEvents.get(contents) ?? [];
  const lines = [
    `T3 Code diagnostics, ${new Date().toISOString()}`,
    `App ${Electron.app.getVersion()} · Electron ${process.versions.electron} · Chrome ${process.versions.chrome} · macOS ${process.getSystemVersion()}`,
    "",
    "Window",
    `  focused ${window.isFocused()} · visible ${window.isVisible()} · fullscreen ${window.isFullScreen()} · bounds ${JSON.stringify(window.getBounds())}`,
    `  zoom ${contents.getZoomFactor().toFixed(2)} · loading ${contents.isLoading()} · crashed ${contents.isCrashed()} · renderer pid ${contents.getOSProcessId()}`,
    "",
    "Renderer main thread",
    rendererBusy
      ? `  Did not answer within ${RENDERER_ANSWER_TIMEOUT_MS} ms: busy or hung (animations can keep running).`
      : "  Answered.",
    "  JavaScript stack when paused:",
    stack,
    "",
    "Page state",
    rendererBusy
      ? "  (not available, the page did not answer)"
      : JSON.stringify(pageState, null, 2),
    "",
    "Processes",
    formatMetrics(),
    "",
    `Recent warnings, errors and hangs (${events.length})`,
    ...(events.length === 0
      ? ["  none"]
      : events.map((event) => `  ${event.at} ${event.kind}: ${event.detail}`)),
    "",
  ];
  const folder = Electron.app.getPath("logs");
  await NodeFSP.mkdir(folder, { recursive: true });
  const file = NodePath.join(
    folder,
    `diagnostics-${new Date().toISOString().replaceAll(":", "-").replace(/\..+/, "")}.txt`,
  );
  await NodeFSP.writeFile(file, lines.join("\n"), "utf8");
  Electron.shell.showItemInFolder(file);
  return file;
}
