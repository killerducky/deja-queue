const { contextBridge, ipcRenderer } = require("electron");

console.log("youtube-preload loaded");
const params = new URL(window.location.href).searchParams;
// Workaround: use t=1s to signal this is the very first video.
let cueVideo = params.get("t") === "1s";

function getVideoId(url) {
  const params = new URL(url).searchParams;
  return params.get("v");
}
ipcRenderer.on("broadcast", (event, msg) => {
  console.log("ytp msg", msg);
  const video = document.querySelector("video");
  //   if (!video) return;

  if (msg.type === "playVideo") {
    if (getVideoId(window.location.href) == msg.id) {
      video.play();
      sendBroadcast({
        type: "videoPlaying",
        info: "Video already loaded",
      });
    } else {
      window.location.href = `https://www.youtube.com/watch?v=${msg.id}`;
    }
  } else if (msg.type === "cueVideo") {
    window.location.href = `https://www.youtube.com/watch?v=${msg.id}&t=1s`;
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
    if (cueVideo) {
      video.pause();
      cueVideo = false;
    }
    sendBroadcast({
      type: "videoPlaying",
      duration: video.duration,
      info: "Video already playing on attach",
    });
  }
  video.onplay = () => {
    if (cueVideo) {
      video.pause();
      cueVideo = false;
    }
    sendBroadcast({
      type: "videoPlaying",
      duration: video.duration,
    });
  };
  video.onplaying = () => {
    if (cueVideo) {
      video.pause();
      cueVideo = false;
    }
    sendBroadcast({
      type: "videoPlaying",
      duration: video.duration,
    });
  };
  video.onended = () => {
    sendBroadcast({ type: "videoEnded" });
  };
  video.onpause = () => {
    // Treat pause as "ended" if the video is at the end
    if (Math.abs(video.duration - video.currentTime) < 0.5) {
      sendBroadcast({ type: "videoEnded", info: "pause at end" });
    }
  };
}

window.addEventListener("DOMContentLoaded", () => {
  const observer = new MutationObserver(attachListener);
  observer.observe(document.body, { childList: true, subtree: true });
  attachListener(); // check immediately
});
