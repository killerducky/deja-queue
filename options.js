// Cross-browser shim
if (typeof browser === "undefined") {
    var browser = chrome; // var so it's global
}

const input = document.getElementById("videoId");
const addBtn = document.getElementById("add");
const nextBtn = document.getElementById("next");
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
    // well this is probably a dumb way to do it but vibe coding so
    const reordered = queue.slice(current).concat(queue.slice(0, current));
    reordered.forEach((item, i) => {
        const li = document.createElement("li");
        li.textContent = item.title;
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

nextBtn.addEventListener("click", async () => {
    playNextVideo();
});

loadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (e) => {
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

let videoTimeout;

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
        renderQueue(queue, current);
        videoTimeout = setTimeout(() => {
            console.log("Error:", queue[current].id, queue[current].title);
            console.log("Video did NOT start playing within timeout");
            playNextVideo();
        }, 15000); // 15s -- Fixed some bugs so now this could be reduced
    } else {
        console.log("Queue is empty.");
    }
}

browser.runtime.onMessage.addListener((msg, sender) => {
    console.log("options.js received message:", msg);
    if (msg.type === "videoPlaying") {
        clearTimeout(videoTimeout);
    }
    if (msg.type === "videoEnded") {
        console.log("Controller: video ended, moving to next");
        playNextVideo();
    }
});

// Initial load
(async () => {
    let data = {};
    const url = browser.runtime.getURL("videos.json");
    // const url = browser.runtime.getURL("videos_debug.json");
    const resp = await fetch(url);
    data.queue = await resp.json();
    console.log(data.queue);
    let filtered = data.queue.filter((v) => v.title.includes("Heatley"));
    let notFiltered = data.queue.filter((v) => !v.title.includes("Heatley"));
    let keepCount = Math.ceil(filtered.length * 0.25);
    let keepList = shuffleArray(filtered).slice(0, keepCount);
    console.log(notFiltered, keepList);
    // data.queue = shuffleArray([...notFiltered, ...keepList]);
    data.queue = shuffleArray(notFiltered.concat(keepList));
    console.log(`Keep ${keepCount} of ${filtered.length} Heatley vids plus ${notFiltered.length} others`);
    console.log(data.queue);
    data.current = 0;
    await browser.storage.local.set(data);
    // data = await browser.storage.local.get(["queue", "current"]);
    renderQueue(data.queue || [], data.current ?? 0);
})();
