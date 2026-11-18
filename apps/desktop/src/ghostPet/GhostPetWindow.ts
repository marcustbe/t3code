// @effect-diagnostics globalTimers:off -- Cursor polling and the drag follow run on Electron's main loop only while the pet window is open.
import * as Electron from "electron";
import { msg } from "gt-i18n";

import { m } from "../i18n/messages.ts";

import { GHOST_PET_UPDATE_CHANNEL, GHOST_PET_WINDOW_CHANNEL } from "../ipc/channels.ts";

// The window holds the Ghost plus room for its speech bubble beside it. Everything but the Ghost
// and an open bubble lets clicks through to the windows below.
const WIDTH = 380;
const HEIGHT = 280;
const GHOST = 88;
const EDGE = 6;
const CURSOR_MS = 66;

export interface GhostPetChat {
  readonly environmentId: string;
  readonly threadId: string;
  readonly title: string;
  readonly state: "working" | "needs" | "done" | "failed";
}

type PetMessage =
  | { type: "interactive"; value: boolean }
  | { type: "drag-start" }
  | { type: "drag-end" }
  | { type: "open"; environmentId: string; threadId: string }
  | { type: "reveal" }
  | { type: "menu" };

interface Options {
  readonly preload: string;
  readonly url: string;
  readonly initialCenter: Electron.Point | null;
  readonly saveCenter: (center: Electron.Point) => void;
  readonly onOpen: (thread: { environmentId: string; threadId: string } | null) => void;
  readonly onHide: () => void;
}

export class GhostPetWindow {
  private window: Electron.BrowserWindow | null = null;
  private chats: ReadonlyArray<GhostPetChat> = [];
  private center: Electron.Point | null;
  private side: "left" | "right" = "right";
  private drag: { cursor: Electron.Point; center: Electron.Point; timer: NodeJS.Timeout } | null =
    null;
  private cursorTimer: NodeJS.Timeout | null = null;
  private lastCursor = { x: Number.NaN, y: Number.NaN };

  private readonly options: Options;

  constructor(options: Options) {
    this.options = options;
    this.center = options.initialCenter;
    Electron.ipcMain.on(GHOST_PET_WINDOW_CHANNEL, this.onMessage);
    Electron.screen.on("display-removed", this.relayout);
    Electron.screen.on("display-metrics-changed", this.relayout);
  }

  update(chats: ReadonlyArray<GhostPetChat> | null) {
    if (chats === null) {
      this.close();
      return;
    }
    this.chats = chats;
    if (!this.window) this.open();
    else this.send();
  }

  close() {
    this.stopDrag();
    if (this.cursorTimer) clearInterval(this.cursorTimer);
    this.cursorTimer = null;
    const window = this.window;
    this.window = null;
    if (window && !window.isDestroyed()) window.destroy();
  }

  dispose() {
    this.close();
    Electron.ipcMain.removeListener(GHOST_PET_WINDOW_CHANNEL, this.onMessage);
    Electron.screen.removeListener("display-removed", this.relayout);
    Electron.screen.removeListener("display-metrics-changed", this.relayout);
  }

