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
let RATING_FACTOR = 0.8; // 0 = all ratings same. 1 = 10 points per rating point
let DUP_SCORE = -9;
let ERR_SCORE = -10;

let COMPACT_TABLE_HEIGHT = 40;
let NORMAL_TABLE_HEIGHT = 68;
let COMPACT_THUMB_WIDTH = 60;
let NORMAL_THUMB_WIDTH = 90;
let TITLE_WIDTH = 120;
const DEFAULT_THUMB = "./favicon.ico";

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

function scoreItem(video, noise = true) {
  if (video.errCnt && video.errCnt >= 3) return ERR_SCORE; // too many errors, don't play
  if (video.dup) return DUP_SCORE; // Ignore dups
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
const skipBtn = document.getElementById("skip");
const delayBtn = document.getElementById("delay");
const pauseBtn = document.getElementById("pause");
const playBtn = document.getElementById("play");
const currentEl = document.getElementById("current");
const queueEl = document.getElementById("queue");
const logEl = document.getElementById("log");
const queueModeEl = document.getElementById("queueMode");
document.getElementById("graphs").addEventListener("click", () => {
  window.open("graphs.html");
});

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

function showToast(msg) {
  let duration = 5000;
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), duration);
}

let baseTabulatorOptions = {
  persistence: { columns: ["width", "visible", "frozen"] },
  persistenceWriterFunc: (id, type, data) => {
    window.electronAPI.set(`${id}`, data);
  },
  persistenceReaderFunc: (id, type) => {
    let data = window.electronAPI.get(`${id}`);
    return data;
  },
  movableColumns: true,
  columnDefaults: {
    headerHozAlign: "center",
    hozAlign: "center",
    vertAlign: "middle",
  },
};

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
    "current"
  );
  tabulatorQueue = await table2(tabulatorQueue, queueEl, restVideos, "queue");
  let log = await db.getLastNLogs(LISTLEN);
  let logVideoList = [];
  for (let entry of log) {
    let video = DBDATA.queue.find((v) => v.id === entry.id);
    logVideoList.push(video);
  }
  tabulatorLog = await table2(tabulatorLog, logEl, logVideoList, "log");
}

function thumbnailFormatter(cell) {
  const data = cell.getData();
  const item = cell.getRow().getData();
  const img = document.createElement("img");
  const candidateUrl =
    item.type == "playlist"
      ? item.thumbnailUrl
      : `https://i.ytimg.com/vi/${data.id}/default.jpg`;

  img.src = DEFAULT_THUMB;

  fetch(candidateUrl, { method: "HEAD" })
    .then((res) => {
      if (res.ok) {
        img.src = candidateUrl;
      } else {
        // console.log("thumb fail", item);
        img.src = DEFAULT_THUMB;
      }
    })
    .catch(() => {
      img.src = DEFAULT_THUMB;
    });

  return img;
}

async function tabulatorCellEdited(cell) {
  const item = cell.getData();
  if (item.type == "video") {
    await db.saveVideos(item);
  } else if (item.type == "playlist") {
    await db.savePlaylists(item);
  } else {
    console.log("error");
  }
}

