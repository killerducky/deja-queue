const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  readFile: (filePath) => {
    return ipcRenderer.invoke("read-file", filePath);
  },
  sendBroadcast: (msg) => ipcRenderer.send("broadcast", msg),
  onBroadcast: (callback) =>
    ipcRenderer.on("broadcast", (event, msg) => callback(msg)),
  get: (key) => ipcRenderer.sendSync("store-get-sync", key),
  set: (key, value) => ipcRenderer.sendSync("store-set-sync", key, value),
});
