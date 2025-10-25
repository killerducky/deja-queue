import * as db from "./db.js";
import * as utils from "./utils.js";

let DBDATA = { queue: [], filtered: [] };
let LISTLEN = 30;
let MAXLOGDUMP = 99999;
let DEFAULT_RATING = 7.5;
let MAX_ERRS = 5; // After this many errors treat it as bad

let COMPACT_TABLE_HEIGHT = 40;
let NORMAL_TABLE_HEIGHT = 68;
let COMPACT_THUMB_WIDTH = 60;
let NORMAL_THUMB_WIDTH = 90;
let TITLE_WIDTH = 120;
const DEFAULT_THUMB = "./favicon.ico";

let env = {};
async function loadEnv2() {
  env.youtube_api_key = window.electronAPI.get("youtube_api_key");
  if (env.youtube_api_key) {
    return;
  }

  sendMessage({ type: "hideYoutube" });
  document.addEventListener("click", async (e) => {
    const link = e.target.closest("a.external-link");
    if (!link) return;

    e.preventDefault();
    await window.electronAPI.openExternal(link.href);
  });

  const dialog = document.getElementById("add-api-key-dialog");
  const form = dialog.querySelector("form");
  const input = form.querySelector("input");

  dialog.showModal();
  // Make it harder to skip this, but not impossible?
  let dismissable = false;
  if (dismissable) {
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        dialog.close();
        sendMessage({ type: "showYoutube" });
      }
    });
  }
  form.addEventListener("submit", async (e) => {
    env.youtube_api_key = input.value.trim();
    if (env.youtube_api_key) {
      window.electronAPI.set("youtube_api_key", env.youtube_api_key);
    }
    sendMessage({ type: "showYoutube" });
  });
}
loadEnv2();

const fastForwardBtn = document.getElementById("fastForward");
const skipBtn = document.getElementById("skip");
const delayBtn = document.getElementById("delay");
const pauseBtn = document.getElementById("pause");
const playBtn = document.getElementById("play");
const currentEl = document.getElementById("current");
const queueEl = document.getElementById("queue");
const logEl = document.getElementById("log");
const queueModeEl = document.getElementById("queueMode");

queueModeEl.value = window.electronAPI.get("queueMode") || "Video";
queueModeEl.addEventListener("change", () => {
  window.electronAPI.set("queueMode", queueModeEl.value);
});

function handleDivider(divEl, vert) {
  let isDragging = false;
  const container = divEl.parentElement;

  divEl.addEventListener("mousedown", (e) => {
    isDragging = true;
    document.body.style.cursor = vert ? "row-resize" : "col-resize";
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const rect = container.getBoundingClientRect();
    let newSize = vert ? e.clientY - rect.top : e.clientX - rect.left;

    // Limit resizing range
    const minSize = 250;
    const maxSize = 1000;
    newSize = Math.min(Math.max(newSize, minSize), maxSize);
    container.style.setProperty(`--${divEl.id}-size`, `${newSize}px`);
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = "default";
    }
  });
}
document.querySelectorAll(".my-divider").forEach((divEl) => {
  const isVertical = divEl.classList.contains("vertical");
  handleDivider(divEl, isVertical);
});

function youtubeDiv() {
  return (
    document.querySelector(".active#youtube-full") ||
    document.getElementById("youtube")
  );
}

// Track the currently active div
let activeYoutubeDiv;

// Observe changes in class attributes
const observer = new MutationObserver((mutationsList) => {
  for (const mutation of mutationsList) {
    if (mutation.type !== "attributes" || mutation.attributeName !== "class") {
      continue;
    }
    const target = mutation.target;
    if (target.classList.contains("active") && target !== activeYoutubeDiv) {
      activeYoutubeDiv = youtubeDiv();
      // Start observing the new active div
      startResizeObserver(activeYoutubeDiv);
    }
  }
});

let resizeObserver = null;

