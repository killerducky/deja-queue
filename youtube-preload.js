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
