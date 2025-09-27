// Cross-browser shim
if (typeof browser === "undefined") {
    var browser = chrome;
}

let lastVideo = null;
function attachListener() {
    const video = document.querySelector("video");
    if (!video) return;
    if (video === lastVideo) return;
    lastVideo = video;
    console.log("attachListener");
    if (!video.paused && !video.ended && video.readyState > 2) {
        console.log("Video already playing on attach");
        browser.runtime.sendMessage({ type: "videoPlaying" });
    }
    video.onplay = () => {
        console.log("sendMessage videoPlaying (onplay)");
        browser.runtime.sendMessage({ type: "videoPlaying" });
    };
    video.onplaying = () => {
        console.log("sendMessage videoPlaying");
        browser.runtime.sendMessage({ type: "videoPlaying" });
    };
    video.onended = () => {
        console.log("sendMessage videoEnded");
        browser.runtime.sendMessage({ type: "videoEnded" });
    };
    video.onpause = () => {
        // Only treat pause as "ended" if the video is at the end
        if (Math.abs(video.duration - video.currentTime) < 0.5) {
            console.log("sendMessage videoEnded (pause at end)");
            browser.runtime.sendMessage({ type: "videoEnded" });
        }
    };
}

const observer = new MutationObserver(() => attachListener());
observer.observe(document.body, { childList: true, subtree: true });

// Listen for controller commands
browser.runtime.onMessage.addListener((msg) => {
    console.log("content.js received message:", msg);
    if (msg.type === "playVideo") {
        console.log("Navigating to:", msg.id);
        window.location.href = `https://www.youtube.com/watch?v=${msg.id}`;
    }
});