function startResizeObserver(div) {
  // Disconnect previous observer
  if (resizeObserver) resizeObserver.disconnect();

  // Create a new ResizeObserver
  resizeObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
      const rect = entry.target.getBoundingClientRect();
      const bounds = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };

      // Send new size to main process
      electronAPI.sendBroadcast({
        type: "div-resize",
        bounds,
      });
    }
  });

  resizeObserver.observe(div);
}

// Observe all tab-content divs
// TODO: Should really be the youtube divs only
document.querySelectorAll(".tab-content").forEach((div) => {
  observer.observe(div, { attributes: true });
});

const themeLink = document.getElementById("tabulator-theme");

function updateTheme() {
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  themeLink.href = isDark
    ? "node_modules/tabulator-tables/dist/css/tabulator_site_dark.min.css"
    : "node_modules/tabulator-tables/dist/css/tabulator_site.min.css";
}

// Run on load
updateTheme();

// Listen for user preference changes
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", updateTheme);

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
  // reactiveData: true,
};

let tabulatorCurrent = null;
let tabulatorQueue = null;
let tabulatorLog = null;
async function renderQueue() {
  if (DBDATA.queue.length == 0) {
    console.log("Empty DBDATA.queue, nothing to render");
    return;
  }
  // const firstVideo = DBDATA.queue[0];
  // const restVideos = DBDATA.queue.slice(1, LISTLEN + 1);
  const restVideos = DBDATA.queue.slice(0, LISTLEN);
  // tabulatorCurrent = await table2(
  //   tabulatorCurrent,
  //   currentEl,
  //   [firstVideo],
  //   "current"
  // );

  function finalizePlaylist(playlist, playlistChildren) {
    if (playlist) {
      utils.addComputedFieldsPL(playlist, DBDATA.queue);
      playlist._allChildren = playlistChildren;
    }
    return { playlist: null, playlistChildren: [] };
  }

  tabulatorQueue = await table2(tabulatorQueue, queueEl, restVideos, "queue");
  let log = await db.getLastNLogs(LISTLEN);
  let logVideoList = [];
  let playlist = null;
  let playlistChildren = [];
  for (let entry of log) {
    let video = DBDATA.queue.find((v) => v.id === entry.id);
    if (entry.type == "playlist") {
      if (entry.playlistId !== playlist?.id) {
        ({ playlist, playlistChildren } = finalizePlaylist(
          playlist,
          playlistChildren
        ));
        // Make new playlist copy
        let origPlaylist = DBDATA.queue.find(
          (pl) => pl.id === entry.playlistId
        );
        playlist = utils.wrapItem(origPlaylist.ref, {
          _currentTrack: -1,
          videoIds: [],
        });
        logVideoList.push(playlist);
      }
      playlist.videoIds.push(entry.id);
      playlistChildren.push(
        utils.wrapItem(video, { entry, _track: entry._track })
      );
    } else {
      logVideoList.push(utils.wrapItem(video, { entry, track: entry.track }));
    }
  }
  ({ playlist, playlistChildren } = finalizePlaylist(
    playlist,
    playlistChildren
  ));
  tabulatorLog = await table2(tabulatorLog, logEl, logVideoList, "log");
}

function thumbnailFormatter(cell) {
  const data = cell.getData();
  const item = cell.getRow().getData();
  const img = document.createElement("img");
  const candidateUrl =
    item.type == "playlist"
      ? item.thumbnailUrl
      : `https://i.ytimg.com/vi/${data.foreignKey}/default.jpg`;

  // img.src = DEFAULT_THUMB;
  img.src = candidateUrl;
  img.onerror = (e) => {
    console.log("img error");
    console.log(cell.getData());
  };
  return img;
}

