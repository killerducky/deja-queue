// Cross-browser shim
if (typeof browser === "undefined") {
    var browser = chrome; // var so it's global
}

const input = document.getElementById("videoId");
const addBtn = document.getElementById("add");
const list = document.getElementById("queue");
const loadBtn = document.getElementById("loadFile");
const fileInput = document.getElementById("fileInput");

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function renderQueue(queue, current) {
    list.innerHTML = "";
    queue.forEach((item, i) => {
        const li = document.createElement("li");
        li.textContent = item.title + (i === current ? " <- now" : "");
        list.appendChild(li);
    });
}

addBtn.addEventListener("click", async () => {
    const id = input.value.trim();
    if (!id) return;
    const data = await browser.storage.local.get(["queue", "current"]);
    let queue = data.queue || [];
    queue.push({ id: id, title: id });
    console.log(queue);
    await browser.storage.local.set({ queue });
    renderQueue(queue, data.current ?? 0);
    input.value = "";
});

loadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (e) => {
    console.log("hi");
    const file = e.target.files[0];
    console.log(file);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
        try {
            let queue = JSON.parse(reader.result);
            queue = shuffleArray(queue);
            console.log(queue);
            await browser.storage.local.set({ queue, current: 0 });
            renderQueue(queue, 0);
        } catch (err) {
            alert("Invalid JSON file: " + err.message);
        }
    };
    reader.readAsText(file);
});

async function playNextVideo() {
    const data = await browser.storage.local.get(["queue", "current"]);
    console.log("playNextVideo data:", data);
    let queue = data.queue || [];
    let current = data.current ?? 0;

    if (queue.length > 0) {
        current = (current + 1) % queue.length; // wrap around
        const [tab] = await browser.tabs.query({ url: "*://www.youtube.com/*" });
        if (!tab) return;
        await browser.storage.local.set({ current });
        browser.tabs.sendMessage(tab.id, { type: "playVideo", tab: tab.id, id: queue[current].id });
        console.log("sendMessage: ", tab.id, { type: "playVideo", tab: tab.id, id: queue[current].id });
        console.log("Play: ", queue[current].title, queue[current].id);
        // await new Promise((resolve) => setTimeout(resolve, 3000));
        // if (!(await waitForPlayableVideo(tab.id))) {
        //     console.log("Video failed, skipping:", videoId);
        //     // recursively call for next video
        //     playNextVideo(queue, current + 1);
        // } else {
        //     console.log("Video is playing:", videoId);
        // }
    } else {
        console.log("Queue is empty.");
    }
}

// function waitForPlayableVideo(tabId, timeout = 5000) {
//     return new Promise((resolve) => {
//         let done = false;

//         function listener(msg, sender) {
//             if (sender.tab?.id !== tabId) {
//                 console.log("Ignoring message from different tab:", msg, sender);
//                 return;
//             }
//             if (msg.type === "videoPlaying") {
//                 done = true;
//                 browser.runtime.onMessage.removeListener(listener);
//                 resolve(true);
//             }
//         }

//         browser.runtime.onMessage.addListener(listener);

//         setTimeout(() => {
//             if (!done) {
//                 console.log("timeout");
//                 browser.runtime.onMessage.removeListener(listener);
//                 resolve(false);
//             }
//         }, timeout);
//     });
// }

browser.runtime.onMessage.addListener((msg, sender) => {
    console.log("options.js received message:", msg);
    if (msg.type === "videoEnded") {
        console.log("Controller: video ended, moving to next");
        playNextVideo();
    }
    if (msg.type === "setQueue") {
        queue = msg.queue;
        currentIndex = 0;
        playNextVideo();
    }
});

// Initial load
(async () => {
    let data = {};
    // const url = browser.runtime.getURL("videos.json");
    const url = browser.runtime.getURL("videos_debug.json");
    const resp = await fetch(url);
    data.queue = await resp.json();
    data.queue = shuffleArray(data.queue);
    data.current = 0;
    await browser.storage.local.set(data);
    // data = await browser.storage.local.get(["queue", "current"]);
    renderQueue(data.queue || [], data.current ?? 0);
})();