  private open() {
    const window = new Electron.BrowserWindow({
      ...this.bounds(),
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      roundedCorners: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: "Ghost",
      webPreferences: {
        preload: this.options.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    this.window = window;
    window.setAlwaysOnTop(true, "floating");
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    window.setIgnoreMouseEvents(true, { forward: true });
    window.webContents.on("did-finish-load", () => {
      this.send();
      if (!window.isDestroyed()) window.showInactive();
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.on("closed", () => {
      if (this.window === window) this.close();
    });
    void window.loadURL(this.options.url).catch(() => undefined);
    // The eye follows the pointer anywhere on screen, not only over this window.
    this.cursorTimer = setInterval(this.sendCursor, CURSOR_MS);
  }

  private send() {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    window.webContents.send(GHOST_PET_UPDATE_CHANNEL, {
      type: "state",
      chats: this.chats,
      side: this.side,
      ghost: GHOST,
      edge: EDGE,
    });
  }

  private sendCursor = () => {
    const window = this.window;
    if (!window || window.isDestroyed() || this.drag) return;
    const cursor = Electron.screen.getCursorScreenPoint();
    if (cursor.x === this.lastCursor.x && cursor.y === this.lastCursor.y) return;
    this.lastCursor = cursor;
    const center = this.ghostCenter();
    window.webContents.send(GHOST_PET_UPDATE_CHANNEL, {
      type: "cursor",
      dx: cursor.x - center.x,
      dy: cursor.y - center.y,
    });
  };

  private defaultCenter(): Electron.Point {
    const area = Electron.screen.getPrimaryDisplay().workArea;
    return { x: area.x + area.width - GHOST / 2 - 16, y: area.y + area.height - GHOST / 2 - 16 };
  }

  private ghostCenter(): Electron.Point {
    const center = this.center ?? this.defaultCenter();
    const area = Electron.screen.getDisplayNearestPoint(center).workArea;
    const half = GHOST / 2;
    return {
      x: Math.min(Math.max(center.x, area.x + half), area.x + area.width - half),
      y: Math.min(Math.max(center.y, area.y + half), area.y + area.height - half),
    };
  }

  /** The Ghost sits at one side of the window; its bubble opens toward the screen's middle. */
  private bounds(): Electron.Rectangle {
    const center = this.ghostCenter();
    const area = Electron.screen.getDisplayNearestPoint(center).workArea;
    this.side = center.x > area.x + area.width / 2 ? "right" : "left";
    const ghostX = this.side === "right" ? WIDTH - EDGE - GHOST / 2 : EDGE + GHOST / 2;
    return {
      x: Math.round(center.x - ghostX),
      y: Math.round(center.y - HEIGHT / 2),
      width: WIDTH,
      height: HEIGHT,
    };
  }

  private relayout = () => {
    const window = this.window;
    if (!window || window.isDestroyed() || this.drag) return;
    window.setBounds(this.bounds());
    this.send();
  };

  private stopDrag() {
    if (!this.drag) return;
    clearInterval(this.drag.timer);
    this.drag = null;
  }

  private onMessage = (event: Electron.IpcMainEvent, raw: unknown) => {
    const window = this.window;
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return;
    if (typeof raw !== "object" || raw === null) return;
    const message = raw as PetMessage;
    switch (message.type) {
      case "interactive":
        window.setIgnoreMouseEvents(!message.value, { forward: true });
        return;
      case "drag-start": {
        this.stopDrag();
        const cursor = Electron.screen.getCursorScreenPoint();
        const center = this.ghostCenter();
        const bounds = window.getBounds();
        const timer = setInterval(() => {
          if (window.isDestroyed()) return this.stopDrag();
          const now = Electron.screen.getCursorScreenPoint();
          window.setPosition(
            Math.round(bounds.x + now.x - cursor.x),
            Math.round(bounds.y + now.y - cursor.y),
          );
          this.center = { x: center.x + now.x - cursor.x, y: center.y + now.y - cursor.y };
        }, 16);
        this.drag = { cursor, center, timer };
        return;
      }
      case "drag-end":
        this.stopDrag();
        this.center = this.ghostCenter();
        this.options.saveCenter(this.center);
        this.relayout();
        return;
      case "open":
        if (typeof message.environmentId === "string" && typeof message.threadId === "string") {
          this.options.onOpen({ environmentId: message.environmentId, threadId: message.threadId });
        }
        return;
      case "reveal":
        this.options.onOpen(null);
        return;
      case "menu":
        Electron.Menu.buildFromTemplate([
          { label: m(msg("Open Ghost")), click: () => this.options.onOpen(null) },
          { type: "separator" },
          { label: m(msg("Hide Ghost Pet")), click: () => this.options.onHide() },
        ]).popup({ window });
        return;
    }
  };
}