async function tabulatorCellEdited(cell) {
  const item = cell.getData();
  if (item.type == "video") {
    await saveVideos(item);
  } else if (item.type == "playlist") {
    await savePlaylists(item);
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
        const row0 = cell.getTable().getRows()[0];
        const row1 = cell.getTable().getRows()[1];
        if (tableType == "queue" && row == row0) {
          playNextVideo(0);
          // } else if (tableType == "queue" && row == row1) {
          //   This doesn't really work in playlist mode
          //    playNextVideo(1);
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
      formatter: (cell) => {
        let item = cell.getData();
        if (item.type == "playlist") {
          if (item._currentTrack == -1) {
            return item._track;
          } else {
            return `${item._currentTrack + 1}/${item._track}`;
          }
        } else {
          const dataTree = cell.getTable().options?.dataTree;
          const parent = dataTree && cell.getRow().getTreeParent();
          if (parent) {
            return item._track + 1;
          } else {
            return "";
          }
        }
      },
    },
    dur: {
      title: "Dur",
      field: "duration",
      formatter: (cell) => {
        return utils.formatDuration(cell.getValue(), false);
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
            await savePlaylists([item]);
          } else if (item.type == "video") {
            await saveVideos([item]);
          } else {
            alert(`unknown type ${item.type}`);
            console.log(item);
          }
          cell.getRow().reformat();
        }
      },
    },
    interval: {
      title: "Int",
      field: "interval",
      formatter: (cell) => {
        return cell.getValue() + "d";
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
    logType: {
      title: "Type",
      field: "entry.event",
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
    tableType == "log" ? tableColumns.logType : tableColumns.dataTree,
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
function formatLastPlayDate(video) {
  if (!video.lastPlayDate) {
    return "—";
  }
  let daysSince =
    (Date.now() - new Date(video.lastPlayDate)) / (24 * 3600 * 1000);
  return `${daysSince.toFixed(1)} days ago`;
}
function formatDue(due) {
  if (due === null) {
    return "—";
  }
  let color = due < -5 ? "#d11" : due < 0 ? "#e77" : "#6b6";
  let text = due < 0 ? "days ago" : "days from now";
  return `<span style="color:${color}">${Math.abs(due).toFixed(1)} ${text}</span>`;
}

async function addYoutubeInfo(video) {
  console.log("Fetching YouTube info for", video.foreignKey);
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${video.foreignKey}&key=${env.youtube_api_key}`;
  const response = await fetch(url);
  let data = await response.json();
  // console.log(data);
  if (data.items?.length > 0) {
    data = trimYoutubeFields(data);
    video.yt = data.items[0];
    utils.addComputedFieldsVideo(video);
    await saveVideos([video]);
  } else {
    console.log("Error fetching yt for: ", video.foreignKey);
  }
}

async function addPlaylistVideos(playlistId) {
  // First, fetch playlist metadata
  let playlistUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=${playlistId}&key=${env.youtube_api_key}`;
  let playlistRes = await fetch(playlistUrl);
  let playlistData = await playlistRes.json();
  // console.log("playlists raw:", playlistData);

  if (!playlistData.items || playlistData.items.length === 0) {
    console.error("Playlist not found:", playlistId);
    return;
  }

  let playlistInfo = playlistData.items[0];
  let playlist = await db.getPlaylist(playlistId);
  if (playlist) {
    console.log("Updating existing playlist", playlist);
    // If it already exists, clear videoIds, and only update a few yt info fields.
    // All other fields such as rating are kept as is
    playlist.videoIds = [];
    playlist.yt = playlistInfo;
    playlist.title = playlistInfo.snippet.title;
    playlist.channelTitle = playlistInfo.snippet.channelTitle;
    playlist.thumbnailUrl = playlistInfo.snippet.thumbnails?.default?.url;
  } else {
    console.log("New playlist");
    playlist = {
      id: db.uuidv4(),
      source: "youtube",
      foreignKey: playlistId,
      title: playlistInfo.snippet.title,
      channelTitle: playlistInfo.snippet.channelTitle,
      thumbnailUrl: playlistInfo.snippet.thumbnails?.default?.url,
      dateAdded: Date.now(),
      rating: DEFAULT_RATING,
      yt: playlistInfo,
      videoIds: [],
    };
  }

  // Now fetch all videos from the playlist
  let nextPageToken = "";
  let newVideos = [];
  let failsafeCnt = 0;
  let seenTokens = new Set();
  do {
    let url =
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails` +
      `&maxResults=50&pageToken=${nextPageToken}&playlistId=${playlistId}&key=${env.youtube_api_key}`;
    let res = await fetch(url);
    let data = await res.json();
    // console.log("playlistItems raw: ", data);
    data = trimYoutubeFields(data);

    for (const yt of data.items) {
      let id = yt.snippet.resourceId.videoId;
      if (playlist.videoIds.includes(id)) {
        continue; // skip dups
      }
      playlist.videoIds.push(id);
      if (!DBDATA.queue.find((v) => v.id === id)) {
        let video = {
          id: db.uuidv4(),
          source: "youtube",
          foreignKey: id,
          rating: DEFAULT_RATING,
          dateAdded: Date.now(),
          yt: yt,
        };
        video = trimYoutubeFields(video);
        utils.addComputedFieldsVideo(video);
        newVideos.push(video);
        DBDATA.queue.push(video);
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

  await saveVideos(newVideos);
  // console.log("addPlaylistVideos: newVideos ", newVideos);
  console.log(playlist);
  playlist.videoCount = playlist.videoIds.length;
  utils.addComputedFieldsPL(playlist, DBDATA.queue);
  console.log(playlist);
  console.log(
    `Add playlist of ${playlist.videoCount} videos (${newVideos.length} new)`
  );
  showToast(
    `Add playlist of ${playlist.videoCount} videos (${newVideos.length} new)`
  );

  // Replace or add in DBDATA.playlists
  let idx = DBDATA.playlists.findIndex((p) => p.id === playlist.id);
  if (idx !== -1) {
    DBDATA.playlists[idx] = playlist;
  } else {
    DBDATA.playlists.push(playlist);
  }
  await savePlaylists(playlist);

  // Replace or add in DBDATA.queue
  let copy = utils.wrapItem(playlist);
  copy = utils.addComputedFieldsPL(copy, DBDATA.queue);
  idx = DBDATA.queue.findIndex((p) => p.id === playlist.id);
  if (idx !== -1) {
    DBDATA.queue[idx] = playlist;
  } else {
    DBDATA.queue.push(playlist);
  }
  // Use this instead of unshift because it's not so simple
  await moveVideoToFront(copy.id);

  await rerenderAll();
}

async function addVideoOrPlaylist(response) {
  if (response.type == "video") {
    if (DBDATA.queue.find((v) => v.foreignKey === response.id)) {
      showToast("Video already in DB");
      await moveVideoToFront(response.id);
    } else {
      let video = {
        id: db.uuidv4(),
        source: "youtube",
        foreignKey: response.id,
        rating: DEFAULT_RATING,
        dateAdded: Date.now(),
      };
      await addYoutubeInfo(video);
      if (!video.yt) {
        showToast("Failed to fetch video info, please check the ID");
        return;
      }
      showToast("Video added");
      DBDATA.queue.splice(1, 0, video);
    }
  } else if (response.type == "playlist") {
    await addPlaylistVideos(response.id);
  } else {
    showToast("Error: could not parse input");
    return;
  }
  await rerenderAll();
}

const addDialog = document.getElementById("addDialog");
const addForm = document.getElementById("addForm");
const addInput = document.getElementById("videoInput");
const addBtn = document.getElementById("add");

addBtn.addEventListener("click", () => {
  addInput.value = "";
  addDialog.showModal();
});
addDialog.addEventListener("click", (e) => {
  if (e.target === addDialog) {
    addDialog.close();
  }
});
addForm.addEventListener("submit", async (e) => {
  const url = addInput.value.trim();
  const response = getVideoIdFromInput(url);
  if (response.id) {
    addVideoOrPlaylist(response);
  }
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
  sendMessage({ type: "pauseVideo" });
});
playBtn.addEventListener("click", async () => {
  sendMessage({ type: "resumeVideo" });
});
fastForwardBtn.addEventListener("click", async () => {
  sendMessage({ type: "fastForward" });
});

let videoTimeout;

function sendMessage(msg) {
  console.log("sendMessage: ", JSON.stringify(msg));
  window.electronAPI.sendBroadcast(msg);
}

async function pickNextVideoToPlay(offset, params = {}) {
  // console.log("pnv params:", params);
  let skip = params.skipWholeList || params.delayWholeList;
  if (offset != 0 && offset != 1) {
    console.log("ERROR");
  }
  // offset = 0 is for playing/cueing the current video.
  // That shouldn't happen together with skip.
  if (offset == 0 && skip) {
    console.log("ERROR");
  }

  let currItem = DBDATA.queue[0];
  let video = currItem.type == "playlist" ? currItem._children[0] : currItem;
  // The current playlist should at least be "active"
  // Even if we end up skipping/whatever later
  if (currItem.type == "playlist" && currItem._currentTrack == -1) {
    currItem._currentTrack = 0;
    // console.log("activate PL");
  }

  // If we want to play/cue the current video, just return the first video
  if (offset == 0) {
    // console.log("pnv easy", video);
    return video;
  }

  // If the first item is a playlist, and there are songs left, and we don't skip...
  if (currItem.type == "playlist" && currItem._children.length > 1 && !skip) {
    // console.log("increment playlist pointer");
    let video = currItem._children[1];
    if (!params.cueVideo) {
      currItem._currentTrack += 1;
      // console.log("next track:", currItem._currentTrack);
    }
    return video;
  }

  // By now we know we are done with the first item.
  // If it's a playlist, log completion/skip/delay, reset _currentTrack
  if (currItem.type == "playlist" && !params.cueVideo) {
    // console.log("playlist update");
    currItem.lastPlayDate = Date.now();
    currItem.delay = !!params.delayWholeList;
    if (!skip) {
      currItem.playCnt = (currItem.playCnt ?? 0) + 1;
    }
    currItem._currentTrack = -1;
    await savePlaylists(currItem);
  }

  // Pick the next item in the queue
  currItem = DBDATA.queue[1];
  video = currItem.type == "playlist" ? currItem._children[0] : currItem;
  // And set it active if it's a playlist
  if (currItem.type == "playlist" && currItem._currentTrack == -1) {
    currItem._currentTrack = 0;
  }

  if (!params.cueVideo) {
    // Move current item to back of queue
    // console.log("Rotate queue");
    let rotatedItem = DBDATA.queue.shift();
    DBDATA.queue.push(rotatedItem);
    if (rotatedItem.type == "playlist") {
      rotatedItem._currentTrack = 0;
    }
  }
  return video;
}

async function cueNextVideo(offset = 1, params = {}) {
  params.cueVideo = true;
  console.log("ct:", DBDATA.queue[0]._currentTrack);
  let nextVideoToPlay = await pickNextVideoToPlay(offset, params);
  console.log("ct:", DBDATA.queue[0]._currentTrack);
  console.log("cnv", nextVideoToPlay);

  let msg = {
    type: "backgroundCueVideo",
    source: nextVideoToPlay.source,
    id: nextVideoToPlay.foreignKey,
  };
  sendMessage(msg);
}

async function playNextVideo(offset = 1, params = {}) {
  if (DBDATA.queue.length == 0) {
    console.log("Queue empty", offset);
    return;
  }
  offset = offset % DBDATA.queue.length; // deal with very small queues

  // console.log("ct:", DBDATA.queue[0]._currentTrack);
  let nextVideoToPlay = await pickNextVideoToPlay(offset, params);
  // console.log("ct:", DBDATA.queue[0]._currentTrack);

  if (videoTimeout) clearTimeout(videoTimeout);
  videoTimeout = setTimeout(() => {
    console.log("Error:", nextVideoToPlay.id, nextVideoToPlay.title);
    sendMessage({
      type: "error",
      info: `timeout ${nextVideoToPlay.id} ${nextVideoToPlay.title}`,
    });
    showToast("Video timeout");
    nextVideoToPlay.errCnt = (nextVideoToPlay.errCnt || 0) + 1;
    saveVideos([nextVideoToPlay]);
    logEvent(nextVideoToPlay, "error");
    playNextVideo();
  }, 150000000); // 15s -- see if this works
  let msg = {
    type: params?.cueVideo ? "cueVideo" : "playVideo",
    soruce: nextVideoToPlay.source,
    id: nextVideoToPlay.foreignKey,
  };
  sendMessage(msg);
  if (offset !== 0) {
    await renderQueue();
  }
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

async function logEvent(item, event) {
  let now = Date.now();
  let video = item.type == "playlist" ? item._children[0] : item;
  video.lastPlayDate = now; // includes errors and skips
  video.delay = event === "delay";
  if (event == "play") {
    video.playCnt = (video.playCnt ?? 0) + 1;
  }
  if (video.playCnt == 1) {
    video.firstPlayDate = now;
  }
  await saveVideos([video]);
  const logEntry = {
    type: item.type,
    id: video.id,
    source: video.source,
    foreignKey: video.foreignKey,
    timestamp: now,
    event: event,
    ...(item.type == "playlist" && {
      playlistId: item.id,
      _track: video._track,
    }),
  };
  await db.saveLog([logEntry]);
}

let lastEndedVideoId = null;

window.electronAPI.onBroadcast(async (msg) => {
  let currItem = DBDATA.queue[0];
  let currVideo =
    currItem?.type == "playlist" ? currItem._children[0] : currItem;
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
      await saveVideos([currVideo]);
    }
  } else if (msg?.type === "videoEnded") {
    if (lastEndedVideoId === videoId) {
      return;
    }
    lastEndedVideoId = videoId;
    if (videoId && currVideo && videoId === currVideo.id) {
      await logEvent(currItem, "play");
    }
    playNextVideo();
  } else if (msg.type === "queue:addVideo") {
    addVideoOrPlaylist({ type: "video", id: msg.id });
  } else if (msg.type === "queue:addPlaylist") {
    addVideoOrPlaylist({ type: "playlist", id: msg.id });
  } else if (msg.type === "deleteDatabaseRequest") {
    deleteDB();
  } else if (msg.type === "importDatabase") {
    importDB(msg.filePath);
  } else if (msg.type === "exportDatabase") {
    exportDB();
  } else if (msg.type === "videoCueNext") {
    cueNextVideo();
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

async function importDB(file) {
  console.log("Importing DB from file:", file);
  const text = await window.electronAPI.readFile(file);
  const data = JSON.parse(text);
  await db.deleteDB();
  await saveVideos(data.videos); // only replaces each id with new content
  await savePlaylists(data.playlists); // only replaces each id with new content
  await db.saveLog(data.log);
  console.log("Videos imported successfully");
}

async function deleteDB() {
  const confirmed = window.confirm(
    "Are you sure you want to delete the database? This cannot be undone."
  );
  if (!confirmed) return; // user cancelled
  await db.deleteDB();
  alert("Database deleted. Please reload the page.");
}

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

async function renderDB(queue) {
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
        moveVideoToFront(item.id);
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
    table2StyleColumns.due,
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
      field: "act", // fake field
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
              await savePlaylists(playlist);
            }
          } else {
            if (confirm(`Remove this video from playlist? ${data.title}`)) {
              playlist.videoIds = playlist.videoIds.filter(
                (vid) => vid !== data.id
              );
              cell.getRow().delete();
              await savePlaylists(playlist);
            }
          }
        }
      },
      hozAlign: "center",
    },
  ];

  if (playlistsTabulator) {
    const expandedIds = [];
    playlistsTabulator.getData().forEach((data) => {
      const row = playlistsTabulator.getRow(data.id);
      if (row && row.isTreeExpanded()) {
        expandedIds.push(data.id);
      }
    });
    playlistsTabulator.replaceData(DBDATA.playlists).then(() => {
      expandedIds.forEach((id) => {
        const row = playlistsTabulator.getRow(id);
        if (row) row.treeExpand();
      });
    });
    return playlistsTabulator;
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
  if (idx == 0 || idx == 1) {
    return; // Already playing or next in line
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
      target.classList.add("active");
      if (targetId !== "youtube-full") {
        document.querySelector("#youtube").classList.add("active");
      }
      sendMessage({ type: "tab-button", targetId });
    });
  });
  const btn = document.querySelector(`[data-target="youtube-full"]`);
  btn.click();
}
handleTabs();

function trimYoutubeFields(obj) {
  if (Array.isArray(obj)) {
    return obj.map(trimYoutubeFields);
  } else if (obj && typeof obj === "object") {
    const newObj = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "description" || key === "regionRestriction") {
        continue; // skip all "description" fields
      }
      // Thumbnails: keep only "default"
      if (key === "thumbnails" && value && typeof value === "object") {
        if (value.default) {
          newObj[key] = { default: trimYoutubeFields(value.default) };
        }
        continue; // skip other keys
      }
      newObj[key] = trimYoutubeFields(value);
    }
    return newObj;
  }
  return obj;
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

async function updateTabulator(tabulator, items) {
  if (!tabulator) {
    return;
  }
  function walk(rows) {
    for (const row of rows) {
      let data = row.getData();
      let item = items.find((item) => item.id == data.id);
      if (item) {
        row.reformat();
      }
      const children = row.getTreeChildren?.();
      if (children?.length) {
        walk(children);
      }
    }
  }
  walk(tabulator.getRows());
}

async function rerenderAll(items = []) {
  if (items.length > 0) {
    await updateTabulator(playlistsTabulator, items);
    await updateTabulator(tabulatorQueue, items);
    await updateTabulator(tabulatorDB, items);
    return;
  }
  if (playlistsTabulator) {
    await renderPlaylists();
  }
  if (tabulatorQueue) {
    await renderQueue();
  }
  if (tabulatorDB) {
    await renderDB(DBDATA.queue);
  }
}

async function saveVideos(videos) {
  videos = Array.isArray(videos) ? videos : [videos];
  await db.saveVideos(videos);
  await rerenderAll(videos);
}

async function savePlaylists(playlists) {
  playlists = Array.isArray(playlists) ? playlists : [playlists];
  await db.savePlaylists(playlists);
  await rerenderAll(playlists);
}

// Initial load
(async () => {
  DBDATA.queue = await db.loadVideos();
  DBDATA.playlists = await db.loadPlaylists();
  dbCheck();
  DBDATA.queue = trimYoutubeFields(DBDATA.queue);
  DBDATA.playlists = trimYoutubeFields(DBDATA.playlists);
  DBDATA.queue = utils.addComputedFieldsVideo(DBDATA.queue);
  DBDATA.queue.sort((a, b) => b.score - a.score);
  DBDATA.playlists = utils.addComputedFieldsPL(DBDATA.playlists, DBDATA.queue);
  DBDATA.playlists.sort((a, b) => b.score - a.score);
  const playlistCopies = DBDATA.playlists.map((item) => {
    const copy = utils.wrapItem(item);
    // copy.playlistRef = item;
    return utils.addComputedFieldsPL(copy, DBDATA.queue);
  });
  if (queueModeEl.value == "playlist") {
    DBDATA.queue.unshift(...playlistCopies);
  } else {
    DBDATA.queue.push(...playlistCopies);
  }
  renderDB(DBDATA.queue);
  renderPlaylists();
  renderQueue();
  const navType = performance.getEntriesByType("navigation")[0]?.type;
  if (navType !== "reload") {
    playNextVideo(0, { cueVideo: true });
  }
})();
