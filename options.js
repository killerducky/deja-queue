import * as db from "./db.js";

// Error: YXpJcFeaUwY Like A Prayer [8 Bit Tribute to Madonna] - 8 Bit Universe

// Cross-browser shim
if (typeof browser === "undefined") {
    var browser = chrome; // var so it's global
}

let DBDATA = { queue: [], filtered: [] };
let LISTLEN = 5;
let MAXLOGDUMP = 99999;
let DIVERSITY_FACTOR = 12; // e.g. 6.5 + 1.2 will overcome 7.5 sometimes
// let DIVERSITY_FACTOR = 24;
let LONG_DELAY_TIME = 7;
let LONG_DELAY_BONUS = 2.5; // half a half a rating point per doubling
let INIT_DAYS_SINCE = 365; // One year is plenty to get a new video played
let DEFAULT_RATING = 7.5;
let COOLDOWN_JITTER_START = 3; // Subtract N days from the interval
let COOLDOWN_JITTER_RATE = 0.2; // Add up to X% jitter to that part of the interval
let RATING_FACTOR = 10;

function rating2color(rating) {
    // https://colorbrewer2.org/#type=sequential&scheme=GnBu&n=9
    // let colors = ["#f7fcf0", "#e0f3db", "#ccebc5", "#a8ddb5", "#7bccc4", "#4eb3d3", "#2b8cbe", "#0868ac", "#084081"].reverse();
    // https://colorbrewer2.org/?type=qualitative&scheme=Paired&n=9
    // let colors = ["#a6cee3", "#1f78b4", "#b2df8a", "#33a02c", "#fb9a99", "#e31a1c", "#fdbf6f", "#ff7f00", "#cab2d6"];
    // https://colorbrewer2.org/?type=qualitative&scheme=Set1&n=9
    // let colors = ["#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00", "#ffff33", "#a65628", "#f781bf", "#999999"];
    // https://colorbrewer2.org/#type=diverging&scheme=RdBu&n=11
    // const colors = ["#67001f", "#b2182b", "#d6604d", "#f4a582", "#fddbc7", "#f7f7f7", "#d1e5f0", "#92c5de", "#4393c3", "#2166ac", "#053061"];
    // const colors = ["#67001f", "#b2182b", "#d6604d", "#f4a582", "#fddbc7", "#d1e5f0", "#92c5de", "#4393c3", "#2166ac", "#053061"];

    // https://colorbrewer2.org/#type=diverging&scheme=RdBu&n=9
    // const colors = ['#b2182b','#d6604d','#f4a582','#fddbc7','#f7f7f7','#d1e5f0','#92c5de','#4393c3','#2166ac']
    // const colors = ["#b2182b", "#d6604d", "#f4a582", /*"#fddbc7", "#f7f7f7",*/ "#d1e5f0", "#92c5de", "#4393c3", "#2166ac"];
    // const colors = ["#b2182b", "#d6604d", "#f4a582", /*"#fddbc7", "#f7f7f7", "#d1e5f0",*/ "#92c5de", "#4393c3", "#2166ac"];

    const colors = [
        "hsla(342, 100%, 20%, 1.00)",
        "hsla(353, 76%, 40%, 1.00)",
        "hsla(8, 63%, 57%, 1.00)",
        "hsla(18, 84%, 68%, 1.00)",
        // "hsla(32, 60%, 68%, 1.00)",
        // "hsla(0, 0%, 65%, 1.00)",
        "hsla(201, 50%, 70%, 1.00)",
        "hsla(200, 63%, 60%, 1.00)",
        "hsla(203, 66%, 47%, 1.00)",
        "hsla(210, 70%, 36%, 1.00)",
        "hsla(212, 90%, 20%, 1.00)",
    ];
    //     const colors = [
    //     "hsla(342, 100%, 20%, 1.00)",
    //     "hsla(353, 76%, 40%, 1.00)",
    //     "hsla(8, 70%, 57%, 1.00)",
    //     "hsla(18, 68%, 60%, 1.00)",
    //     "hsla(32, 50%, 55%, 1.00)",
    //     "hsla(0, 0%, 60%, 1.00)",
    //     "hsla(201, 50%, 70%, 1.00)",
    //     "hsla(200, 63%, 60%, 1.00)",
    //     "hsla(203, 66%, 47%, 1.00)",
    //     "hsla(210, 70%, 36%, 1.00)",
    //     "hsla(212, 90%, 20%, 1.00)",
    // ];

    // https://www.learnui.design/tools/data-color-picker.html
    // let colors = ["#003f5c", "#2f4b7c", "#665191", "#a05195", "#d45087", "#f95d6a", "#ff7c43", "#ffa600"].reverse();

    // https://www.vis4.net/palettes/#/9|s|7c316f,7be9ff,98cbff|ffffe0,ff005e,93003a|1|1
    // let colors = ["#7c316f", "#81477e", "#865b8d", "#896f9c", "#8c82ac", "#8d95bd", "#8ea8ce", "#8ebbe1", "#98cbff"];
    // modify a bit:
    // const colors = [
    //     "hsl(204, 90%, 11%)",
    //     "hsl(219, 39%, 29%)",
    //     "hsl(250, 27%, 41%)",
    //     "hsl(306, 41%, 52%)",
    //     "hsl(346, 63%, 64%)",
    //     "hsl(20, 70%, 65%)",
    //     "hsl(55, 80%, 45%)",
    //     "hsl(85, 80%, 40%)",
    //     "hsl(105, 80%, 45%)",
    // ].reverse();

    let colormap = {};
    for (let i = 0, r = 9.0; i < colors.length; i++) {
        colormap[r] = colors[i];
        r -= 0.5;
    }

    // Get all rating keys as numbers
    const keys = Object.keys(colormap).map(Number);

    // Find the key with minimal distance to rating
    let closest = keys[0];
    let minDiff = Math.abs(rating - closest);

    for (let k of keys) {
        const diff = Math.abs(rating - k);
        if (diff < minDiff) {
            minDiff = diff;
            closest = k;
        }
    }
    return colormap[closest];
}

