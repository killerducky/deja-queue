// const fs = require("fs");
// const path = require("path");
// import * as db from "./db.js";

// Cross-browser shim
if (typeof browser === "undefined") {
  var browser = chrome; // var so it's global
}

let DBDATA = { queue: [], filtered: [] };
let LISTLEN = 50;
let MAXLOGDUMP = 99999;
let DIVERSITY_FACTOR = 24;
let LONG_DELAY_TIME = 7;
let LONG_DELAY_BONUS = 2.5; // half a half a rating point per doubling
let INIT_FACTOR = 30;
let DEFAULT_RATING = 7.5;
let COOLDOWN_JITTER_START = 3; // Subtract N days from the interval
let COOLDOWN_JITTER_RATE = 0.2; // Add up to X% jitter to that part of the interval
let RATING_FACTOR = 1;

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
  if (rating >= 5.5) return 365;
  return 365 * 3;
}

function cooldownFactor(daysSince, rating, noise = true, salt = "salt") {
  if (daysSince == null) {
    return INIT_FACTOR;
  }
  let T = rating2days(rating);
  if (noise) {
    let T1 = T - COOLDOWN_JITTER_START;
    if (T1 > 0) {
      T += T1 * hashRandom(`${salt}cooldownJitter`) * COOLDOWN_JITTER_RATE;
    }
  }
  let ratio = daysSince / T;
  let daysOverdue = daysSince - T * 1.5;
  if (ratio < 1) {
    const eased = Math.pow(ratio, 3);
    return -50 * (1 - eased);
    // return -10 * rating * (1 - eased);
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
function scoreHelper(daysSince, rating, noise = true, salt = "salt") {
  let score = 0;
  // Mix rating and DEFAULT_RATING, and multiply by 10
  score += 10 * ((1 - RATING_FACTOR) * DEFAULT_RATING + RATING_FACTOR * rating);
  score += cooldownFactor(daysSince, rating, noise);
  score += !noise ? 0 : hashRandom(`${salt}noise`) * DIVERSITY_FACTOR;
  return score;
}

function calcDaysSince(video) {
  if (!video.lastPlayDate) {
    return null;
  }
  let now = Date.now();
  let salt = `${video.id}${video.lastPlayDate}`;
  let daysSince = (now - video.lastPlayDate) / (24 * 3600 * 1000);
  if (video.delay) {
    // if e.g. a big playlist is added, user clicks "delay" and they will be randomized into the backlog uniformly
    daysSince += rating2days(video.rating) * hashRandom(`${salt}delay`);
  }
  return daysSince;
}

function scoreVideo(video, noise = true) {
  if (video.errCnt && video.errCnt >= 3) return -10; // too many errors, don't play
  if (video.dup) return -9; // Ignore dups
  let salt = `${video.id}${video.lastPlayDate}`;
  if (!video.rating) video.rating = DEFAULT_RATING;
  let daysSince = calcDaysSince(video);
  let score = scoreHelper(daysSince, video.rating, noise, salt);
  return score;
}

let env;
// try {
//   const envPath = path.join(__dirname, ".env.json"); // local file relative to main.js
//   const data = fs.readFileSync(envPath, "utf-8");
//   env = JSON.parse(data);
//   console.log("Loaded env:", env);
// } catch (err) {
//   console.error("Failed to load .env.json", err);
//   alert("Could not load .env.json");
// }

// env = window.electronAPI.env;
async function loadEnv() {
  try {
    console.log("readfile");
    const data = await window.electronAPI.readFile("./.env.json");
    console.log(data);
    env = JSON.parse(data);
  } catch (err) {
    console.error("Failed to load .env.json", err);
    alert("Could not load .env.json");
  }
}
loadEnv();

const input = document.getElementById("videoId");
const addBtn = document.getElementById("add");
const fastForwardBtn = document.getElementById("fastForward");
const nextBtn = document.getElementById("next");
const delayBtn = document.getElementById("delay");
const pauseBtn = document.getElementById("pause");
const playBtn = document.getElementById("play");
const currentEl = document.getElementById("current");
const queueEl = document.getElementById("queue");
const logEl = document.getElementById("log");
const queueModeEl = document.getElementById("queueMode");

queueModeEl.value = localStorage.getItem("queueMode") || "Video";
queueModeEl.addEventListener("change", () => {
  localStorage.setItem("queueMode", queueModeEl.value);
});

function addToc() {
  const toc = document.getElementById("toc");
  const headings = document.querySelectorAll("h2");
  const ul = document.createElement("ul");
  ul.className = "toc-horizontal";

  headings.forEach((h2) => {
    // Make sure each heading has an ID
    if (!h2.id) {
      h2.id = h2.textContent.toLowerCase().replace(/\s+/g, "-");
    }
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#${h2.id}`;
    a.textContent = h2.textContent;
    li.appendChild(a);
    ul.appendChild(li);
  });
  toc.appendChild(ul);
}
addToc();

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function fnv1a32(str) {
  let hash = 0x811c9dc5; // FNV_offset_basis for 32-bit FNV-1a
  const FNV_prime = 0x01000193; // FNV_prime for 32-bit FNV-1a

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i); // XOR with the current byte
    hash = (hash * FNV_prime) >>> 0; // Multiply by FNV_prime and ensure 32-bit unsigned integer
  }

  return hash;
}

