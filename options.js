import * as db from "./db.js";

// Cross-browser shim
if (typeof browser === "undefined") {
    var browser = chrome; // var so it's global
}

let data = { queue: [], current: 0 };

const input = document.getElementById("videoId");
const addBtn = document.getElementById("add");
const nextBtn = document.getElementById("next");
const list = document.getElementById("queue");

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function renderQueue(queue, current) {
    list.innerHTML = "";
    for (let i = 0; i < queue.length && i < 10; i++) {
        const item = queue[(current + i) % queue.length];
        const li = document.createElement("li");
        li.style.display = "flex";
        li.style.alignItems = "center";
        li.style.gap = "8px";
        list.appendChild(li);
        let thumb = document.createElement("img");
        thumb.src = `https://i.ytimg.com/vi/${item.id}/default.jpg`;
        thumb.style.width = "70px";
        li.appendChild(thumb);
        let p = document.createElement("p");
        p.textContent = item.title || item.id;
        li.appendChild(p);
    }
}

addBtn.addEventListener("click", async () => {
    alert("not working for now");
    // const id = input.value.trim();
    // if (!id) return;
    // const data = await browser.storage.local.get(["queue", "current"]);
    // let queue = data.queue || [];
    // queue.push({ id: id, title: id });
    // console.log(queue);
    // await browser.storage.local.set({ queue });
    // renderQueue(queue, data.current ?? 0);
    // input.value = "";
});

nextBtn.addEventListener("click", async () => {
    playNextVideo();
});

let videoTimeout;

async function playNextVideo() {
    console.log("playNextVideo data:", data);

    if (data.queue.length > 0) {
        data.current = (data.current + 1) % data.queue.length; // wrap around
        const [tab] = await browser.tabs.query({ url: "*://www.youtube.com/*" });
        if (!tab) return;
        browser.tabs.sendMessage(tab.id, { type: "playVideo", tab: tab.id, id: data.queue[data.current].id });
        console.log("sendMessage: ", tab.id, { type: "playVideo", tab: tab.id, id: data.queue[data.current].id });
        renderQueue(data.queue, data.current);
        videoTimeout = setTimeout(() => {
            console.log("Error:", data.queue[data.current].id, data.queue[data.current].title);
            console.log("Video did NOT start playing within timeout");
            data.queue[data.current].errCnt = (data.queue[data.current].errCnt || 0) + 1;
            playNextVideo();
        }, 15000); // 15s -- Fixed some bugs so now this could be reduced
    } else {
        console.log("Queue is empty.");
    }
}

browser.runtime.onMessage.addListener((msg, sender) => {
    console.log("options.js received message:", msg, sender);
    if (msg.type === "videoPlaying") {
        clearTimeout(videoTimeout);
    }
    if (msg.type === "videoEnded") {
        console.log("Controller: video ended, moving to next");
        const params = new URL(sender.url).searchParams;
        const videoId = params.get("v");
        // check in case some other video was actually playing, don't want to credit that
        if (videoId && data.queue[data.current] && videoId === data.queue[data.current].id) {
            data.queue[data.current].playCnt = (data.queue[data.current].playCnt || 0) + 1;
            data.queue[data.current].lastPlayDate = Date.now();
            if (data.queue[data.current].playCnt == 1) {
                data.queue[data.current].firstPlayDate = Date.now();
            }
        }
        playNextVideo();
    }
});

async function exportVideos() {
    const videos = await db.loadVideos();
    const blob = new Blob([JSON.stringify(videos, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "videos_export.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
}

function importVideos(file) {
    console.log("Importing videos from file:", file);
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            await db.saveVideos(data); // replaces DB contents
            console.log("Videos imported successfully");
        } catch (err) {
            console.error("Failed to import videos:", err);
        }
    };
    reader.readAsText(file);
}

async function deleteVideos() {
    // await db.deleteDB();
    // alert("Database deleted. Please reload the page.");
    alert("Disabled. LUL.");
}
document.getElementById("exportBtn").addEventListener("click", exportVideos);
document.getElementById("deleteBtn").addEventListener("click", deleteVideos);

document.getElementById("importBtn").addEventListener("click", () => {
    const fileInput = document.getElementById("importFile");
    if (fileInput.files.length > 0) {
        importVideos(fileInput.files[0]);
    } else {
        alert("Please select a file first");
    }
});

// Initial load
(async () => {
    if (!(await db.hasAnyVideos())) {
        // First run → seed from bundled JSON
        const url = browser.runtime.getURL("videos.json");
        const resp = await fetch(url);
        const videos = await resp.json();
        await db.saveVideos(videos);
        console.log(`Seeded DB with ${videos.length} videos`);
    }
    data.queue = await db.loadVideos();
    console.log(data.queue);
    let filtered = data.queue.filter((v) => v.yt.snippet.title.includes("Heatley"));
    let notFiltered = data.queue.filter((v) => !v.yt.snippet.title.includes("Heatley"));
    let keepCount = Math.ceil(filtered.length * 0.25);
    let keepList = shuffleArray(filtered).slice(0, keepCount);
    data.queue = shuffleArray(notFiltered.concat(keepList));
    console.log(`Keep ${keepCount} of ${filtered.length} Heatley vids plus ${notFiltered.length} others`);
    data.current = 0;
    // data = await browser.storage.local.get(["queue", "current"]);
    renderQueue(data.queue || [], data.current ?? 0);
})();
