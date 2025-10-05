const { ipcRenderer } = require("electron");

console.log("youtube-preload loaded");
// Listen for messages from the host
ipcRenderer.on("youtube-message", (event, msg) => {
  console.log("ytp msg", msg);
  ipcRenderer.sendToHost("video-status", {
    status: "message received",
    original: msg,
  });
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

function sendMessage(msg) {
  console.log("send back", msg);
  ipcRenderer.sendToHost("video-status", msg);
}

let lastVideo = null;
let video = null;
function attachListener() {
  //   console.log("attachListener1");
  video = document.querySelector("video");
  if (!video) return;
  if (video === lastVideo) return;
  lastVideo = video;
  console.log("attachListener2");

  // This isn't working
  // TODO aolsen
  //   const theaterButton = document.querySelector(".ytp-size-button");
  //   if (theaterButton) {
  //     // If the button is found, simulate a click
  //     theaterButton.click();
  //     console.log("Toggled YouTube theater mode.");
  //   } else {
  //     console.log("Theater mode button not found.");
  //   }
  if (!video.paused && !video.ended && video.readyState > 2) {
    console.log("Video already playing on attach");
    sendMessage({
      type: "videoPlaying",
      duration: video.duration,
    });
  }
  video.onplay = () => {
    console.log("sendMessage videoPlaying (onplay)");
    sendMessage({
      type: "videoPlaying",
      duration: video.duration,
    });
  };
  video.onplaying = () => {
    console.log("sendMessage videoPlaying");
    sendMessage({
      type: "videoPlaying",
      duration: video.duration,
    });
  };
  video.onended = () => {
    console.log("sendMessage videoEnded");
    sendMessage({ type: "videoEnded" });
  };
  video.onpause = () => {
    // Only treat pause as "ended" if the video is at the end
    if (Math.abs(video.duration - video.currentTime) < 0.5) {
      console.log("sendMessage videoEnded (pause at end)");
      sendMessage({ type: "videoEnded" });
    }
  };
}

window.addEventListener("DOMContentLoaded", () => {
  const observer = new MutationObserver(attachListener);
  observer.observe(document.body, { childList: true, subtree: true });
  attachListener(); // check immediately
});
