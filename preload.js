const { contextBridge, ipcRenderer } = require("electron");

// Expose limited APIs to the renderer
// aolsen: More code I got from probably chatGPT but never used
// contextBridge.exposeInMainWorld("ytControl", {
//   play: () => {
//     document.querySelector("video")?.play();
//   },
//   pause: () => {
//     document.querySelector("video")?.pause();
//   },
//   next: () => {
//     // YouTube's "Next video" button
//     document.querySelector(".ytp-next-button")?.click();
//   },
//   getTime: () => {
//     return document.querySelector("video")?.currentTime || 0;
//   },
//   seek: (seconds) => {
//     const video = document.querySelector("video");
//     if (video) video.currentTime = seconds;
//   },
// });
contextBridge.exposeInMainWorld("electronAPI", {
  // aolsen: I got this from somewhere, don't know where. Seems I never used it.
  // sendMessage: (msg) => ipcRenderer.send("message-from-renderer", msg),
  // onReply: (callback) =>
  //   ipcRenderer.on("reply-from-main", (e, data) => callback(data)),

  readFile: (filePath) => {
    return ipcRenderer.invoke("read-file", filePath);
  },
  sendBroadcast: (msg) => ipcRenderer.send("broadcast", msg),
  onBroadcast: (callback) =>
    ipcRenderer.on("broadcast", (event, msg) => callback(msg)),
});
