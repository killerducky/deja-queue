import * as db from "./db.js";

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

let COMPACT_TABLE_HEIGHT = 40;
let NORMAL_TABLE_HEIGHT = 68;
let COMPACT_THUMB_WIDTH = 60;
let NORMAL_THUMB_WIDTH = 90;

function rating2color(rating) {
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
async function loadEnv() {
  try {
    const data = await window.electronAPI.readFile("./.env.json");
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
// addToc();

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
    true
  );
  tabulatorQueue = await table2(tabulatorQueue, queueEl, restVideos, false);
  let log = await db.getLastNLogs(LISTLEN);
  let logVideoList = [];
  for (let entry of log) {
    let video = DBDATA.queue.find((v) => v.id === entry.id);
    logVideoList.push(video);
  }
  tabulatorLog = await table2(tabulatorLog, logEl, logVideoList, false);
}

function getTableColumns(current) {
  let tableColumns = {
    thumb: {
      title: "Thumb",
      field: "id",
      formatter: (cell) => {
        let id = cell.getValue();
        return `<img src="https://i.ytimg.com/vi/${id}/default.jpg" style="height:54px;cursor:pointer;">`;
      },
      width: current ? NORMAL_THUMB_WIDTH : COMPACT_THUMB_WIDTH,
      cellClick: async (e, cell) => {
        if (!cell.getTable().options.custom.current) {
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
      // formatter: current ? "textarea" : "plaintext",
      formatter: "plaintext",
      tooltip: true,
      hozAlign: "left",
      width: 120,
      // width: current ? 250 : 100,
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
      title: "Trk",
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
        let item = cell.getRow().getData();
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
        input.value = (item.rating ?? DEFAULT_RATING).toFixed(1);
        div.appendChild(downBtn);
        div.appendChild(input);
        div.appendChild(upBtn);
        return div;
      },
      cellClick: async (e, cell) => {
        let item = cell.getRow().getData();
        let origRating = item.rating;
        if (e.target.classList.contains("step-down")) {
          item.rating = Math.max(1, item.rating - 0.5);
        } else if (e.target.classList.contains("step-up")) {
          item.rating = Math.min(10, item.rating + 0.5);
        }
        if (origRating != item.rating) {
          if (item.type == "playlist") {
            await db.savePlaylists([item]);
          } else if (item.type == "video") {
            await db.saveVideos([item]);
          } else {
            alert(`unknown type ${item.type}`);
            console.log(item);
          }
          cell.getRow().reformat();
          console.log("Saved new rating", item.rating, "for", item.id);
        }
      },
    },
    interval: {
      title: "Int",
      formatter: (cell) => {
        return rating2days(cell.getRow().getData().rating) + "d";
      },
    },
  };
  return tableColumns;
}

async function table2(tabulator, htmlEl, videoList, current) {
  let showMoreColumns = false;
  if (tabulator) {
    tabulator.replaceData(videoList);
    return tabulator;
  }
  let tableColumns = getTableColumns(showMoreColumns);

  let columns = [
    tableColumns.thumb,
    tableColumns.title,
    showMoreColumns && tableColumns.tags,
    tableColumns.track,
    showMoreColumns && tableColumns.dur,
    showMoreColumns && tableColumns.lastPlayed,
    showMoreColumns && tableColumns.playCnt,
    tableColumns.rating,
    tableColumns.interval,
  ].filter(Boolean);
  columns.forEach((col) => (col.headerSort = false));

  tabulator = new Tabulator(htmlEl, {
    data: videoList,
    custom: { current }, // custom property
    columns: columns,
    columnDefaults: {
      hozAlign: "center",
      vertAlign: "middle",
    },
    layout: "fitData",
    movableColumns: true,
    rowHeight: showMoreColumns ? NORMAL_TABLE_HEIGHT : COMPACT_TABLE_HEIGHT,
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
  console.log("playlists raw:", playlistData);

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
  let failsafeCnt = 0;
  let seenTokens = new Set();
  do {
    let url =
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails` +
      `&maxResults=50&pageToken=${nextPageToken}&playlistId=${playlistId}&key=${env.API_KEY}`;
    let res = await fetch(url);
    let data = await res.json();
    console.log("playlistItems raw: ", data);

    // moveVideoToFront needs to go backwards to work
    for (const yt of [...data.items].reverse()) {
      let video = {
        id: yt.snippet.resourceId.videoId,
        playlistId: playlistId,
        rating: DEFAULT_RATING,
        yt: yt,
      };
      // Due to going backwards, we need to go backwards here too
      playlist.videoIds.unshift(video.id);
      console.log("Add videoid", video.id);
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
    if (seenTokens.has(data.prevPageToken)) {
      console.log("Token repeated -- youtube mix? Stopping.");
      break;
    }
    seenTokens.add(data.prevPageToken);
    failsafeCnt += 1;
    if (failsafeCnt >= 20) {
      alert("Error: Looped 20 times. Aborting.");
      return;
    }
  } while (nextPageToken);

  await db.saveVideos(newVideos);
  console.log("addPlaylistVideos: newVideos ", newVideos);

  playlist.videoCount = playlist.videoIds.length; // This seems more accurate
  console.log("add", playlist);
  await db.savePlaylists(playlist);

  await renderPlaylists();
  await renderQueue();
}

async function addVideoOrPlaylist(response) {
  if (response.type == "video") {
    if (DBDATA.queue.find((v) => v.id === response.id)) {
      showToast("Video already in DB");
      await moveVideoToFront(response.id);
    } else {
      let video = { id: response.id, rating: DEFAULT_RATING };
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
}
addBtn.addEventListener("click", async () => {
  let response = getVideoIdFromInput(input.value.trim());
  if (!response.id) {
    alert(`Could not parse URL`);
    return;
  }
  addVideoOrPlaylist(response);
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
  sendMessage("youtube-message", { type: "pauseVideo" });
});
playBtn.addEventListener("click", async () => {
  sendMessage("youtube-message", { type: "resumeVideo" });
});
fastForwardBtn.addEventListener("click", async () => {
  sendMessage("youtube-message", { type: "fastForward" });
});

let videoTimeout;

function sendMessage(type, msg) {
  console.log("sendMessage: ", JSON.stringify(msg));
  window.electronAPI.sendBroadcast(msg);
}

async function playNextVideo(offset = 1) {
  if (DBDATA.queue.length == 0) {
    console.log("Queue empty", offset);
    return;
  }
  offset = offset % DBDATA.queue.length; // deal with very small queues
  const cut = DBDATA.queue.splice(0, offset);
  DBDATA.queue.push(...cut);

  let msg = { type: "playVideo", id: DBDATA.queue[0].id };
  sendMessage("youtube-message", msg);
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
    const url = new URL(input);
    if (url.hostname === "youtu.be") {
      const videoId = url.pathname.slice(1); // remove leading "/"
      return { type: "video", id: videoId };
    }
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

window.electronAPI.onBroadcast(async (msg) => {
  const currVideo = DBDATA.queue[0];
  let videoId = null;
  // TODO: We don't always have msg.url?
  // e.g. main.js could be sending the message.
  // But it could add msg.url I suppose
  if (msg.url) {
    videoId = getVideoIdFromInput(msg.url).id;
  }
  console.log("options.js received message:", msg?.type, videoId);
  if (msg?.type === "videoPlaying") {
    clearTimeout(videoTimeout);
    if (
      videoId &&
      currVideo &&
      videoId === currVideo.id &&
      !currVideo.yt?.contentDetails?.duration &&
      !currVideo.scrapedDuration &&
      msg.duration
    ) {
      currVideo.scrapedDuration = msg.duration;
      await db.saveVideos([currVideo]);
    }
  } else if (msg?.type === "videoEnded") {
    if (lastEndedVideoId === videoId) {
      return;
    }
    lastEndedVideoId = videoId;
    if (videoId && currVideo && videoId === currVideo.id) {
      await logEvent(currVideo, "play");
    }
    playNextVideo();
  } else if (msg.type === "queue:addVideo") {
    await addVideoOrPlaylist({ type: "video", id: msg.id });
  } else if (msg.type === "queue:addPlaylist") {
    await addVideoOrPlaylist({ type: "playlist", id: msg.id });
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
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.download = `videos_export_${timestamp}.json`;
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

function getNestedValue(obj, path) {
  return path.split(".").reduce((o, key) => (o ? o[key] : undefined), obj);
}

let tabulatorDB = null;
function setGlobalSearch(myTabulatorTable, value) {
  const t0 = performance.now();
  let terms = value.toLowerCase().split(" ");
  let fields = myTabulatorTable
    .getColumns()
    .map((col) => col.getDefinition().field)
    .filter((field) => field != null);
  myTabulatorTable.setFilter((data) => {
    return terms.every((term) =>
      fields.some((field) => {
        const val = getNestedValue(data, field);
        return val && val.toString().toLowerCase().includes(term);
      })
    );
  });
  const t1 = performance.now();
  console.log(`GlobalSearch took ${(t1 - t0).toFixed(0)} ms`);
}

const dbFilterEl = document.getElementById("dbFilter");
dbFilterEl.addEventListener(
  "input",
  debounce((e) => {
    setGlobalSearch(tabulatorDB, e.target.value);
  }, 300) // 300ms debounce
);

function renderDB(queue) {
  let tableColumns = getTableColumns(true);
  let columns = [
    tableColumns.thumb,
    tableColumns.title,
    tableColumns.tags,
    tableColumns.track,
    tableColumns.dur,
    tableColumns.lastPlayed,
    tableColumns.playCnt,
    tableColumns.rating,
    tableColumns.interval,
    {
      title: "S",
      field: "score",
      hozAlign: "center",
      formatter: (cell) => {
        return cell.getValue().toFixed(1);
      },
    },
    { title: "Delay", field: "delay", hozAlign: "center" },
    { title: "E", field: "errCnt", hozAlign: "center", editor: "number" },
    { title: "Dup", field: "dup", hozAlign: "left", editor: "input" },
    { title: "ID", field: "id", hozAlign: "left", width: COMPACT_THUMB_WIDTH },
    {
      title: "Channel",
      field: "videoOwnerChannelTitle",
      hozAlign: "left",
      headerFilter: "input",
      width: 150,
    },
  ];

  if (tabulatorDB) {
    tabulatorDB.replaceData(queue);
    return;
  }

  tabulatorDB = new Tabulator("#database-grid", {
    data: queue,
    columns: columns,
    custom: { current: false }, // custom property
    height: "100%",
    width: "100%",
    movableColumns: true,
  });
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

function debounce(fn, delay = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

let playlistsTabulator = null;
const plFilterEl = document.getElementById("plFilter");
plFilterEl.addEventListener(
  "input",
  debounce((e) => {
    setGlobalSearch(playlistsTabulator, e.target.value);
  }, 300) // 300ms debounce
);

async function renderPlaylists() {
  let table2StyleColumns = getTableColumns(true);
  let columns = [
    {
      title: "Type",
      field: "type",
      formatter: (cell) => {
        return cell.getValue() == "playlist" ? "PL" : "V";
      },
      cellClick: (e, cell) => {
        cell.getRow().treeToggle();
      },
    },
    {
      title: "Thumb",
      field: "thumbnailUrl",
      formatter: "image",
      formatterParams: {
        objectFit: "contain",
      },
      cellClick: async function (e, cell) {
        const item = cell.getRow().getData();
        if (item.type == "playlist") {
          const plVideoIds = cell.getRow().getData().videoIds;
          // Adding to the front one at a time, so go backwards
          for (let vid of [...plVideoIds].reverse()) {
            await moveVideoToFront(vid);
          }
        } else {
          moveVideoToFront(item.id);
        }
        await renderQueue();
        showToast("Added to front of queue");
      },
      hozAlign: "center",
      vertAlign: "center",
      width: COMPACT_THUMB_WIDTH,
    },
    {
      title: "Title",
      field: "title",
      // formatter: "textarea",
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
    table2StyleColumns.rating, // TODO: Convert playlist to use these style. For now just use this one.
    { title: "ID", field: "id", hozAlign: "left", width: 150 },
    {
      title: "",
      formatter: (cell) => {
        let data = cell.getRow().getData();
        return data.type == "playlist" ? "🗑️" : "❌";
      },
      cellClick: async (e, cell) => {
        let data = cell.getRow().getData();
        if (data.type == "playlist") {
          if (confirm(`Delete this playlist? ${data.title}`)) {
            await db.deletePlaylist(data.id);
            cell.getRow().delete();
          }
        } else {
          if (confirm(`Remove this video from playlist? ${data.title}`)) {
            let playlist = cell.getRow().getTreeParent().getData();
            playlist.videoIds = playlist.videoIds.filter(
              (vid) => vid !== data.id
            );
            cell.getRow().delete();
            await db.savePlaylists(playlist);
          }
        }
      },
      hozAlign: "center",
    },
  ];

  if (playlistsTabulator) {
    playlistsTabulator.replaceData(DBDATA.playlists);
    return;
  }

  playlistsTabulator = new Tabulator("#playlists-grid", {
    data: DBDATA.playlists,
    columns: columns,
    rowHeight: COMPACT_TABLE_HEIGHT,
    dataTree: true,
    height: "100%",
    width: "100%",
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

function handleTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const contents = document.querySelectorAll(".tab-content");

  buttons.forEach((btn) => {
    console.log("connect", btn.dataset.target);
    btn.addEventListener("click", () => {
      contents.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.dataset.target;
      const target = document.querySelector(`#${targetId}`);
      if (target) target.classList.add("active");
      sendMessage("broadcast", { type: "tab-button", targetId });
    });
  });
}
handleTabs();

function addComputedFieldsPL(playlist) {
  if (Array.isArray(playlist)) {
    return playlist.map((p) => addComputedFieldsPL(p));
  }
  return Object.defineProperties(playlist, {
    _children: {
      get() {
        return (playlist.videoIds || []).map((id) => {
          let video = DBDATA.queue.find((v) => v.id === id);
          return video;
        });
      },
      enumerable: false,
    },
    type: { value: "playlist", enumerable: false, writable: true },
    rating: { value: playlist.rating ?? DEFAULT_RATING, writable: true },
  });
}

function addComputedFieldsVideo(video) {
  if (Array.isArray(video)) {
    return video.map((p) => addComputedFieldsVideo(p));
  }
  return Object.defineProperties(video, {
    type: { value: "video", enumerable: false, writable: true },
    rating: { value: video.rating ?? DEFAULT_RATING, writable: true },
    title: { value: video.title ?? video.yt.snippet.title, writable: true },
    thumbnailUrl: {
      value: `https://i.ytimg.com/vi/${video.id}/default.jpg`,
      enumerable: false,
      writable: true,
    },
  });
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
  DBDATA.playlists = addComputedFieldsPL(DBDATA.playlists);
  DBDATA.queue = addComputedFieldsVideo(DBDATA.queue);
  renderDB(DBDATA.queue);
  renderPlaylists();
  // Remove errors and dups from graphs.
  // But leave in actual Queue (with low score), so we don't e.g. add it again
  DBDATA.filtered = DBDATA.queue.filter((v) => (v.errCnt ?? 0) < 3 && !v.dup);
  // calcStringSimilarity(DBDATA.queue);
  renderQueue();
})();
