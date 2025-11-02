const { contextBridge, ipcRenderer, shell } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  readFile: (filePath) => {
    return ipcRenderer.invoke("read-file", filePath);
  },
  sendBroadcast: (msg) => ipcRenderer.send("broadcast", msg),
  onBroadcast: (callback) =>
    ipcRenderer.on("broadcast", (event, msg) => callback(msg)),
  get: (key, defaultValue = null) =>
    ipcRenderer.sendSync("store-get-sync", { key, defaultValue }),
  set: (key, value) => ipcRenderer.sendSync("store-set-sync", key, value),
  openExternal: (url) => {
    return ipcRenderer.invoke("openExternal", url);
  },
});
