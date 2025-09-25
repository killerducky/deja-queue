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
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (!(await waitForPlayableVideo())) {
            console.log("Video failed, skipping:", videoId);
            // recursively call for next video
            playNextVideo(queue, currentIndex + 1);
        } else {
            console.log("Video is playing:", videoId);
        }
    } else {
        console.log("Queue is empty.");
    }
}

function waitForPlayableVideo(timeout = 5000) {
    return new Promise((resolve) => {
        const video = document.querySelector("video");
        if (!video) return resolve(false);

        let played = false;

        // If the video starts playing, good
        video.addEventListener(
            "playing",
            () => {
                played = true;
                resolve(true);
            },
            { once: true }
        );

        // If we time out before it plays, assume it's removed/private
        setTimeout(() => {
            if (!played) resolve(false);
        }, timeout);
    });
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
