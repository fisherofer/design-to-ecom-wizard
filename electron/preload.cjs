/**
 * Preload bridge — exposes a tiny, explicit API to the renderer.
 * No Node access leaks into the page: only these named channels.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("oferDesktop", {
  isDesktop: true,
  info: () => ipcRenderer.invoke("portable:info"),
  get: (key) => ipcRenderer.invoke("portable:get", key),
  set: (key, value) => ipcRenderer.invoke("portable:set", key, value),
  remove: (key) => ipcRenderer.invoke("portable:delete", key),
  all: () => ipcRenderer.invoke("portable:all"),
  logAppend: (kind, payload) => ipcRenderer.invoke("portable:logAppend", kind, payload),
  logRead: (kind, limit) => ipcRenderer.invoke("portable:logRead", kind, limit),
  chooseDataDir: () => ipcRenderer.invoke("portable:chooseDataDir"),
  revealDataDir: () => ipcRenderer.invoke("portable:revealDataDir"),
  migrate: (entries) => ipcRenderer.invoke("portable:migrate", entries),
});