function getTableColumns(tableType) {
  let tableColumns = {
    dataTree: {
      title: "",
      field: "type",
      formatter: () => {
        return "";
      },
      cellClick: (e, cell) => {
        let row = cell.getRow();
        if (row.getData().type == "video") {
          row = row.getTreeParent();
        }
        row && row.treeToggle();
      },
    },
    thumb: {
      title: "Thumb",
      field: "id_fake", // persistence requires unique fields
      // TODO: Need to work on this more, PL vs V etc
      formatter: thumbnailFormatter,
      width: COMPACT_THUMB_WIDTH,
      cellClick: async (e, cell) => {
        const row = cell.getRow();
        const firstRow = cell.getTable().getRows()[0];
        if (tableType == "current") {
          playNextVideo(0);
        } else if (tableType == "queue" && row == firstRow) {
          playNextVideo(1);
        } else {
          moveVideoToFront(cell.getRow().getData().id);
          await renderQueue();
          showToast("Added to front of queue");
        }
      },
      hozAlign: "center",
    },
    title: {
      title: "Title",
      field: "yt.snippet.title",
      formatter: "plaintext",
      tooltip: true,
      hozAlign: "left",
      width: TITLE_WIDTH,
    },
    tags: {
      title: "Tags",
      field: "tags",
      formatter: "textarea",
      editor: "input",
      width: 150,
      cellEdited: tabulatorCellEdited,
    },
    track: {
      title: "Trk",
      field: "_track",
      sorter: "number",
    },
    dur: {
      title: "Dur",
      field: "duration",
      formatter: (cell) => {
        return formatDuration(cell.getValue(), false);
      },
    },
    lastPlayed: {
      title: "Last Played",
      field: "lastPlayDate",
      formatter: (cell) => {
        return formatLastPlayDate(cell.getRow().getData());
      },
    },
    due: {
      title: "Due",
      field: "due",
      formatter: (cell) => {
        return formatDue(cell.getValue());
      },
      editable: false,
    },
    playCnt: {
      title: "Cnt",
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
    score: {
      title: "Score",
      field: "score",
      hozAlign: "center",
      formatter: (cell) => {
        return cell.getValue().toFixed(1);
      },
    },
    delay: {
      title: "Delay",
      field: "delay",
      hozAlign: "center",
      formatter: (cell) => {
        return cell.getValue() ? "✔" : "";
      },
    },
    errCnt: {
      title: "Err",
      field: "errCnt",
      hozAlign: "center",
      editor: "number",
      cellEdited: tabulatorCellEdited,
    },
    dup: {
      title: "Dup",
      field: "dup",
      hozAlign: "left",
      editor: "input",
      cellEdited: tabulatorCellEdited,
    },
    channel: {
      title: "Channel",
      field: "videoOwnerChannelTitle",
      hozAlign: "left",
      // headerFilter: "input",
      width: 150,
    },
    PL_channel: {
      title: "Channel",
      field: "channelTitle",
      // headerFilter: "input",
      width: 150,
    },
    dateAdded: {
      title: "Date Added",
      field: "dateAdded",
      formatter: (cell) => {
        const timestamp = cell.getValue();
        if (!timestamp) return "—";
        return date2String(new Date(timestamp));
      },
      hozAlign: "center",
    },
  };
  return tableColumns;
}

async function table2(tabulator, htmlEl, videoList, tableType) {
  if (tabulator) {
    const expandedIds = [];
    tabulator.getRows().forEach((row) => {
      if (row.getData().type == "playlist" && row.isTreeExpanded()) {
        expandedIds.push(row.getData().id);
      }
    });
    tabulator.replaceData(videoList).then(() => {
      tabulator.getRows().forEach((row) => {
        if (expandedIds.includes(row.getData().id)) {
          row.treeExpand();
        }
      });
    });
    return tabulator;
  }
  let tableColumns = getTableColumns(tableType);

  let columns = [
    tableColumns.dataTree,
    tableColumns.thumb,
    tableColumns.title,
    tableColumns.track,
    tableColumns.rating,
    tableColumns.interval,
    tableColumns.tags,
  ];
  columns.map((c) => (c.headerSort = false));

  tabulator = new Tabulator(htmlEl, {
    ...baseTabulatorOptions,
    data: videoList,
    custom: { tableType }, // custom property  TODO: Not needed anymore?
    columns: columns,
    dataTree: true,
    layout: "fitData",
    rowHeight: COMPACT_TABLE_HEIGHT,
  });
  tabulator.on("headerContext", (event) => {
    headerMenu(event, tabulator);
  });

  return tabulator;
}

function isoDuration2seconds(isoDuration) {
  if (!isoDuration) return NaN;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return NaN;
  let hours = parseInt(match[1] || "0", 10);
  let minutes = parseInt(match[2] || "0", 10);
  let seconds = parseInt(match[3] || "0", 10);
  return hours * 60 * 60 + minutes * 60 + seconds;
}
function formatDuration(duration, isoFormat = true) {
  let hours;
  let minutes;
  let seconds;
  if (isoFormat) {
    duration = isoDuration2seconds(duration);
  }
  if (!duration) {
    return "—";
  }
  hours = duration >= 3600 ? Math.floor(duration / 3600) : 0;
  minutes = Math.floor((duration % 3600) / 60);
  seconds = Math.floor(duration % 60);

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
  let daysSince =
    (Date.now() - new Date(video.lastPlayDate)) / (24 * 3600 * 1000);
  return `${daysSince.toFixed(1)} days ago`;
}
function formatDue(due) {
  // if (!video.lastPlayDate) {
  //   return "—";
  // }
  // due = -due;
  let color = due < -5 ? "#d11" : due < 0 ? "#e77" : "#6b6";
  let text = due < 0 ? "days ago" : "days from now";
  return `<span style="color:${color}">${Math.abs(due).toFixed(1)} ${text}</span>`;
}

async function addYoutubeInfo(video) {
  console.log("Fetching YouTube info for", video.id);
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${video.id}&key=${env.API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  // console.log(data);
  if (data.items?.length > 0) {
    video.yt = data.items[0];
    addComputedFieldsVideo(video);
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
      addComputedFieldsVideo(video);
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
  showToast(
    `Add playlist of ${playlist.videoIds.length} videos (${newVideos.length} new)`
  );

  playlist.videoCount = playlist.videoIds.length; // This seems more accurate
  addComputedFieldsPL(playlist);
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
      showToast("Video added");
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

skipBtn.addEventListener("click", async (e) => {
  await logEvent(DBDATA.queue[0], "skip");
  if (e.shiftKey) {
    playNextVideo(1, { skipWholeList: true });
  } else {
    playNextVideo();
  }
});
delayBtn.addEventListener("click", async (e) => {
  await logEvent(DBDATA.queue[0], "delay");
  if (e.shiftKey) {
    playNextVideo(1, { delayWholeList: true });
  } else {
    playNextVideo();
  }
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

async function playNextVideo(offset = 1, params = {}) {
  if (DBDATA.queue.length == 0) {
    console.log("Queue empty", offset);
    return;
  }
  offset = offset % DBDATA.queue.length; // deal with very small queues
  let nextVideoToPlay;
  let currItem = DBDATA.queue[offset];
  // console.log(offset);
  // console.log("before 0", DBDATA.queue[0]);
  // console.log("before 1", DBDATA.queue[1]);
  if (currItem.type == "playlist") {
    if (params.skipWholeList || params.delayWholeList) {
      currItem.lastPlayDate = Date.now();
      currItem.delay = !!params.delayWholeList;
      await db.savePlaylists(currItem);
      // Do not increment playCnt since we are skipping/delaying the list
      //currItem.playCnt += 1;
      playNextVideo(offset + 1);
      return;
    }
    // console.log("pnv playlist");
    // take the next video from top of _children array
    nextVideoToPlay = currItem._children[0];
    if (currItem._currentTrack == -1) {
      // Track *zero* is going to play, so the Queue will point to track *one*
      currItem._currentTrack = 1;
    } else {
      currItem._currentTrack += 1;
    }
    if (currItem._children.length == 0) {
      currItem.lastPlayDate = Date.now();
      currItem.playCnt = currItem.playCnt ?? 0 + 1;
      await db.savePlaylists(currItem);
      console.log("playlist empty, for now just delete");
      DBDATA.queue.splice(offset, 1);
    }
    // cut the first offset videos/playlists, put back to end of queue
    const cut = DBDATA.queue.splice(0, offset);
    DBDATA.queue.push(...cut);

    // put next playlist video on top
    DBDATA.queue.unshift(nextVideoToPlay);
  } else {
    // cut the first offset videos, and put back to end of queue
    const cut = DBDATA.queue.splice(0, offset);
    DBDATA.queue.push(...cut);
    if (DBDATA.queue[0] != currItem) {
      alert("oops");
      console.log(DBDATA.queue[0]);
      console.log(currItem);
    }
    nextVideoToPlay = DBDATA.queue[0];
  }
  // console.log("pnv", video);
  // // console.log("pnv", DBDATA.queue[offset]);
  // console.log("after 0", DBDATA.queue[0]);
  // console.log("after 1", DBDATA.queue[1]);

  let msg = { type: "playVideo", id: nextVideoToPlay.id };
  if (params?.autoplay == 0) {
    msg.type = "cueVideo";
  }
  sendMessage("youtube-message", msg);
  if (offset !== 0) {
    await renderQueue();
  }
  if (videoTimeout) clearTimeout(videoTimeout);
  videoTimeout = setTimeout(() => {
    console.log("Error:", nextVideoToPlay.id, nextVideoToPlay.title);
    console.log("Video did NOT start playing within timeout");
    showToast("Video timeout");
    nextVideoToPlay.errCnt = (nextVideoToPlay.errCnt || 0) + 1;
    db.saveVideos([nextVideoToPlay]);
    logEvent(nextVideoToPlay, "error");
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
  queue = queue.filter((item) => item.type != "playlist");
  let tableColumns = getTableColumns(true);
  let columns = [
    tableColumns.thumb,
    tableColumns.title,
    tableColumns.track,
    tableColumns.tags,
    tableColumns.dur,
    tableColumns.lastPlayed,
    tableColumns.due,
    tableColumns.playCnt,
    tableColumns.rating,
    tableColumns.interval,
    tableColumns.score,
    tableColumns.delay,
    tableColumns.errCnt,
    tableColumns.dup,
    tableColumns.channel,
  ];

  columns.map((c) => {
    c.headerWordWrap = false;
  });

  if (tabulatorDB) {
    tabulatorDB.replaceData(queue);
    return;
  }

  tabulatorDB = new Tabulator("#database-grid", {
    ...baseTabulatorOptions,
    data: queue,
    columns: columns,
    custom: { current: false }, // custom property
    height: "100%",
    width: "100%",
    rowHeight: COMPACT_TABLE_HEIGHT,
    movableColumns: true,
  });
  tabulatorDB.on("headerContext", (event) => {
    headerMenu(event, tabulatorDB);
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

function headerMenu(event, tables) {
  event.preventDefault();

  const menuItems = [];
  const columns = tables.getColumns();

  columns.forEach((column) => {
    const labelSpan = document.createElement("span");
    labelSpan.classList.add("tabulator");
    const updateLabel = () => {
      labelSpan.textContent =
        (column.isVisible() ? "☑ " : "☐ ") + column.getDefinition().title;
    };
    updateLabel();

    menuItems.push({
      label: labelSpan,
      action: function (event) {
        event.stopPropagation();
        column.toggle();
        updateLabel();
      },
    });
  });
  const renderMenu = () => {
    // Remove existing menu
    const existingMenu = document.querySelector("#tab-menu");
    if (existingMenu) existingMenu.remove();

    const menuDiv = document.createElement("div");
    menuDiv.id = "tab-menu";
    menuDiv.style.position = "absolute";
    menuDiv.style.top = event.pageY + "px";
    menuDiv.style.left = event.pageX + "px";

    menuItems.forEach((item) => {
      const itemDiv = document.createElement("div");
      itemDiv.appendChild(item.label);
      itemDiv.addEventListener("click", (ev) => {
        item.action(ev);
      });
      menuDiv.appendChild(itemDiv);
    });

    document.body.appendChild(menuDiv);

    const removeMenu = () => {
      menuDiv.remove();
      document.removeEventListener("click", removeMenu);
    };
    setTimeout(() => document.addEventListener("click", removeMenu), 0);
  };
  renderMenu();
}

function wrapVideo(video, track, playlist) {
  return new Proxy(
    { ref: video, _track: track, playlist },
    {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        return target.ref[prop];
      },
      set(target, prop, value, receiver) {
        if (prop in target) return Reflect.set(target, prop, value, receiver);
        target.ref[prop] = value;
        return true;
      },
    }
  );
}

async function renderPlaylists() {
  let table2StyleColumns = getTableColumns(true);
  let columns = [
    table2StyleColumns.dataTree,
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
          // make copy and clone videoIds because we will mutate it
          let playlistCopy = addComputedFieldsPL({ ...item });
          let insertIdx = 1;
          if (
            DBDATA.queue[insertIdx].type == "playlist" &&
            DBDATA.queue[insertIdx]._currentTrack !== -1
          ) {
            insertIdx = 2;
          }
          DBDATA.queue.splice(insertIdx, 0, playlistCopy);
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
    table2StyleColumns.title,
    table2StyleColumns.track,
    table2StyleColumns.tags,
    table2StyleColumns.dur,
    table2StyleColumns.lastPlayed,
    table2StyleColumns.playCnt,
    table2StyleColumns.PL_channel,
    table2StyleColumns.dateAdded,
    table2StyleColumns.rating,
    table2StyleColumns.interval,
    table2StyleColumns.score,
    // TODO: Add back ability to show the actual ID.
    // { title: "ID", field: "id_fake", hozAlign: "left", width: 20 },
    {
      title: "Act",
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
          const playlist = cell.getRow().getTreeParent().getData();
          const count = playlist.videoIds.filter((id) => id === data.id).length;
          if (count > 1) {
            if (confirm(`Remove dups of this video? ${data.title}`)) {
              let seen = false;
              playlist.videoIds = playlist.videoIds.filter((id) => {
                if (id !== data.id) return true; // keep other IDs
                if (!seen) {
                  seen = true; // keep the first occurrence
                  return true;
                }
                return false; // remove subsequent duplicates
              });
              seen = false;
              for (const siblingRow of cell
                .getRow()
                .getTreeParent()
                .getTreeChildren()) {
                let rowData = siblingRow.getData();
                if (rowData.id !== data.id) continue;
                if (!seen) {
                  seen = true;
                  continue;
                }
                siblingRow.delete();
              }
              await db.savePlaylists(playlist);
            }
          } else {
            if (confirm(`Remove this video from playlist? ${data.title}`)) {
              playlist.videoIds = playlist.videoIds.filter(
                (vid) => vid !== data.id
              );
              cell.getRow().delete();
              await db.savePlaylists(playlist);
            }
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
    ...baseTabulatorOptions,
    data: DBDATA.playlists,
    columns: columns,
    rowHeight: COMPACT_TABLE_HEIGHT,
    dataTree: true,
    dataTreeFilter: false,
    height: "100%",
    width: "100%",
  });
  playlistsTabulator.on("headerContext", (event) => {
    headerMenu(event, playlistsTabulator);
  });
}

async function moveVideoToFront(id) {
  const idx = DBDATA.queue.findIndex((v) => v.id === id);
  if (idx === -1) {
    console.log("Error could not find ", id);
    return;
  }
  if (idx == 0) {
    return; // Already playing
  }
  let insertIdx = 1;
  if (
    DBDATA.queue[insertIdx].type == "playlist" &&
    DBDATA.queue[insertIdx]._currentTrack !== -1
  ) {
    insertIdx = 2;
  }
  const [video] = DBDATA.queue.splice(idx, 1);
  DBDATA.queue.splice(insertIdx, 0, video);
}

function handleTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const contents = document.querySelectorAll(".tab-content");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      contents.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.dataset.target;
      const target = document.querySelector(`#${targetId}`);
      if (target) target.classList.add("active");
      sendMessage("broadcast", { type: "tab-button", targetId });
    });
  });
  const defaultTarget =
    queueModeEl.value === "playlist" ? "playlists" : "database";
  const btn = document.querySelector(`[data-target="${defaultTarget}"]`);
  btn.click();
}
handleTabs();

function addComputedFieldsPL(playlist) {
  if (Array.isArray(playlist)) {
    return playlist.map((p) => addComputedFieldsPL(p));
  }
  let allChildren = [];
  for (const [idx, id] of playlist.videoIds.entries()) {
    let origVideo = DBDATA.queue.find((v) => v.id === id);
    let video = wrapVideo(origVideo, idx, playlist);
    allChildren.push(video);
  }
  return Object.defineProperties(playlist, {
    _currentTrack: { value: -1, enumerable: false, writable: true },
    _allChildren: { value: allChildren, enumerable: false, writable: true },
    _children: {
      get() {
        const start = this._currentTrack == -1 ? 0 : this._currentTrack;
        return this._allChildren.slice(start);
      },
      enumerable: false,
    },
    _track: {
      value: playlist.videoIds.length,
      enumerable: false,
      writable: true,
    },
    type: { value: "playlist", enumerable: false, writable: true },
    rating: { value: playlist.rating ?? DEFAULT_RATING, writable: true },
    score: {
      value: scoreItem(playlist),
      writable: true,
      enumerable: false,
    },
    duration: {
      value: playlist.videoIds
        .map((id) => {
          const video = DBDATA.queue.find((v) => v.id === id);
          return video?.duration || 0;
        })
        .reduce((sum, dur) => sum + dur, 0),
      enumerable: false,
      writable: true,
    },
  });
}
function calcDue(video) {
  let daysSince = calcDaysSince(video);
  // video.rating normalization didn't complete yet?
  let days = rating2days(video.rating ?? DEFAULT_RATING) - daysSince;
  return days;
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
    channelTitle: {
      value: video.yt?.snippet?.videoOwnerChannelTitle || "—",
      writable: true,
      enumerable: true,
    },
    due: {
      value: calcDue(video),
      writable: true,
      enumerable: false,
    },
    score: {
      value: scoreItem(video),
      writable: true,
      enumerable: false,
    },
    duration: {
      get() {
        if (video.scrapedDuration) {
          return video.scrapedDuration;
        } else {
          return isoDuration2seconds(video.yt?.contentDetails?.duration);
        }
      },
      set(value) {
        video.scrapedDuration = value;
      }, // Why is tabultor doing this?
      enumerable: false,
    },
    // _track is overwritten by playlists
    // TODO: shallow copies to handle duplicates across playlists
    // _track: {
    //   value: video.yt.snippet.position,
    //   enumerable: false,
    //   writable: true,
    // },
  });
}

function dbCheck() {
  let error = false;
  DBDATA.queue.forEach((v) => {
    if (v.thumbnailUrl) {
      console.log("ERROR", v);
      error = true;
    }
  });
  if (error) {
    alert("DB integrity check fail. Check dev console.");
  }
}

// Initial load
(async () => {
  DBDATA.queue = await db.loadVideos();
  DBDATA.playlists = await db.loadPlaylists();
  // Check before adding computed fields
  dbCheck();
  DBDATA.queue = addComputedFieldsVideo(DBDATA.queue);
  DBDATA.queue.sort((a, b) => b.score - a.score);
  DBDATA.playlists = addComputedFieldsPL(DBDATA.playlists);
  DBDATA.playlists.sort((a, b) => b.score - a.score);
  if (queueModeEl.value == "playlist") {
    const playlistCopies = DBDATA.playlists.map((item) => {
      // shallow copy top-level + clone videoIds array
      const copy = { ...item };
      return addComputedFieldsPL(copy);
    });
    // Prepend all copies to the queue
    DBDATA.queue.unshift(...playlistCopies);
    let nextVideoToPlay = DBDATA.queue[0]._children[0];
    // Track *zero* is going to play, so the Queue will point to track *one*
    DBDATA.queue[0]._currentTrack = 1;
    DBDATA.queue.unshift(nextVideoToPlay);
  }
  renderDB(DBDATA.queue);
  renderPlaylists();
  // Remove errors and dups from graphs.
  // But leave in actual Queue (with low score), so we don't e.g. add it again
  DBDATA.filtered = DBDATA.queue.filter((v) => (v.errCnt ?? 0) < 3 && !v.dup);
  // calcStringSimilarity(DBDATA.queue);
  renderQueue();
  const navType = performance.getEntriesByType("navigation")[0]?.type;
  if (navType !== "reload") {
    playNextVideo(0, { autoplay: 0 });
  }
})();
