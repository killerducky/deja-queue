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
    console.log("attachListener video:", video);
    video.addEventListener(
        "playing",
        () => {
            browser.runtime.sendMessage({ type: "videoPlaying" });
        },
        { once: true }
    );
    video.addEventListener("ended", () => {
        console.log("sendMessage videoEnded");
        browser.runtime.sendMessage({ type: "videoEnded" });
    });
    video.addEventListener("pause", () => {
        // Only treat pause as "ended" if the video is at the end
        if (Math.abs(video.duration - video.currentTime) < 0.5) {
            console.log("sendMessage videoEnded (pause at end)");
            browser.runtime.sendMessage({ type: "videoEnded" });
        }
    });
}

attachListener();

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
