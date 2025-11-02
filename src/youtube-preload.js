const { contextBridge, ipcRenderer } = require("electron");

console.log("youtube-preload loaded", window.location.href);
const params = new URL(window.location.href).searchParams;
// Workaround: use t=1s to signal this is the very first video.
let cueVideo = params.get("t") === "1s";
let rotateAngle = params.get("rotateAngle") || 0;
let needThumb = params.get("needThumb");
let foreignKey = params.get("v");
let uuid = params.get("uuid");

let savedMsg;

function getVideoId(url) {
  const params = new URL(url).searchParams;
  return params.get("v");
}
function changeHref(msg) {
  if (msg.source === "youtube") {
    let href = `https://www.youtube.com/watch?v=${msg.foreignKey}`;
    ipcRenderer.send("saveMsg", msg);
    if (msg.type == "cueVideo") {
      href += "&t=1s";
    }
    window.location.href = href;
  } else {
    console.log("Error?");
  }
}

function applyRotateOld(rotateAngle) {
  let container = document.querySelector(".local-video-container");
  // console.log("container", container);
  console.log("applyRotate Old", rotateAngle);
  let video = document.querySelector("video");
  let videoWidth = video.videoWidth;
  let videoHeight = video.videoHeight;

  let rotatedWidth = videoWidth;
  let rotatedHeight = videoHeight;
  let needsSwap = rotateAngle % 180 !== 0;
  let scaleFactor = 1;
  if (container) {
    let containerWidth = container.clientWidth;
    let containerHeight = container.clientHeight;
    // let origScaleFactor = Math.min(
    //   containerWidth / rotatedWidth,
    //   containerHeight / rotatedHeight
    // );
    if (needsSwap) {
      rotatedWidth = videoHeight;
      rotatedHeight = videoWidth;
    }
    scaleFactor = Math.min(
      containerWidth / rotatedWidth,
      containerHeight / rotatedHeight
    );
  }

  video.style.transform = `rotate(${rotateAngle}deg) scale(${scaleFactor}`;
}
let style;
function applyRotate(rotateAngle) {
  const url = new URL(window.location.href);
  if (url.protocol === "file:") {
    applyRotateOld(rotateAngle);
    return;
  }
  console.log("applyRotate yt", rotateAngle);
  let video = document.querySelector("video");
  let container = video.parentNode.parentNode;
  console.log(video);
  console.log(container);
  console.log(container.clientWidth, container.clientHeight);
  let transform = `rotate(${rotateAngle}deg)`;

  if (rotateAngle == 90 || rotateAngle == 270) {
    let is_vertical_video = video.videoHeight > video.videoWidth;
    let scale =
      (is_vertical_video ? container.clientWidth : container.clientHeight) /
      (is_vertical_video ? container.clientHeight : container.clientWidth);
    transform += ` scale(${scale})`;
  }

  if (!style) {
    style = document.createElement("style");
    document.body.appendChild(style);
  }
  style.textContent = `video { transform: ${transform} }`;
}

ipcRenderer.on("broadcast", (event, msg) => {
  console.log("ytp msg", msg);
  const video = document.querySelector("video");
  //   if (!video) return;

  if (msg.type === "playVideo") {
    if (getVideoId(window.location.href) == msg.foreignKey) {
      video.play();
    } else {
      changeHref(msg);
    }
  } else if (msg.type === "cueVideo") {
    changeHref(msg);
  } else if (msg.type === "pauseVideo") {
    video.pause();
  } else if (msg.type === "resumeVideo") {
    video.play();
  } else if (msg.type === "fastForward") {
    video.currentTime += 15;
  } else if (msg.type === "volumeChanged") {
    video.volume = msg.volume;
    video.muted = msg.muted;
  } else if (msg.type === "rotateVideo") {
    rotateAngle = ((rotateAngle || 0) + 90) % 360;
    applyRotate(rotateAngle);
  }
});

function sendBroadcast(msg) {
  msg.url = window.location.href;
  console.log("sendBroadcast", msg);
  ipcRenderer.send("broadcast", msg);
}

