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

function plotRatings(type, items) {
  const ratings = items.map((v) => v.rating || DEFAULT_RATING);

  // Count how many videos for each rating
  const counts = {};
  const durations = {};
  ratings.forEach((r) => {
    durations[r] = items.reduce(
      (sum, item) =>
        sum +
        (item.rating === r
          ? isNaN(item.duration)
            ? 60 * 3
            : item.duration
          : 0),
      0
    );
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
    const totalTime = durations[r] / 60 / 60;
    const time = durations[r] / 60 / 60 / days;
    return `${r.toFixed(1)} ${utils.rating2days(r)}d<br>${totalTime.toFixed(1)}h/${days}d<br>${time.toFixed(1)}h`;
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
  Plotly.newPlot(`${type}-ratings-chart`, [trace], layout);

  // --- Plot 2: stacked horizontal bar ---
  let loads = xs.map((r) => {
    const days = utils.rating2days(r);
    const load = durations[r] / 60 / 60 / days;
    return load;
  });

  const xsRev = [...xs].reverse();
  // const ysRev = [...ys].reverse();
  const colorsRev = [...colors].reverse();
  const loadsRev = [...loads].reverse();

  const traces2 = xsRev.map((r, i) => ({
    name: `Rating ${r.toFixed(1)} ${utils.rating2days(r)}d`,
    type: "bar",
    y: [loadsRev[i]], // height of this segment
    x: ["Ratings"], // single category
    marker: { color: colorsRev[i] },
    hovertemplate: `Rating ${r.toFixed(1)}<br>Hours/day: ${loadsRev[i].toFixed(
      1
    )}<extra></extra>`,
  }));

  let layout2 = {
    barmode: "stack",
    title: { text: "Interval Load" },
    yaxis: { title: { text: "Hours" } },
    xaxis: { showticklabels: false, fixedrange: true, range: [-0.5, 0.5] },
    margin: { t: 30, b: 60 },
  };

  layout2 = applyDarkMode(layout2);

  Plotly.newPlot(`${type}-interval-chart`, traces2, layout2);
}

function plotScores(type, items) {
  // Get unique ratings
  const ratings = [
    ...new Set(items.map((v) => v.rating ?? DEFAULT_RATING)),
  ].sort((a, b) => a - b);

  // Create a trace for each rating
  const traces = ratings.map((r) => {
    const scoresForRating = items
      .filter((v) => (v.rating ?? DEFAULT_RATING) === r)
      .map((v) => v.score);
    return {
      x: scoresForRating,
      type: "histogram",
      name: `Rating ${r.toFixed(1)} ${utils.rating2days(r)}d`,
      marker: { color: utils.rating2color(r) },
      xbins: { size: 2 },
    };
  });

  let layout = {
    title: { text: "Scores Distribution" },
    yaxis: { title: { text: "Count" } },
    xaxis: {
      title: { text: "Score" },
    },
    barmode: "stack",
  };
  layout = applyDarkMode(layout);
  Plotly.newPlot(`${type}-scores-chart`, traces, layout);
}

function plotDues(type, absolute, items) {
  // Get unique ratings
  const ratings = [
    ...new Set(items.map((v) => v.rating ?? DEFAULT_RATING)),
  ].sort((a, b) => a - b);

  // Create a trace for each rating
  const traces = ratings.map((r) => {
    const duesForRating = items
      .filter((v) => (v.rating ?? DEFAULT_RATING) === r)
      .map((v) => (absolute ? v.due : v.due / v.interval));
    return {
      x: duesForRating,
      type: "histogram",
      name: `Rating ${r.toFixed(1)} ${utils.rating2days(r)}d`,
      marker: { color: utils.rating2color(r) },
      xbins: { size: absolute ? 1 : 0.05 },
    };
  });

  let layout = {
    title: { text: "(Over)Due Distribution" },
    yaxis: { title: { text: "Count" } },
    xaxis: {
      title: { text: absolute ? "(Over)Due days" : "(Over)Due intervals" },
      range: absolute ? [-20.5, 40.5] : [-1.1, 1.1],
    },
    barmode: "stack",
  };
  layout = applyDarkMode(layout);
  Plotly.newPlot(
    `${type}-${absolute ? "abs" : "int"}-dues-chart`,
    traces,
    layout
  );
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
function plotCooldownFactor(relative) {
  let ratings = [5.5, 6, 6.5, 7, 7.5, 8, 8.5];

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
      text: xs.map((interval, i) => {
        let days = interval2days(interval, T);
        // let score = ys[i];
        // ${score.toFixed(1)}
        return (
          `<span style="font-family:monospace; font-size:1.5em">` +
          `${rating.toFixed(1)} (${T.toFixed(0).padStart(3)}d) ${days.toFixed(2).padStart(6)}d ${interval.toFixed(2).padStart(4)}X</span>`
        );
      }),
      hoverinfo: "text",
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

// Initial load
(async () => {
  DBDATA.queue = await db.loadVideos();
  DBDATA.queue = utils.addComputedFieldsVideo(DBDATA.queue);
  DBDATA.queue.sort((a, b) => b.score - a.score);
  DBDATA.playlists = await db.loadPlaylists();
  DBDATA.playlists = utils.addComputedFieldsPL(DBDATA.playlists, DBDATA.queue);
  DBDATA.filtered = DBDATA.queue.filter((v) => (v.errCnt ?? 0) < 5 && !v.dup);
  plotRatings("videos", DBDATA.filtered);
  plotScores("videos", DBDATA.filtered);
  plotDues("videos", true, DBDATA.filtered);
  plotDues("videos", false, DBDATA.filtered);
  plotRatings("playlists", DBDATA.playlists);
  plotScores("playlists", DBDATA.playlists);
  plotDues("playlists", true, DBDATA.playlists);
  plotDues("playlists", false, DBDATA.playlists);
  plotCooldownFactor(false);
  plotCooldownFactor(true);
  db.closeDB();
  // calcStringSimilarity(DBDATA.queue);
  // renderQueue();
})();