function rating2days(rating) {
    if (rating >= 10) return 1.0 / 24;
    if (rating >= 9.5) return 4.0 / 24;
    if (rating >= 9.0) return 0.5;
    if (rating >= 8.5) return 1;
    if (rating >= 8.0) return 2;
    if (rating >= 7.5) return 3;
    if (rating >= 7.0) return 7;
    if (rating >= 6.5) return 30;
    if (rating >= 6.0) return 90;
    return 365;
}

function cooldownFactor(daysSince, rating, noise = true) {
    let T = rating2days(rating);
    if (noise) {
        let T1 = T - COOLDOWN_JITTER_START;
        if (T1 > 0) {
            T += T1 * Math.random() * COOLDOWN_JITTER_RATE;
        }
    }
    let ratio = daysSince / T;
    let daysOverdue = daysSince - T * 1.5;
    if (ratio < 1) {
        const eased = Math.pow(ratio, 3);
        return -5 * RATING_FACTOR * (1 - eased);
    } else if (daysOverdue > 0) {
        // 7 days overdue:  +1LONG_DELAY_BONUS
        // 14 days overdue: +2LONG_DELAY_BONUS
        // 28 days overdue: +3LONG_DELAY_BONUS
        // 56 days overdue: +4LONG_DELAY_BONUS
        // 365 days overdue: +14 = 5.6x LONG_DELAY_BONUS
        let log2 = Math.log1p(daysOverdue / LONG_DELAY_TIME) / Math.log(2);
        return log2 * LONG_DELAY_BONUS;
    } else {
        return 0;
    }
}

