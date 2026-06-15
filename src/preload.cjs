const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopPet", {
  onCursorUpdate(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("cursor:update", listener);
    return () => ipcRenderer.removeListener("cursor:update", listener);
  },
  onLockUpdate(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("lock:update", listener);
    return () => ipcRenderer.removeListener("lock:update", listener);
  },
  onWalkUpdate(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("walk:update", listener);
    return () => ipcRenderer.removeListener("walk:update", listener);
  },
  setAction(action) {
    ipcRenderer.send("pet:action", { action });
  }
});