//
// hashRandom:
//
// This is important to avoid rerolling the random numbers
// Example:
//
// if (video.delay)
//   daysSince += rating2days(video.rating) * hashRandom(`${salt}delay`);
//
// Suppose rating2days() = 300, and 150 days have passed.
// If we reroll this part, every video like this will have a 50% chance to act like their cooldown is over.
// Instead with hashRandom we don't reroll this every time.
//
function hashRandom(str) {
  return fnv1a32(str) / 0xffffffff;
}

function date2String(d) {
  let yy = `${String(d.getFullYear()).padStart(4, "0")}`;
  let MM = `${String(d.getMonth() + 1).padStart(2, "0")}`;
  let dd = `${String(d.getDate()).padStart(2, "0")}`;
  let hh = `${String(d.getHours()).padStart(2, "0")}`;
  let mm = `${String(d.getMinutes()).padStart(2, "0")}`;
  return `${yy}-${MM}-${dd} ${hh}:${mm}`;
}

const parseAttr = (input, attrName, fallback) => {
  const v = input.getAttribute(attrName);
  if (v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function showToast(msg) {
  let duration = 5000;
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), duration);
}

let tabulatorCurrent = null;
let tabulatorQueue = null;
let tabulatorLog = null;
async function renderQueue() {
  if (DBDATA.queue.length == 0) {
    console.log("Empty DBDATA.queue, nothing to render");
    return;
  }
  const [firstVideo, ...restVideos] = DBDATA.queue;
  tabulatorCurrent = await table2(
    tabulatorCurrent,
    currentEl,
    [firstVideo],
    false
  );
  tabulatorQueue = await table2(tabulatorQueue, queueEl, restVideos, true);
  let log = await db.getLastNLogs(LISTLEN);
  let logVideoList = [];
  for (let entry of log) {
    let video = DBDATA.queue.find((v) => v.id === entry.id);
    logVideoList.push(video);
  }
  tabulatorLog = await table2(tabulatorLog, logEl, logVideoList, true);
}