// split out so we can test eaiser
function scoreHelper(daysSince, rating, noise = true) {
    let score = 0;
    score += rating * RATING_FACTOR;
    score += !noise ? 0 : Math.random() * DIVERSITY_FACTOR;
    score += cooldownFactor(daysSince, rating, noise);
    return score;
}

function scoreVideo(video, noise = true) {
    if (video.errCnt && video.errCnt >= 3) return -10; // too many errors, don't play
    let now = Date.now();
    if (!video.rating) video.rating = DEFAULT_RATING;
    let daysSince = !video.lastPlayDate ? INIT_DAYS_SINCE : (now - video.lastPlayDate) / (24 * 3600 * 1000);
    if (video.delay) {
        // if e.g. a big playlist is added, user clicks "delay" and they will be randomized into the backlog uniformly
        daysSince += rating2days(video.rating) * Math.random();
    }
    let score = scoreHelper(daysSince, video.rating, noise);
    return score;
}

const url = browser.runtime.getURL(".env.json");
const resp = await fetch(url);
const env = await resp.json();

const input = document.getElementById("videoId");
const addBtn = document.getElementById("add");
const nextBtn = document.getElementById("next");
const delayBtn = document.getElementById("delay");
const pauseBtn = document.getElementById("pause");
const playBtn = document.getElementById("play");
const queueEl = document.getElementById("queue");
const logEl = document.getElementById("log");

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function date2String(d) {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const parseAttr = (input, attrName, fallback) => {
    const v = input.getAttribute(attrName);
    if (v === null || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

export function handleSteppers(chartContainerEl) {
    chartContainerEl.querySelectorAll(".number-stepper").forEach((container) => {
        const input = container.querySelector('input[type="number"]');
        const btnUp = container.querySelector(".step-up");
        const btnDown = container.querySelector(".step-down");

        if (!input) return;

        // get step/min/max dynamically in case they change
        const getStep = () => parseAttr(input, "step", 1);
        const getMin = () => parseAttr(input, "min", -Infinity);
        const getMax = () => parseAttr(input, "max", Infinity);

        const clamp = (v) => Math.min(getMax(), Math.max(getMin(), v));

        const changeValue = (delta) => {
            // Allow empty input: treat as 0 or min if defined
            let val = input.value === "" ? (Number.isFinite(getMin()) && getMin() > -Infinity ? getMin() : 0) : Number(input.value);

            if (!Number.isFinite(val)) val = 0;

            const step = getStep();
            // If step is 0 or NaN, default to 1
            const effectiveStep = typeof step === "number" && step !== 0 && Number.isFinite(step) ? step : 1;

            // add delta * step
            let newVal = val + delta * effectiveStep;

            // Align to step grid relative to min if min is finite (helps with non-integer steps)
            const min = getMin();
            if (Number.isFinite(min) && effectiveStep !== 0) {
                // make sure (newVal - min) is a multiple of step (within floating tolerance)
                const raw = Math.round((newVal - min) / effectiveStep) * effectiveStep + min;
                newVal = raw;
            }

            newVal = clamp(newVal);

            // If step or min cause decimal imprecision, format to reasonable decimal places
            const decimals = (effectiveStep.toString().split(".")[1] || "").length;
            input.value = Number.isFinite(decimals) && decimals > 0 ? newVal.toFixed(decimals) : String(Math.round(newVal));
            input.dispatchEvent(new Event("change", { bubbles: true })); // let other listeners know value changed
        };

        // button handlers
        btnUp && btnUp.addEventListener("click", () => changeValue(+1));
        btnDown && btnDown.addEventListener("click", () => changeValue(-1));
    });
}

async function renderQueue(queue) {
    let videoList = [];
    for (let i = 0; i < queue.length && i < LISTLEN; i++) {
        let video = queue[i % queue.length];
        videoList.push(video);
        if (!video?.yt?.contentDetails) {
            await addYoutubeInfo(video);
        }
    }
    table(queueEl, videoList, 1);
    let log = await db.getLastNLogs(LISTLEN);
    let logVideoList = [];
    for (let entry of log) {
        // TODO: The queue doesn't even have all the vidoes because of the filter?
        // For now this will mostly work
        let video = queue.find((v) => v.id === entry.id);
        logVideoList.push(video);
        if (!video?.yt?.contentDetails) {
            await addYoutubeInfo(video);
        }
    }
    table(logEl, logVideoList, 0);
}

function formatDuration(isoDuration, isoFormat = true) {
    let hours;
    let minutes;
    let seconds;
    if (isoFormat) {
        if (!isoDuration) return "—";
        const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return "0:00";
        hours = parseInt(match[1] || "0", 10);
        minutes = parseInt(match[2] || "0", 10);
        seconds = parseInt(match[3] || "0", 10);
    } else {
        hours = isoDuration >= 3600 ? Math.floor(isoDuration / 3600) : 0;
        minutes = Math.floor((isoDuration % 3600) / 60);
        seconds = Math.floor(isoDuration % 60);
    }

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    } else {
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }
}

function table(htmlEl, videoList, clickable) {
    let now = Date.now();
    htmlEl.innerHTML = "";

    // Create table
    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";

    // Header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Thumb", "Title", "Dur", "Last Played", "Play Count", "Rating", "Interval"].forEach((col) => {
        const th = document.createElement("th");
        th.textContent = col;
        th.style.borderBottom = "1px solid #ccc";
        th.style.padding = "6px";
        th.style.textAlign = "center";
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");
    for (let [index, item] of videoList.entries()) {
        const row = document.createElement("tr");

        // Thumbnail cell
        const thumbCell = document.createElement("td");
        const thumb = document.createElement("img");
        thumb.src = `https://i.ytimg.com/vi/${item.id}/default.jpg`;
        thumb.style.width = "70px";
        thumbCell.appendChild(thumb);
        thumbCell.style.padding = "6px";
        row.appendChild(thumbCell);
        if (clickable) {
            thumb.addEventListener("click", () => {
                playNextVideo(index);
            });
        }

        // Title cell
        const titleCell = document.createElement("td");
        titleCell.textContent = item.title || item.yt?.snippet?.title || item.id;
        titleCell.style.padding = "6px";
        row.appendChild(titleCell);

        // Dur cell
        const durCell = document.createElement("td");
        if (item.scrapedDuration) {
            durCell.textContent = formatDuration(item.scrapedDuration, false);
        } else {
            durCell.textContent = formatDuration(item.yt?.contentDetails?.duration) || "—";
        }

        durCell.style.padding = "6px";
        durCell.style.textAlign = "center";
        row.appendChild(durCell);

        // Last Played cell
        const lastPlayedCell = document.createElement("td");
        if (item.lastPlayDate) {
            const d = new Date(item.lastPlayDate);
            lastPlayedCell.innerHTML = "";
            let daysSince = (now - d) / (24 * 3600 * 1000);
            lastPlayedCell.innerHTML += `${daysSince.toFixed(1)} days ago`;
            lastPlayedCell.innerHTML += "<br>" + date2String(d);
        } else {
            lastPlayedCell.textContent = "—";
        }
        lastPlayedCell.style.width = "140px";
        lastPlayedCell.style.padding = "6px";
        lastPlayedCell.style.textAlign = "center";
        row.appendChild(lastPlayedCell);

        // Play count cell
        const playCntCell = document.createElement("td");
        playCntCell.textContent = item.playCnt ?? 0;
        playCntCell.style.width = "50px";
        playCntCell.style.padding = "6px";
        playCntCell.style.textAlign = "center";
        row.appendChild(playCntCell);

        let cell = document.createElement("td");
        let div = document.createElement("div");
        div.className = "number-stepper";
        const downBtn = document.createElement("button");
        downBtn.className = "step-btn step-down";
        downBtn.type = "button";
        downBtn.innerHTML = "&minus;";
        const upBtn = document.createElement("button");
        upBtn.className = "step-btn step-up";
        upBtn.type = "button";
        upBtn.innerHTML = "&plus;";

        let input = document.createElement("input");
        input.type = "number";
        input.min = "1";
        input.max = "10";
        input.step = "0.5";
        input.value = item.rating ?? DEFAULT_RATING;
        async function saveRating() {
            const newValue = parseFloat(input.value);
            if (!isNaN(newValue)) {
                item.rating = newValue;
                await db.saveVideos([item]);
                console.log("Saved new rating", newValue, "for", item.id);
            }
        }
        input.addEventListener("change", () => saveRating());
        div.appendChild(downBtn);
        div.appendChild(input);
        div.appendChild(upBtn);
        cell.appendChild(div);
        row.appendChild(cell);

        let intervalCell = document.createElement("td");
        intervalCell.style.textAlign = "center";
        function updateInterval() {
            intervalCell.textContent = input.value ? rating2days(parseFloat(input.value)) + "d" : "—";
        }
        updateInterval();
        input.addEventListener("change", () => {
            updateInterval();
        });
        row.appendChild(intervalCell);

        tbody.appendChild(row);
    }
    table.appendChild(tbody);
    handleSteppers(table);

    // Append to container
    htmlEl.appendChild(table);
}

async function addYoutubeInfo(video) {
    console.log("Fetching YouTube info for", video.id);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${video.id}&key=${env.API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    // console.log(data);
    if (data.items.length > 0) {
        video.yt = data.items[0];
        await db.saveVideos([video]);
    }
}

async function addPlaylistVideos(playlistId) {
    let nextPageToken = "";
    let videos = [];
    do {
        let url =
            `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails` +
            `&maxResults=50&pageToken=${nextPageToken}&playlistId=${playlistId}&key=${env.API_KEY}`;
        let res = await fetch(url);
        let data = await res.json();
        console.log("addPlaylistVideos raw: ", data);

        videos.push(
            ...data.items.map((item) => ({
                id: item.snippet.resourceId.videoId,
                yt: item,
            }))
        );
    } while (nextPageToken);
    console.log("addPlaylistVideos: ", videos);
    db.saveVideos(videos);
}

addBtn.addEventListener("click", async () => {
    let response = getVideoIdFromInput(input.value.trim());
    if (!response.id) {
        alert("Could not find on youtube");
        return;
    }
    if (response.type == "video") {
        if (DBDATA.queue.find((v) => v.id === response.id)) {
            alert("Video already in DB");
            moveVideoToFront(response.id);
        } else {
            let video = { id: response.id };
            await addYoutubeInfo(video);
            if (!video.yt) {
                alert("Failed to fetch video info, please check the ID");
                return;
            }
            console.log(video);
            DBDATA.queue.splice(1, 0, video);
            await renderQueue(DBDATA.queue);
        }
    } else if (response.type == "playlist") {
        await addPlaylistVideos(response.id);
    } else {
        alert("Error: could not parse input");
    }

    input.value = "";
});

nextBtn.addEventListener("click", async () => {
    await logEvent(DBDATA.queue[0], "skip");
    playNextVideo();
});
delayBtn.addEventListener("click", async () => {
    await logEvent(DBDATA.queue[0], "delay");
    playNextVideo();
});
pauseBtn.addEventListener("click", async () => {
    const [tab] = await browser.tabs.query({ url: "*://www.youtube.com/*" });
    browser.tabs.sendMessage(tab.id, { type: "pauseVideo", tab: tab.id });
});
playBtn.addEventListener("click", async () => {
    const [tab] = await browser.tabs.query({ url: "*://www.youtube.com/*" });
    browser.tabs.sendMessage(tab.id, { type: "resumeVideo", tab: tab.id });
});

let videoTimeout;

async function playNextVideo(offset = 1) {
    if (DBDATA.queue.length == 0) {
        console.log("Queue empty", offset);
        return;
    }
    offset = offset % DBDATA.queue.length; // deal with very small queues
    const cut = DBDATA.queue.splice(0, offset);
    DBDATA.queue.push(...cut);

    const [tab] = await browser.tabs.query({ url: "*://www.youtube.com/*" });
    if (!tab) return;
    browser.tabs.sendMessage(tab.id, { type: "playVideo", tab: tab.id, id: DBDATA.queue[0].id });
    console.log("sendMessage: ", tab.id, { type: "playVideo", tab: tab.id, id: DBDATA.queue[0].id });
    await renderQueue(DBDATA.queue);
    if (videoTimeout) clearTimeout(videoTimeout);
    videoTimeout = setTimeout(() => {
        console.log("Error:", DBDATA.queue[0].id, DBDATA.queue[0].title);
        console.log("Video did NOT start playing within timeout");
        DBDATA.queue[0].errCnt = (DBDATA.queue[0].errCnt || 0) + 1;
        db.saveVideos([DBDATA.queue[0]]);
        logEvent(DBDATA.queue[0], "error");
        playNextVideo();
    }, 20000); // 20s -- Still some problems...
}

function getVideoIdFromInput(input) {
    if (input.startsWith("http")) {
        const params = new URL(input).searchParams;
        const listId = params.get("list");
        const videoId = params.get("v");
        if (listId) {
            return { type: "playlist", id: listId };
        } else {
            return { type: "video", id: videoId };
        }
    } else {
        // assume raw video id
        return { type: "video", id: input };
    }
}

async function logEvent(video, event) {
    let now = Date.now();
    video.lastPlayDate = now; // includes errors and skips
    video.delay = event === "delay";
    if (event == "play") {
        video.playCnt = (video.playCnt || 0) + 1;
    }
    if (video.playCnt == 1) {
        video.firstPlayDate = Date.now();
    }
    await db.saveVideos([video]);
    const logEntry = {
        id: video.id,
        timestamp: now,
        event: event,
    };
    await db.saveLog([logEntry]);
}

browser.runtime.onMessage.addListener(async (msg, sender) => {
    const videoId = getVideoIdFromInput(sender.url).id;
    const currVideo = DBDATA.queue[0];
    console.log("options.js received message:", msg, videoId);
    if (msg.type === "videoPlaying") {
        clearTimeout(videoTimeout);
        if (videoId && currVideo && videoId === currVideo.id && !currVideo.yt?.contentDetails?.duration && !currVideo.scrapedDuration) {
            currVideo.scrapedDuration = msg.duration;
            await db.saveVideos([currVideo]);
        }
    }
    if (msg.type === "videoEnded") {
        // console.log("Controller: video ended, moving to next");
        // check in case some other video was actually playing, don't want to credit that
        if (videoId && currVideo && videoId === currVideo.id) {
            await logEvent(currVideo, "play");
        }
        playNextVideo();
    }
});

async function exportDB() {
    const videos = await db.loadVideos(false);
    const log = await db.getLastNLogs(MAXLOGDUMP);
    const exportData = {
        videos,
        log,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
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
            await db.saveVideos(data.videos); // only replaces each id with new content
            await db.saveLog(data.log);
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
document.getElementById("exportBtn").addEventListener("click", exportDB);
document.getElementById("deleteBtn").addEventListener("click", deleteVideos);

document.getElementById("importBtn").addEventListener("click", () => {
    const fileInput = document.getElementById("importFile");
    if (fileInput.files.length > 0) {
        importVideos(fileInput.files[0]);
    } else {
        alert("Please select a file first");
    }
});

function plotRatings(videos) {
    const ratings = videos.map((v) => v.rating || DEFAULT_RATING);

    // Count how many videos for each rating
    const counts = {};
    ratings.forEach((r) => {
        r = parseFloat(r.toFixed(1)); // normalize e.g. 7 → 7.0
        counts[r] = (counts[r] || 0) + 1;
    });

    // Extract sorted rating values
    const xs = Object.keys(counts)
        .map(Number)
        .sort((a, b) => a - b);

    // Y counts
    const ys = xs.map((r) => counts[r]);
    const ticktext = xs.map((r) => {
        const days = rating2days(r);
        const totalTime = formatDuration(counts[r] * 3, false); // hack: Send minutes not seconds
        const time = formatDuration((counts[r] * 3) / days, false);
        return `${r.toFixed(1)}<br>${totalTime}/${days}d<br>${time}`;
    });
    const colors = xs.map((r) => rating2color(r));
    const trace = {
        x: xs,
        y: ys,
        type: "bar",
        marker: { color: colors },
    };

    const layout = {
        title: "Ratings Distribution",
        xaxis: { title: "Rating", tickvals: xs, ticktext: ticktext },
        yaxis: { title: "Count", type: "log" },
    };

    Plotly.newPlot("ratings-chart", [trace], layout);

    let loads = xs.map((r) => {
        const days = rating2days(r);
        const load = (counts[r] * 3) / 60 / days;
        return load;
    });

    const xsRev = [...xs].reverse();
    // const ysRev = [...ys].reverse();
    const colorsRev = [...colors].reverse();
    const loadsRev = [...loads].reverse();

    // --- Plot 2: stacked horizontal bar ---
    const traces2 = xsRev.map((r, i) => ({
        name: `Rating ${r.toFixed(1)}`,
        type: "bar",
        orientation: "h",
        x: [loadsRev[i]], // width of this segment
        y: ["Ratings"], // single category
        marker: { color: colorsRev[i] },
        hovertemplate: `Rating ${r.toFixed(1)}<br>Hours/day: ${loadsRev[i].toFixed(1)}<extra></extra>`,
    }));

    const layout2 = {
        barmode: "stack",
        title: "Ratings Breakdown",
        xaxis: { title: "Count" },
        yaxis: { showticklabels: false },
    };

    Plotly.newPlot("interval-chart", traces2, layout2);
}

function plotScores(videos) {
    // Get unique ratings
    const ratings = [...new Set(videos.map((v) => v.rating ?? DEFAULT_RATING))].sort((a, b) => a - b);

    // Create a trace for each rating
    const traces = ratings.map((r) => {
        const scoresForRating = videos.filter((v) => (v.rating ?? DEFAULT_RATING) === r).map((v) => v.score);
        return {
            x: scoresForRating,
            type: "histogram",
            name: `Rating ${r.toFixed(1)}`,
            marker: { color: rating2color(r) },
            xbins: { size: 2 },
        };
    });

    const layout = {
        title: "Scores Distribution",
        xaxis: { title: "Score" },
        yaxis: { title: "Count" },
        barmode: "stack",
    };

    Plotly.newPlot("scores-chart", traces, layout);
}

function plotCooldownFactor(videos) {
    const ratings = [...new Set(videos.map((v) => v.rating ?? DEFAULT_RATING))].sort((a, b) => a - b);

    const traces = [];
    for (let i = ratings.length - 1; i >= 0; i--) {
        const rating = ratings[i];
        const ys = [];
        const xs = [];
        for (let daysSince = 0; daysSince <= 365; daysSince += 0.1) {
            // ys.push(cooldownFactor(d / rating2days(r)));
            ys.push(scoreHelper(daysSince, rating, false));
            xs.push(daysSince - rating2days(rating));
            // xs.push(daysSince);
        }
        traces.push({
            x: xs,
            y: ys,
            mode: "lines",
            name: `Rating ${rating.toFixed(1)}`,
            line: { color: rating2color(rating) },
        });
    }

    // Layout
    const layout = {
        title: "Function Test Graph",
        xaxis: { title: { text: "days" }, range: [-5, 150] },
        yaxis: { title: { text: "Cooldown penalty/bonus" } },
    };

    // Plot
    Plotly.newPlot("cooldown-chart", traces, layout);
}

let tabulator = null;
function renderGrid(queue) {
    const menu = document.getElementById("gridMenu");
    let columns = [
        {
            title: "Thumb",
            field: "id",
            formatter: (cell) => {
                const videoId = cell.getValue();
                const img = document.createElement("img");
                img.src = `https://i.ytimg.com/vi/${videoId}/default.jpg`;
                img.style.width = "70px";
                img.style.height = "54px";
                // return `<img src="https://i.ytimg.com/vi/${videoId}/default.jpg" style="width:70px;">`;
                return img;
            },
        },
        { title: "Title", field: "title", formatter: "textarea", width: 500, headerFilter: "input" },
        { title: "Rating", field: "rating", hozAlign: "right" },
        { title: "Score", field: "score", hozAlign: "right" },
        { title: "ErrCnt", field: "errCnt", hozAlign: "right", editor: "number" },
    ];

    const data = queue.map((video) => ({
        id: video.id,
        title: video.title || video.yt?.snippet?.title || video.id,
        rating: video.rating.toFixed(1),
        score: video.score.toFixed(1),
        errCnt: video.errCnt ?? 0,
    }));

    if (tabulator) {
        tabulator.replaceData(data);
        return;
    }

    tabulator = new Tabulator("#database-grid", {
        data: data,
        columns: columns,
        pagination: "local",
        paginationSize: 10,
        layout: "fitColumns",
        movableColumns: true,
    });
    tabulator.on("cellEdited", async (cell) => {
        console.log("Edited", cell.getField(), "=", cell.getValue(), "(old:", cell.getOldValue(), "row id:", cell.getRow().getData().id, ")");
        if (cell.getField() == "errCnt") {
            const idx = DBDATA.queue.findIndex((v) => v.id === cell.getRow().getData().id);
            if (idx === -1) {
                alert("Error: Cannot find in DBDATA");
                return;
            }
            let video = DBDATA.queue[idx];
            video.errCnt = cell.getValue();
            await db.saveVideos(video);
        }
    });

    return;
}

function calcStringSimilarity(queue) {
    let list = [];
    for (let a of queue) {
        for (let b of queue) {
            if (a === b) continue;
            const similarityScore = stringSimilarity.compareTwoStrings(a.yt?.snippet?.title, b.yt?.snippet?.title);
            list.push({ similarityScore, a, b });
        }
    }
    list.sort((a, b) => b.similarityScore - a.similarityScore);
    let n = 0;
    for (let ss of list) {
        console.log(ss.similarityScore, ss.a.yt?.snippet?.title, ss.b.yt?.snippet?.title);
        n++;
        if (n > 100) break;
    }
}

async function moveVideoToFront(id) {
    const idx = DBDATA.queue.findIndex((v) => v.id === id);
    if (idx === -1) {
        console.log("Error could not find ", id);
        return;
    }
    const [video] = DBDATA.queue.splice(idx, 1);
    DBDATA.queue.unshift(video);
    await renderQueue(DBDATA.queue);
}

// Initial load
(async () => {
    DBDATA.queue = await db.loadVideos();
    DBDATA.queue.forEach((v) => {
        v.score = scoreVideo(v);
    });
    DBDATA.queue.sort((a, b) => b.score - a.score);
    renderGrid(DBDATA.queue);
    DBDATA.filtered = DBDATA.queue.filter((v) => (v.errCnt ?? 0) < 3);
    plotRatings(DBDATA.filtered);
    plotScores(DBDATA.filtered);
    plotCooldownFactor(DBDATA.filtered);
    // calcStringSimilarity(DBDATA.queue);
    renderQueue(DBDATA.queue || []);
})();
