import { contextBridge, ipcRenderer } from "electron";

import { GHOST_PET_UPDATE_CHANNEL, GHOST_PET_WINDOW_CHANNEL } from "./ipc/channels.ts";

// The Ghost pet window (pet.html) gets only these two calls; it never sees the app bridge.
contextBridge.exposeInMainWorld("ghostPet", {
  onUpdate: (listener: (update: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, update: unknown) => listener(update);
    ipcRenderer.on(GHOST_PET_UPDATE_CHANNEL, handler);
    return () => ipcRenderer.removeListener(GHOST_PET_UPDATE_CHANNEL, handler);
  },
  send: (message: unknown) => ipcRenderer.send(GHOST_PET_WINDOW_CHANNEL, message),
});
