const { contextBridge, ipcRenderer } = require("electron");

console.log("youtube-preload loaded");

// contextBridge.exposeInMainWorld("electronAPI", {
//   sendBroadcast: (msg) => ipcRenderer.send("broadcast", msg),
//   onBroadcast: (callback) =>
//     ipcRenderer.on("broadcast", (event, msg) => callback(msg)),
// });

ipcRenderer.on("broadcast", (event, msg) => {
  // window.electronAPI.onBroadcast((msg) => {
  console.log("ytp msg", msg);
  const video = document.querySelector("video");
  //   if (!video) return;

  if (msg.type === "playVideo") {
    window.location.href = `https://www.youtube.com/watch?v=${msg.id}`;
  } else if (msg.type === "pauseVideo") {
    video.pause();
  } else if (msg.type === "resumeVideo") {
    video.play();
  } else if (msg.type === "fastForward") {
    video.currentTime += 30;
  }
});

function sendBroadcast(msg) {
  msg.url = window.location.href;
  console.log("sendBroadcast", msg);
  ipcRenderer.send("broadcast", msg);
}

let lastVideo = null;
let video = null;
function attachListener() {
  video = document.querySelector("video");
  if (!video) return;
  if (video === lastVideo) return;
  lastVideo = video;
  console.log("attachListener2");

  if (!video.paused && !video.ended && video.readyState > 2) {
    console.log("Video already playing on attach");
    sendBroadcast({
      type: "videoPlaying",
      duration: video.duration,
    });
  }
  video.onplay = () => {
    console.log("sendBroadcast videoPlaying (onplay)");
    sendBroadcast({
      type: "videoPlaying",
      duration: video.duration,
    });
  };
  video.onplaying = () => {
    console.log("sendBroadcast videoPlaying");
    sendBroadcast({
      type: "videoPlaying",
      duration: video.duration,
    });
  };
  video.onended = () => {
    console.log("sendBroadcast videoEnded");
    sendBroadcast({ type: "videoEnded" });
  };
  video.onpause = () => {
    // Treat pause as "ended" if the video is at the end
    if (Math.abs(video.duration - video.currentTime) < 0.5) {
      console.log("sendBroadcast videoEnded (pause at end)");
      sendBroadcast({ type: "videoEnded" });
    }
  };
}

window.addEventListener("DOMContentLoaded", () => {
  const observer = new MutationObserver(attachListener);
  observer.observe(document.body, { childList: true, subtree: true });
  attachListener(); // check immediately
});