let tableColumns = {
  thumb: {
    title: "Thumb",
    field: "id",
    formatter: (cell) => {
      let id = cell.getValue();
      return `<img src="https://i.ytimg.com/vi/${id}/default.jpg" style="height:54px;cursor:pointer;">`;
    },
    width: 90,
    cellClick: async (e, cell) => {
      if (cell.getTable().options.custom.reorder) {
        moveVideoToFront(cell.getRow().getData().id);
        await renderQueue();
        showToast("Added to front of queue");
      } else {
        playNextVideo(0);
      }
    },
  },
  title: {
    title: "Title",
    field: "yt.snippet.title",
    formatter: "textarea",
    hozAlign: "left",
    width: 250,
  },
  tags: {
    title: "Tags",
    field: "tags",
    formatter: "textarea",
    editor: "input",
    width: 150,
    cellEdited: async (cell) => {
      const video = DBDATA.queue.find(
        (v) => v.id === cell.getRow().getData().id
      );
      if (!video) {
        alert("Error: Cannot find in DBDATA");
        return;
      }
      console.log(`Edit ID:${video.id} New tags: ${video.tags}`);
      await db.saveVideos(video);
    },
  },
  track: {
    title: "Track",
    field: "yt.snippet.position",
  },
  dur: {
    title: "Dur",
    formatter: (cell) => {
      const video = cell.getRow().getData();
      return formatVideoDuration(video);
    },
  },
  lastPlayed: {
    title: "Last Played",
    formatter: (cell) => {
      return formatLastPlayDate(cell.getRow().getData());
    },
  },
  playCnt: {
    title: "Play<br>Count",
    field: "playCnt",
    formatter: "plaintext",
  },
  rating: {
    title: "Rating",
    field: "rating",
    formatter: (cell) => {
      let video = cell.getRow().getData();
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
      input.value = (video.rating ?? DEFAULT_RATING).toFixed(1);
      div.appendChild(downBtn);
      div.appendChild(input);
      div.appendChild(upBtn);
      return div;
    },
    cellClick: async (e, cell) => {
      let video = cell.getRow().getData();
      let origRating = video.rating;
      if (e.target.classList.contains("step-down")) {
        video.rating = Math.max(1, video.rating - 0.5);
      } else if (e.target.classList.contains("step-up")) {
        video.rating = Math.min(10, video.rating + 0.5);
      }
      if (origRating != video.rating) {
        await db.saveVideos([video]);
        cell.getRow().reformat();
        console.log("Saved new rating", video.rating, "for", video.id);
      }
    },
  },
  interval: {
    title: "Interval",
    formatter: (cell) => {
      return rating2days(cell.getRow().getData().rating) + "d";
    },
  },
};

async function table2(tabulator, htmlEl, videoList, reorder) {
  if (tabulator) {
    tabulator.replaceData(videoList);
    return tabulator;
  }

  tabulator = new Tabulator(htmlEl, {
    data: videoList,
    custom: { reorder }, // custom property
    columns: [
      tableColumns.thumb,
      tableColumns.title,
      tableColumns.tags,
      tableColumns.track,
      tableColumns.dur,
      tableColumns.lastPlayed,
      tableColumns.playCnt,
      tableColumns.rating,
      tableColumns.interval,
    ],
    columnDefaults: {
      hozAlign: "center",
      vertAlign: "middle",
    },
    layout: "fitData",
    movableColumns: true,
    pagination: "local",
    paginationSize: 5,
    rowHeight: 68,
  });
  return tabulator;
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
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
}
function formatVideoDuration(video) {
  if (video.scrapedDuration) {
    return formatDuration(video.scrapedDuration, false);
  } else {
    return formatDuration(video.yt?.contentDetails?.duration) || "—";
  }
}

function formatLastPlayDate(video) {
  if (!video.lastPlayDate) {
    return "—";
  }
  const d = new Date(video.lastPlayDate);
  let daysSince = calcDaysSince(video);
  let due = rating2days(video.rating) - daysSince;
  let html = "";
  html += date2String(d);
  html += "<br>";
  html += `due: ${due.toFixed(1)} days`;
  return html;
}

