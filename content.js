// Cross-browser shim
if (typeof browser === "undefined") {
    var browser = chrome;
}

async function playNextVideo() {
    const data = await browser.storage.local.get(["queue", "current"]);
    console.log("playNextVideo data:", data);
    let queue = data.queue || [];
    let current = data.current ?? 0;

    if (queue.length > 0) {
        current = (current + 1) % queue.length; // wrap around
        await browser.storage.local.set({ current });
        window.location.href = `https://www.youtube.com/watch?v=${queue[current].id}`;
        console.log("Play: ", queue[current].title);
    } else {
        console.log("Queue is empty.");
    }
}

function attachListener() {
    const video = document.querySelector("video");
    // console.log("attachListener video:", video);
    if (video) {
        video.addEventListener("ended", playNextVideo, { once: true });
    } else {
        setTimeout(attachListener, 1000);
    }
}

// Re-attach listener when navigating inside YouTube’s SPA
const observer = new MutationObserver(() => attachListener());
observer.observe(document.body, { childList: true, subtree: true });

attachListener();