let lastVideo = null;
let video = null;
const CUE_THRESHOLD = 10; // seconds remaining before end
let hasCuedNext = false;
function attachListener() {
  video = document.querySelector("video");
  if (!video) return;
  if (video === lastVideo) return;
  lastVideo = video;
  console.log("attachListener2");

  if (needThumb) {
    waitAndCapture(video, 10);
  }

  video.addEventListener(
    "loadedmetadata",
    () => {
      if (rotateAngle) {
        applyRotate(rotateAngle);
      }
      const target = document.querySelector(".local-video-container");
      const resizeObserver = new ResizeObserver((entries) => {
        applyRotate(rotateAngle);
      });
      resizeObserver.observe(target);
    },
    { once: true }
  );

  const handlePlay = (info = "") => {
    if (cueVideo) {
      video.pause();
      video.currentTime = 0;
      cueVideo = false;
    }
    sendBroadcast({
      type: "videoPlaying",
      duration: video.duration,
      info,
    });
  };

  if (!video.paused && !video.ended && video.readyState > 2) {
    handlePlay("already playing on attach");
  }
  // video.onplay = () => handlePlay("onplay");
  video.onready = () => {
    if (cueVideo) {
      video.pause();
    }
  };
  video.onplaying = () => handlePlay("onplaying");
  video.onended = () => sendBroadcast({ type: "videoEnded" });
  video.onpause = () => {
    // Treat pause as "ended" if the video is at the end
    if (Math.abs(video.duration - video.currentTime) < 0.5) {
      sendBroadcast({ type: "videoEnded", info: "pause at end" });
    }
  };
  video.addEventListener("timeupdate", () => {
    if (!video.duration || hasCuedNext) return;

    const remaining = video.duration - video.currentTime;
    // Cue next video when close, but not if the video is very short
    if (remaining <= CUE_THRESHOLD && video.currentTime > CUE_THRESHOLD + 1) {
      hasCuedNext = true; // ensure it only triggers once
      sendBroadcast({
        type: "videoCueNext",
        remaining: Math.round(remaining), // Just because I don't want to see "9.900979999999976"
      });
    }
  });
  video.onvolumechange = () => {
    sendBroadcast({
      type: "volumeChanged",
      volume: video.volume,
      muted: video.muted,
    });
  };
}

window.addEventListener("DOMContentLoaded", async () => {
  const url = new URL(window.location.href);
  if (url.hostname.includes("youtube.com") || url.hostname === "youtu.be") {
    savedMsg = await ipcRenderer.invoke("getSavedMsg");
    // TODO: wow.
    cueVideo =
      savedMsg.cueVideo ||
      savedMsg.type == "videoCueNext" ||
      savedMsg.type == "cueVideo" ||
      savedMsg.type == "backgroundCueVideo";
    rotateAngle = savedMsg.rotateAngle;
    console.log("load", savedMsg);
  }
  const observer = new MutationObserver(attachListener);
  observer.observe(document.body, { childList: true, subtree: true });
  attachListener(); // check immediately
});

function waitAndCapture(video, captureTime) {
  const handler = () => {
    if (video.currentTime >= captureTime) {
      video.removeEventListener("timeupdate", handler);
      captureThumbnail(video);
    }
  };
  video.addEventListener("timeupdate", handler);
}

async function captureThumbnail(video) {
  try {
    const maxWidth = 120;
    const maxHeight = 90;
    const canvas = document.getElementById("thumbCanvas");

    // calculate scaled dimensions while keeping aspect ratio
    const aspectRatio = video.videoWidth / video.videoHeight;
    let width = maxWidth;
    let height = maxHeight;

    if (width / height > aspectRatio) {
      width = height * aspectRatio;
    } else {
      height = width / aspectRatio;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // give a tiny delay to ensure the current frame is rendered
    await new Promise((r) => setTimeout(r, 50));
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return console.error("Failed to create thumbnail blob");
        const url = URL.createObjectURL(blob);
        const reader = new FileReader();
        reader.onload = () => {
          ipcRenderer.send("save-thumbnail", {
            buffer: Buffer.from(reader.result),
            foreignKey,
            uuid,
          });
        };
        reader.readAsArrayBuffer(blob);
      },
      "image/jpeg",
      0.85
    );
  } catch (err) {
    console.error("Thumbnail capture failed:", err);
  }
}

function sendBroadcast(msg) {
  msg.url = window.location.href;
  console.log("sendBroadcast", msg);
  ipcRenderer.send("broadcast", msg);
}