async function addYoutubeInfo(video) {
  console.log("Fetching YouTube info for", video.id);
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${video.id}&key=${env.API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  // console.log(data);
  if (data.items?.length > 0) {
    video.yt = data.items[0];
    await db.saveVideos([video]);
  } else {
    console.log("Error fetching yt for: ", video.id);
  }
}

async function addPlaylistVideos(playlistId) {
  // First, fetch playlist metadata
  let playlistUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=${playlistId}&key=${env.API_KEY}`;
  let playlistRes = await fetch(playlistUrl);
  let playlistData = await playlistRes.json();

  if (!playlistData.items || playlistData.items.length === 0) {
    console.error("Playlist not found:", playlistId);
    return;
  }

  let playlistInfo = playlistData.items[0];
  let playlist = {
    id: playlistId,
    title: playlistInfo.snippet.title,
    description: playlistInfo.snippet.description,
    channelTitle: playlistInfo.snippet.channelTitle,
    videoCount: playlistInfo.contentDetails.itemCount,
    thumbnailUrl: playlistInfo.snippet.thumbnails?.default?.url,
    dateAdded: Date.now(),
    lastUpdated: Date.now(),
    rating: DEFAULT_RATING,
    yt: playlistInfo,
    videoIds: [],
  };

  // Now fetch all videos from the playlist
  let nextPageToken = "";
  let newVideos = [];
  do {
    let url =
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails` +
      `&maxResults=50&pageToken=${nextPageToken}&playlistId=${playlistId}&key=${env.API_KEY}`;
    let res = await fetch(url);
    let data = await res.json();
    console.log("addPlaylistVideos raw: ", data);

    // moveVideoToFront needs to go backwards to work
    for (const yt of [...data.items].reverse()) {
      let video = {
        id: yt.snippet.resourceId.videoId,
        playlistId: playlistId,
        yt: yt,
      };
      // Due to going backwards, we need to go backwards here too
      playlist.videoIds.unshift(video.id);
      if (DBDATA.queue.find((v) => v.id === video.id)) {
        // Exists already, just move up
        await moveVideoToFront(video.id);
      } else {
        // Doesn't exist, add and move up
        newVideos.push(video);
        DBDATA.queue.splice(1, 0, video);
      }
    }
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  await db.saveVideos(newVideos);
  console.log("addPlaylistVideos: newVideos ", newVideos);

  await db.savePlaylists(playlist);

  await renderPlaylists();
  await renderQueue();
}

addBtn.addEventListener("click", async () => {
  let response = getVideoIdFromInput(input.value.trim());
  if (!response.id) {
    alert(`Could not parse URL`);
    return;
  }
  if (response.type == "video") {
    if (DBDATA.queue.find((v) => v.id === response.id)) {
      showToast("Video already in DB");
      await moveVideoToFront(response.id);
    } else {
      let video = { id: response.id };
      await addYoutubeInfo(video);
      if (!video.yt) {
        alert("Failed to fetch video info, please check the ID");
        return;
      }
      DBDATA.queue.splice(1, 0, video);
    }
  } else if (response.type == "playlist") {
    await addPlaylistVideos(response.id);
  } else {
    alert("Error: could not parse input");
    return;
  }
  await renderQueue();
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
fastForwardBtn.addEventListener("click", async () => {
  const [tab] = await browser.tabs.query({ url: "*://www.youtube.com/*" });
  browser.tabs.sendMessage(tab.id, { type: "fastForward", tab: tab.id });
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
  browser.tabs.sendMessage(tab.id, {
    type: "playVideo",
    tab: tab.id,
    id: DBDATA.queue[0].id,
  });
  console.log("sendMessage: ", tab.id, {
    type: "playVideo",
    tab: tab.id,
    id: DBDATA.queue[0].id,
  });
  await renderQueue();
  if (videoTimeout) clearTimeout(videoTimeout);
  videoTimeout = setTimeout(() => {
    console.log("Error:", DBDATA.queue[0].id, DBDATA.queue[0].title);
    console.log("Video did NOT start playing within timeout");
    showToast("Video timeout");
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
    // prioritize single video.
    if (videoId) {
      return { type: "video", id: videoId };
    } else {
      return { type: "playlist", id: listId };
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
    video.firstPlayDate = now;
  }
  await db.saveVideos([video]);
  const logEntry = {
    id: video.id,
    timestamp: now,
    event: event,
  };
  await db.saveLog([logEntry]);
}

let lastEndedVideoId = null;
// browser.runtime.onMessage.addListener(async (msg, sender) => {
window.electronAPI.onReply(async (msg) => {
  const videoId = getVideoIdFromInput(sender.url).id;
  const currVideo = DBDATA.queue[0];
  console.log("options.js received message:", msg, videoId);
  if (msg.type === "videoPlaying") {
    clearTimeout(videoTimeout);
    if (
      videoId &&
      currVideo &&
      videoId === currVideo.id &&
      !currVideo.yt?.contentDetails?.duration &&
      !currVideo.scrapedDuration
    ) {
      currVideo.scrapedDuration = msg.duration;
      await db.saveVideos([currVideo]);
    }
  }
  if (msg.type === "videoEnded") {
    if (lastEndedVideoId === videoId) {
      console.log("Duplicate videoEnded ignored for", videoId);
      return;
    }
    // console.log("Controller: video ended, moving to next");
    // check in case some other video was actually playing, don't want to credit that
    if (videoId && currVideo && videoId === currVideo.id) {
      await logEvent(currVideo, "play");
    }
    playNextVideo();
  }
});

async function exportDB() {
  const playlists = await db.loadPlaylists();
  const videos = await db.loadVideos();
  const log = await db.getLastNLogs(MAXLOGDUMP);
  const exportData = {
    playlists,
    videos,
    log,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "videos_export.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

function importDB(file) {
  console.log("Importing DB from file:", file);
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      await db.deleteDB();
      await db.saveVideos(data.videos); // only replaces each id with new content
      await db.savePlaylists(data.playlists); // only replaces each id with new content
      await db.saveLog(data.log);
      console.log("Videos imported successfully");
    } catch (err) {
      console.error("Failed to import videos:", err);
    }
  };
  reader.readAsText(file);
}

async function deleteVideos() {
  const confirmed = window.confirm(
    "Are you sure you want to delete the database? This cannot be undone."
  );
  if (!confirmed) return; // user cancelled
  await db.deleteDB();
  alert("Database deleted. Please reload the page.");
}
document.getElementById("exportBtn").addEventListener("click", exportDB);
document.getElementById("deleteBtn").addEventListener("click", deleteVideos);

const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");

importBtn.addEventListener("click", () => {
  importFile.click();
});

importFile.addEventListener("change", () => {
  if (importFile.files.length > 0) {
    importDB(importFile.files[0]);
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
    yaxis: { title: "Count" },
    updatemenus: [
      {
        y: 1,
        x: 1.15,
        yanchor: "top",
        xanchor: "right",
        buttons: [
          {
            method: "relayout",
            args: ["yaxis.type", "linear"],
            label: "Linear",
          },
          {
            method: "relayout",
            args: ["yaxis.type", "log"],
            label: "Log",
          },
        ],
      },
    ],
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
    hovertemplate: `Rating ${r.toFixed(1)}<br>Hours/day: ${loadsRev[i].toFixed(
      1
    )}<extra></extra>`,
  }));

  const layout2 = {
    barmode: "stack",
    title: "Ratings Breakdown",
    xaxis: { title: "Count" },
    yaxis: { showticklabels: false, fixedrange: true, range: [-0.5, 0.5] },
    margin: { t: 15, b: 15 },
  };

  Plotly.newPlot("interval-chart", traces2, layout2);
}

function plotScores(videos) {
  // Get unique ratings
  const ratings = [
    ...new Set(videos.map((v) => v.rating ?? DEFAULT_RATING)),
  ].sort((a, b) => a - b);

  // Create a trace for each rating
  const traces = ratings.map((r) => {
    const scoresForRating = videos
      .filter((v) => (v.rating ?? DEFAULT_RATING) === r)
      .map((v) => v.score);
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
  const ratings = [
    ...new Set(videos.map((v) => v.rating ?? DEFAULT_RATING)),
  ].sort((a, b) => a - b);

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

let tabulatorDB = null;
function setGlobalSearch(myTabulatorTable, value) {
  myTabulatorTable.setFilter((data, row) => {
    let terms = value.toLowerCase().split(" ");
    // console.log("DB filter on ", terms);
    for (let term of terms) {
      let found = false;
      for (let key in data) {
        const value = data[key];
        if (value && value.toString().toLowerCase().includes(term)) {
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
    return true;
  });
}

const dbFilterEl = document.getElementById("dbFilter");
dbFilterEl.addEventListener("change", (e) => {
  setGlobalSearch(tabulatorDB, e.target.value);
});

function renderDB(queue) {
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
        return img;
      },
      cellClick: async function (e, cell) {
        const video = DBDATA.queue.find(
          (v) => v.id === cell.getRow().getData().id
        );
        if (!video) {
          alert("Error: Cannot find in DBDATA");
          return;
        }
        await moveVideoToFront(video.id);
        await renderQueue();
        showToast("Added to front of queue");
      },
    },
    {
      title: "Title",
      field: "title",
      formatter: "textarea",
      width: 250,
      headerFilter: "input",
    },
    {
      title: "Tags",
      field: "tags",
      formatter: "textarea",
      width: 150,
      headerFilter: "input",
    },
    { title: "Dur", field: "dur", formatter: "textarea" },
    { title: "R", field: "rating", hozAlign: "center" },
    { title: "S", field: "score", hozAlign: "center" },
    {
      title: "Last Played",
      field: "lastPlayDate",
      hozAlign: "center",
      formatter: "html",
    },
    { title: "Cnt", field: "playCnt", hozAlign: "center" },
    { title: "Int", field: "int", hozAlign: "center" },
    { title: "Delay", field: "delay", hozAlign: "center" },
    { title: "E", field: "errCnt", hozAlign: "center", editor: "number" },
    { title: "Dup", field: "dup", hozAlign: "left", editor: "input" },
    { title: "ID", field: "id", hozAlign: "left" },
    {
      title: "Channel",
      field: "videoOwnerChannelTitle",
      hozAlign: "left",
      headerFilter: "input",
    },
  ];

  const data = queue.map((video) => ({
    id: video.id,
    title: video.title || video.yt?.snippet?.title || video.id,
    tags: video.tags,
    dur: formatVideoDuration(video),
    rating: video.rating.toFixed(1),
    score: video.score.toFixed(1),
    playCnt: video.playCnt,
    int: `${rating2days(video.rating)}d`,
    delay: video.delay ? "✅" : "",
    errCnt: video.errCnt ?? 0,
    dup: video.dup,
    lastPlayDate: formatLastPlayDate(video),
    videoOwnerChannelTitle:
      video?.yt?.snippet?.videoOwnerChannelTitle ??
      video?.yt?.snippet?.channelTitle,
  }));

  if (tabulatorDB) {
    tabulatorDB.replaceData(data);
    return;
  }

  tabulatorDB = new Tabulator("#database-grid", {
    data: data,
    columns: columns,
    pagination: "local",
    paginationSize: 10,
    layout: "fitData",
    movableColumns: true,
  });
  tabulatorDB.on("cellEdited", async (cell) => {
    console.log(
      "Edited",
      cell.getField(),
      "=",
      cell.getValue(),
      "(old:",
      cell.getOldValue(),
      "row id:",
      cell.getRow().getData().id,
      ")"
    );
    const idx = DBDATA.queue.findIndex(
      (v) => v.id === cell.getRow().getData().id
    );
    if (idx === -1) {
      alert("Error: Cannot find in DBDATA");
      return;
    }
    // TODO: Move this to formatter for errCnt
    let video = DBDATA.queue[idx];
    if (cell.getField() == "errCnt") {
      video.errCnt = cell.getValue();
      await db.saveVideos(video);
    } else if (cell.getField() == "dup") {
      video.dup = cell.getValue();
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
      const similarityScore = stringSimilarity.compareTwoStrings(
        a.yt?.snippet?.title,
        b.yt?.snippet?.title
      );
      list.push({ similarityScore, a, b });
    }
  }
  list.sort((a, b) => b.similarityScore - a.similarityScore);
  let n = 0;
  for (let ss of list) {
    console.log(
      ss.similarityScore,
      ss.a.yt?.snippet?.title,
      ss.b.yt?.snippet?.title
    );
    n++;
    if (n > 100) break;
  }
}

let playlistsTabulator = null;
const plFilterEl = document.getElementById("plFilter");
plFilterEl.addEventListener("change", (e) => {
  setGlobalSearch(playlistsTabulator, e.target.value);
});

async function renderPlaylists() {
  let columns = [
    {
      title: "Thumb",
      field: "thumbnailUrl",
      formatter: (cell) => {
        const url = cell.getValue();
        const img = document.createElement("img");
        img.src = url || "favicon.ico";
        // img.style.width = "70px";
        img.style.height = "54px";
        return img;
      },
      cellClick: async function (e, cell) {
        const plVideoIds = cell.getRow().getData().videoIds;
        // console.log(plVideoIds);
        // Adding to the front one at a time, so go backwards
        for (let vid of [...plVideoIds].reverse()) {
          await moveVideoToFront(vid);
        }
        await renderQueue();
        showToast("Added to front of queue");
      },
      hozAlign: "center",
      vertAlign: "center",
      width: 90,
    },
    {
      title: "Title",
      field: "title",
      formatter: "textarea",
      width: 250,
      headerFilter: "input",
    },
    {
      title: "Tags",
      field: "tags",
      formatter: "textarea",
      editor: "input",
      width: 150,
      cellEdited: async (cell) => {
        // console.log("edit:", cell.getData());
        const pl = cell.getData();
        console.log(`edit pl:${pl.id} tags:${pl.tags}`);
        await db.savePlaylists(pl);
      },
    },
    {
      title: "Channel",
      field: "channelTitle",
      headerFilter: "input",
      width: 150,
    },
    { title: "Videos", field: "videoCount", hozAlign: "center" },
    {
      title: "Date Added",
      field: "dateAdded",
      formatter: (cell) => {
        const timestamp = cell.getValue();
        if (!timestamp) return "—";
        return date2String(new Date(timestamp));
      },
      hozAlign: "center",
      width: 150,
    },
    {
      title: "Rating",
      field: "rating",
      hozAlign: "center",
      formatter: (cell) => cell.getValue().toFixed(1),
      width: 80,
    },
    { title: "ID", field: "id", hozAlign: "left", width: 150 },
  ];

  if (playlistsTabulator) {
    playlistsTabulator.replaceData(DBDATA.playlists);
    return;
  }

  playlistsTabulator = new Tabulator("#playlists-grid", {
    data: DBDATA.playlists,
    columns: columns,
    pagination: "local",
    paginationSize: 10,
    layout: "fitData",
    movableColumns: true,
  });
}

async function moveVideoToFront(id) {
  const idx = DBDATA.queue.findIndex((v) => v.id === id);
  if (idx === -1) {
    console.log("Error could not find ", id);
    return;
  }
  const [video] = DBDATA.queue.splice(idx, 1);
  DBDATA.queue.splice(1, 0, video); // insert at index 1 (2nd spot)
}

// Initial load
(async () => {
  DBDATA.queue = await db.loadVideos();
  DBDATA.queue.forEach((v) => {
    v.score = scoreVideo(v);
  });
  DBDATA.queue.sort((a, b) => b.score - a.score);
  DBDATA.playlists = await db.loadPlaylists();
  if (queueModeEl.value == "playlist") {
    const playlistMap = new Map(DBDATA.playlists.map((pl) => [pl.id, pl]));
    const validPlaylistIds = new Set(DBDATA.playlists.map((pl) => pl.id));
    let origQueue = DBDATA.queue;
    DBDATA.queue = [];
    let addedIds = new Set();
    const seenPlaylists = new Set();
    // console.log(validPlaylistIds);
    // Iterate through fullQueue
    for (const video of origQueue) {
      // Find a video that belongs to an unseen playlist
      if (
        video.playlistId &&
        validPlaylistIds.has(video.playlistId) &&
        !seenPlaylists.has(video.playlistId)
      ) {
        // console.log("add playlist ", video.playlistId);
        const pl = playlistMap.get(video.playlistId);
        let plVids;
        plVids = pl.videoIds.map((id) => origQueue.find((v) => v.id === id));
        // console.log(plVids);
        DBDATA.queue.push(...plVids);
        plVids.forEach((v) => addedIds.add(v.id));
        seenPlaylists.add(video.playlistId);
      }
    }
    let defaultPlaylist = {
      id: "default",
      title: "Default",
      channelTitle: "",
      videoCount: 0,
      thumbnailUrl: "",
      dateAdded: Date.now(),
      rating: DEFAULT_RATING,
      videoIds: [],
    };
    for (const v of origQueue) {
      if (!addedIds.has(v.id)) {
        DBDATA.queue.push(v);
        defaultPlaylist.videoIds.push(v.id);
        defaultPlaylist.videoCount += 1;
        addedIds.add(v.id);
      }
    }
    DBDATA.playlists.push(defaultPlaylist);
  }
  renderDB(DBDATA.queue);
  renderPlaylists();
  // Remove errors and dups from graphs.
  // But leave in actual Queue (with low score), so we don't e.g. add it again
  DBDATA.filtered = DBDATA.queue.filter((v) => (v.errCnt ?? 0) < 3 && !v.dup);
  plotRatings(DBDATA.filtered);
  plotScores(DBDATA.filtered);
  plotCooldownFactor(DBDATA.filtered);
  // calcStringSimilarity(DBDATA.queue);
  renderQueue();
})();
