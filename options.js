import * as db from "./db.js";

// Cross-browser shim
if (typeof browser === "undefined") {
    var browser = chrome; // var so it's global
}

let DBDATA = { queue: [], current: 0 };

const url = browser.runtime.getURL(".env.json");
const resp = await fetch(url);
const env = await resp.json();

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
        p.textContent = item.title || item.yt?.snippet?.title || item.id;
        li.appendChild(p);
    }
}

addBtn.addEventListener("click", async () => {
    let id = getVideoIdFromInput(input.value.trim());
    if (!id) return;
    if (DBDATA.queue.find((v) => v.id === id)) {
        alert("Video already in DB");
        return;
    }
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${env.API_KEY}`;
    console.log(url);
    const response = await fetch(url);
    const data = await response.json();
    if (data.items.length > 0) {
        let item = {
            id: data.items[0].id,
            yt: data.items[0],
        };
        console.log(item);
        DBDATA.queue.splice(DBDATA.current + 1, 0, item);
        await db.saveVideos([item]);
        renderQueue(DBDATA.queue, DBDATA.current);
    } else {
        alert("Video not found");
    }
    input.value = "";
});

nextBtn.addEventListener("click", async () => {
    playNextVideo();
});

let videoTimeout;

async function playNextVideo() {
    console.log("playNextVideo data:", DBDATA);

    if (DBDATA.queue.length > 0) {
        DBDATA.current = (DBDATA.current + 1) % DBDATA.queue.length; // wrap around
        const [tab] = await browser.tabs.query({ url: "*://www.youtube.com/*" });
        if (!tab) return;
        browser.tabs.sendMessage(tab.id, { type: "playVideo", tab: tab.id, id: DBDATA.queue[DBDATA.current].id });
        console.log("sendMessage: ", tab.id, { type: "playVideo", tab: tab.id, id: DBDATA.queue[DBDATA.current].id });
        renderQueue(DBDATA.queue, DBDATA.current);
        videoTimeout = setTimeout(() => {
            console.log("Error:", DBDATA.queue[DBDATA.current].id, DBDATA.queue[DBDATA.current].title);
            console.log("Video did NOT start playing within timeout");
            DBDATA.queue[DBDATA.current].errCnt = (DBDATA.queue[DBDATA.current].errCnt || 0) + 1;
            db.saveVideos([DBDATA.queue[DBDATA.current]]);
            playNextVideo();
        }, 15000); // 15s -- Fixed some bugs so now this could be reduced
    } else {
        console.log("Queue is empty.");
    }
}

function getVideoIdFromInput(input) {
    if (input.startsWith("http")) {
        const params = new URL(input).searchParams;
        const videoId = params.get("v");
        return videoId;
    } else {
        return input;
    }
}

browser.runtime.onMessage.addListener((msg, sender) => {
    console.log("options.js received message:", msg, sender);
    if (msg.type === "videoPlaying") {
        clearTimeout(videoTimeout);
    }
    if (msg.type === "videoEnded") {
        console.log("Controller: video ended, moving to next");
        const videoId = getVideoIdFromInput(sender.url);
        // check in case some other video was actually playing, don't want to credit that
        if (videoId && DBDATA.queue[DBDATA.current] && videoId === DBDATA.queue[DBDATA.current].id) {
            DBDATA.queue[DBDATA.current].playCnt = (DBDATA.queue[DBDATA.current].playCnt || 0) + 1;
            DBDATA.queue[DBDATA.current].lastPlayDate = Date.now();
            if (DBDATA.queue[DBDATA.current].playCnt == 1) {
                DBDATA.queue[DBDATA.current].firstPlayDate = Date.now();
            }
            db.saveVideos([DBDATA.queue[DBDATA.current]]);
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
            await db.saveVideos(data); // only replaces each id with new content
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
    DBDATA.queue = await db.loadVideos();
    console.log(DBDATA.queue);
    let filtered = DBDATA.queue.filter((v) => v.yt.snippet.title.includes("Heatley"));
    let notFiltered = DBDATA.queue.filter((v) => !v.yt.snippet.title.includes("Heatley"));
    let keepCount = Math.ceil(filtered.length * 0.25);
    let keepList = shuffleArray(filtered).slice(0, keepCount);
    DBDATA.queue = shuffleArray(notFiltered.concat(keepList));
    console.log(`Keep ${keepCount} of ${filtered.length} Heatley vids plus ${notFiltered.length} others`);
    DBDATA.current = 0;
    // data = await browser.storage.local.get(["queue", "current"]);
    renderQueue(DBDATA.queue || [], DBDATA.current ?? 0);
})();
