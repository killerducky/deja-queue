import * as db from "./db.js";

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

let COMPACT_TABLE_HEIGHT = 40;
let NORMAL_TABLE_HEIGHT = 68;

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

function applyDarkMode(layout) {
  const darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;

  if (!darkMode) return layout; // leave as-is if not dark mode

  // Merge dark mode properties without overwriting existing layout completely
  return {
    ...layout,
    paper_bgcolor: "#1e1e1e",
    plot_bgcolor: "#1e1e1e",
    font: { ...layout.font, color: "#eee" },
    xaxis: {
      ...(layout.xaxis || {}),
      gridcolor: "#444",
      zerolinecolor: "#666",
      tickcolor: "#eee",
      titlefont: { color: "#eee", ...(layout.xaxis?.titlefont || {}) },
    },
    yaxis: {
      ...(layout.yaxis || {}),
      gridcolor: "#444",
      zerolinecolor: "#666",
      tickcolor: "#eee",
      titlefont: { color: "#eee", ...(layout.yaxis?.titlefont || {}) },
    },
  };
}

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

  let layout = {
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
  layout = applyDarkMode(layout);
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

  let layout2 = {
    barmode: "stack",
    title: "Ratings Breakdown",
    xaxis: { title: "Count" },
    yaxis: { showticklabels: false, fixedrange: true, range: [-0.5, 0.5] },
    margin: { t: 15, b: 30 },
  };

  layout2 = applyDarkMode(layout2);

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

  let layout = {
    title: "Scores Distribution",
    xaxis: { title: "Score" },
    yaxis: { title: "Count" },
    barmode: "stack",
  };
  layout = applyDarkMode(layout);
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
  let layout = {
    title: "Function Test Graph",
    xaxis: { title: { text: "days" }, range: [-5, 150] },
    yaxis: { title: { text: "Cooldown penalty/bonus" } },
  };
  layout = applyDarkMode(layout);
  // Plot
  Plotly.newPlot("cooldown-chart", traces, layout);
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

// Initial load
(async () => {
  DBDATA.queue = await db.loadVideos();
  DBDATA.queue.forEach((v) => {
    v.score = scoreVideo(v);
  });
  DBDATA.queue.sort((a, b) => b.score - a.score);
  DBDATA.playlists = await db.loadPlaylists();
  // renderDB(DBDATA.queue);
  // renderPlaylists();
  // Remove errors and dups from graphs.
  // But leave in actual Queue (with low score), so we don't e.g. add it again
  DBDATA.filtered = DBDATA.queue.filter((v) => (v.errCnt ?? 0) < 3 && !v.dup);
  plotRatings(DBDATA.filtered);
  plotScores(DBDATA.filtered);
  plotCooldownFactor(DBDATA.filtered);
  // calcStringSimilarity(DBDATA.queue);
  // renderQueue();
})();
