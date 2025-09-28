const { contextBridge } = require("electron");

// Expose limited APIs to the renderer
contextBridge.exposeInMainWorld("ytControl", {
    play: () => {
        document.querySelector("video")?.play();
    },
    pause: () => {
        document.querySelector("video")?.pause();
    },
    next: () => {
        // YouTube's "Next video" button
        document.querySelector(".ytp-next-button")?.click();
    },
    getTime: () => {
        return document.querySelector("video")?.currentTime || 0;
    },
    seek: (seconds) => {
        const video = document.querySelector("video");
        if (video) video.currentTime = seconds;
    },
});
