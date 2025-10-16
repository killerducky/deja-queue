import * as db from "./db.js";
import * as utils from "./utils.js";

// Cross-browser shim
if (typeof browser === "undefined") {
  var browser = chrome; // var so it's global
}

let DBDATA = { queue: [], filtered: [] };
let DEFAULT_RATING = 7.5;

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
    const days = utils.rating2days(r);
    const totalTime = utils.formatDuration(counts[r] * 3, false); // hack: Send minutes not seconds
    const time = utils.formatDuration((counts[r] * 3) / days, false);
    return `${r.toFixed(1)}<br>${totalTime}/${days}d<br>${time}`;
  });
  const colors = xs.map((r) => utils.rating2color(r));
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
    const days = utils.rating2days(r);
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
    title: { text: "Interval Load" },
    xaxis: { title: { text: "Hours" } },
    yaxis: { showticklabels: false, fixedrange: true, range: [-0.5, 0.5] },
    margin: { t: 30, b: 60 },
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
      marker: { color: utils.rating2color(r) },
      xbins: { size: 2 },
    };
  });

  let layout = {
    title: "Scores Distribution",
    yaxis: { title: { text: "Count" } },
    xaxis: {
      title: { text: "Score" },
    },
    barmode: "stack",
  };
  layout = applyDarkMode(layout);
  Plotly.newPlot("scores-chart", traces, layout);
}

function plotDues(videos) {
  // Get unique ratings
  const ratings = [
    ...new Set(videos.map((v) => v.rating ?? DEFAULT_RATING)),
  ].sort((a, b) => a - b);

  // Create a trace for each rating
  const traces = ratings.map((r) => {
    const duesForRating = videos
      .filter((v) => (v.rating ?? DEFAULT_RATING) === r)
      .map((v) => -v.due);
    return {
      x: duesForRating,
      type: "histogram",
      name: `Rating ${r.toFixed(1)}`,
      marker: { color: utils.rating2color(r) },
      xbins: { size: 2 },
    };
  });

  let layout = {
    title: "(Over)Due Distribution",
    yaxis: { title: { text: "Count" } },
    xaxis: {
      title: { text: "(Over)Due days" },
      range: [-100, 30],
    },
    barmode: "stack",
  };
  layout = applyDarkMode(layout);
  Plotly.newPlot("dues-chart", traces, layout);
}

function interval2days(interval, T) {
  return (interval - 1) * T;
}
function days2interval(days, T) {
  return days / T + 1;
}
function generateXs(T) {
  let xs = [];
  for (let x_interval = 0; x_interval < 5; x_interval += 0.01) {
    xs.push(x_interval);
  }
  for (let x_days = -5; x_days < 5; x_days += 0.01) {
    xs.push(days2interval(x_days, T));
  }
  for (let x_days = 5; x_days < 365; x_days += 1) {
    xs.push(days2interval(x_days, T));
  }
  return [...new Set(xs)].sort((a, b) => a - b);
}
function plotCooldownFactor(videos, relative) {
  const ratings = [
    ...new Set(videos.map((v) => v.rating ?? DEFAULT_RATING)),
  ].sort((a, b) => a - b);

  const traces = [];
  for (let i = ratings.length - 1; i >= 0; i--) {
    let rating = ratings[i];
    let T = utils.rating2days(rating);
    let ys = [];
    let xs = generateXs(T);
    if (relative) {
      xs = xs.filter((interval) => interval > 0 && interval < 5);
    } else {
      xs = xs.filter((interval) => {
        let days = interval2days(interval, T);
        return days > -365 && days < 365 && interval > 0;
      });
    }

    xs.forEach((x) => {
      let daysSince = interval2days(x, T) + T;
      ys.push(utils.scoreHelper(daysSince, rating, false));
    });
    traces.push({
      x: relative ? xs : xs.map((interval) => interval2days(interval, T)),
      y: ys,
      mode: "lines",
      name: `Rating ${rating.toFixed(1)}`,
      line: { color: utils.rating2color(rating) },
      hovertemplate: relative ? "%{x:.2f}X" : "%{x:.2f} days",
    });
  }

  // Layout
  let layout = {
    title: "Function Test Graph",
    xaxis: {
      title: { text: relative ? "intervals" : "days" },
      range: relative ? [0, 2] : [-5, 5],
    },
    yaxis: { title: { text: "Cooldown penalty/bonus" }, range: [0, 100] },
    hovermode: "y unified",
    unifiedhovertemplate: "%{x:.2f}",
  };
  layout = applyDarkMode(layout);
  // Plot
  Plotly.newPlot(
    relative ? "cooldown-chart-rel" : "cooldown-chart",
    traces,
    layout
  );
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

// TODO: This is copy/pasted from options.js!!
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
      value: utils.calcDue(video),
      writable: true,
      enumerable: false,
    },
    score: {
      value: utils.scoreItem(video),
      writable: true,
      enumerable: false,
    },
    duration: {
      get() {
        if (video.scrapedDuration) {
          return video.scrapedDuration;
        } else {
          return utils.isoDuration2seconds(video.yt?.contentDetails?.duration);
        }
      },
      set(value) {
        video.scrapedDuration = value;
      }, // Why is tabultor doing this?
      enumerable: false,
    },
  });
}

// Initial load
(async () => {
  DBDATA.queue = await db.loadVideos();
  DBDATA.queue = addComputedFieldsVideo(DBDATA.queue);
  DBDATA.queue.sort((a, b) => b.score - a.score);
  DBDATA.playlists = await db.loadPlaylists();
  DBDATA.filtered = DBDATA.queue.filter((v) => (v.errCnt ?? 0) < 5 && !v.dup);
  plotRatings(DBDATA.filtered);
  plotScores(DBDATA.filtered);
  plotDues(DBDATA.filtered);
  plotCooldownFactor(DBDATA.filtered, false);
  plotCooldownFactor(DBDATA.filtered, true);
  db.closeDB();
  // calcStringSimilarity(DBDATA.queue);
  // renderQueue();
})();
