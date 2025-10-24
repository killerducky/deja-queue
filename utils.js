let DEFAULT_RATING = 7.5;
let MAX_ERRS = 5; // After this many errors treat it as bad

let DIVERSITY_FACTOR = 15;
let SHORT_DELAY_LINEAR_RATE = 0; // Skip the linear part
let LONG_DELAY_START = 0; //
let LONG_DELAY_BONUS = 5; // Add 5
let LONG_DELAY_TIME = 1; // every 1X intervals
let INIT_FACTOR = 30;
let COOLDOWN_JITTER_START = 3; // Subtract N days from the interval
let COOLDOWN_JITTER_RATE = 0.0; // (0X = disable for now) Add up to X% jitter to that part of the interval
let COOLDOWN_FLOOR = 0.0; // Go all the way to 0 for just played songs
let COOLDOWN_POWER_FACTOR = 5; // 1 = linear, higher power = sharper curve
let RATING_FACTOR = 0.0; // 0 = all ratings same. 1 = 10 points per rating point
let DUP_SCORE = -8;
let ERR_SCORE = -9;
let DEFAULT_VID_LENGTH = 3 * 60;

export function rating2color(rating) {
  const colors2 = [
    "hsla(342, 100%, 20%, 1.00)",
    "hsla(353, 76%, 40%, 1.00)",
    "hsla(8, 63%, 57%, 1.00)",
    "hsla(18, 84%, 68%, 1.00)",
    // "hsla(32, 60%, 68%, 1.00)",
    // "hsla(0, 0%, 65%, 1.00)",
    "hsla(180, 50%, 70%, 1.00)",
    "hsla(185, 63%, 60%, 1.00)",
    "hsla(190, 66%, 47%, 1.00)",
    "hsla(195, 70%, 36%, 1.00)",
    "hsla(205, 73%, 30%, 1.00)",
  ];
  const colors = [
    "hsla(342, 100%, 20%, 1.00)",
    "hsla(353, 76%, 40%, 1.00)",
    "hsla(8, 63%, 57%, 1.00)",
    "hsla(18, 84%, 68%, 1.00)",
    // "hsla(32, 60%, 68%, 1.00)",
    // "hsla(0, 0%, 65%, 1.00)",
    "hsla(180, 50%, 70%, 1.00)",
    "hsla(185, 63%, 60%, 1.00)",
    "hsla(190, 66%, 47%, 1.00)",
    "hsla(195, 70%, 36%, 1.00)",
    "hsla(205, 73%, 30%, 1.00)",
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

export function rating2days(rating) {
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

export function ratingScore(rating) {
  return 10 * ((1 - RATING_FACTOR) * DEFAULT_RATING + RATING_FACTOR * rating);
}

export function cooldownFactor(daysSince, rating, noise = true, salt = "salt") {
  if (daysSince == null) {
    return INIT_FACTOR;
  }
  let T = rating2days(rating);
  let jitter = 0;
  if (noise) {
    // T1 is the interval (T) reduced by COOLDOWN_JITTER_START days
    let T1 = T - COOLDOWN_JITTER_START;
    if (T1 > 0) {
      // If after subtracting there is more left, apply random jitter to that part of it
      jitter = T1 * hashRandom(`${salt}cooldownJitter`) * COOLDOWN_JITTER_RATE;
    }
  }
  // And subtract jitter days, but don't allow jitter to reduce daysSince below 0
  // Subtracting days from daysSince makes the video not become due as quickly.
  daysSince = Math.max(0, daysSince - jitter);
  let ratio = daysSince / T;
  let longDelayStartDay = T + LONG_DELAY_START;
  let daysOverdue = daysSince - T;
  if (ratio < 1) {
    const eased = Math.pow(ratio, COOLDOWN_POWER_FACTOR);
    return -(1 - COOLDOWN_FLOOR) * ratingScore(rating) * (1 - eased);
  } else if (daysSince < longDelayStartDay) {
    return SHORT_DELAY_LINEAR_RATE * (daysOverdue / (longDelayStartDay - T));
  } else {
    // 7 days overdue:  +1LONG_DELAY_BONUS
    // 14 days overdue: +2LONG_DELAY_BONUS
    // 28 days overdue: +3LONG_DELAY_BONUS
    // 56 days overdue: +4LONG_DELAY_BONUS
    // 365 days overdue: +14 = 5.6x LONG_DELAY_BONUS
    let log2 =
      Math.log1p((daysSince - longDelayStartDay) / (T * LONG_DELAY_TIME)) /
      Math.log(2);
    return SHORT_DELAY_LINEAR_RATE + log2 * LONG_DELAY_BONUS;
  }
}

// split out so we can test easier
export function scoreHelper(daysSince, rating, noise = true, salt = "salt") {
  let score = 0;
  // Mix rating and DEFAULT_RATING, and multiply by 10
  score += ratingScore(rating);
  score += cooldownFactor(daysSince, rating, noise);
  score += !noise ? 0 : hashRandom(`${salt}noise`) * DIVERSITY_FACTOR;
  return score;
}

export function calcDaysSince(video) {
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

export function scoreItem(video, noise = true) {
  if (video.errCnt && video.errCnt >= MAX_ERRS) return ERR_SCORE; // too many errors, don't play
  if (video.dup) return DUP_SCORE; // Ignore dups
  let salt = `${video.id}${video.lastPlayDate}`;
  if (!video.rating) video.rating = DEFAULT_RATING;
  let daysSince = calcDaysSince(video);
  let score = scoreHelper(daysSince, video.rating, noise, salt);
  return score;
}

export function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function fnv1a32(str) {
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
export function hashRandom(str) {
  return fnv1a32(str) / 0xffffffff;
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

function calcDue(video) {
  let daysSince = calcDaysSince(video);
  if (daysSince === null) {
    return null;
  }
  let days = rating2days(video.rating ?? DEFAULT_RATING) - daysSince;
  return days;
}
function addComputedFieldsPL(playlist, queue) {
  if (Array.isArray(playlist)) {
    return playlist.map((p) => addComputedFieldsPL(p, queue));
  }
  let allChildren = [];
  for (const [idx, id] of playlist.videoIds.entries()) {
    let origVideo = queue.find((v) => v.id === id);
    let video = wrapItem(origVideo, { _track: idx, playlist });
    allChildren.push(video);
  }
  if (!playlist.thumbnailUrl) {
    console.log("Warning: no PL URL for", playlist.title);
    playlist.thumbnailUrl = allChildren[0].yt.snippet.thumbnails.default.url;
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
    // rating: { value: playlist.rating ?? DEFAULT_RATING, writable: true },
    score: {
      value: scoreItem(playlist),
      writable: true,
      enumerable: false,
    },
    due: {
      value: calcDue(playlist),
      writable: true,
      enumerable: false,
    },
    interval: {
      get() {
        return rating2days(playlist.rating);
      },
      set() {}, // Ignore -- keep tabulator happy
      enumerable: false,
    },
    duration: {
      value: playlist.videoIds
        .map((id) => {
          const video = queue.find((v) => v.id === id);
          return video?.duration || DEFAULT_VID_LENGTH;
        })
        .reduce((sum, dur) => sum + dur, 0),
      enumerable: false,
      writable: true,
    },
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
    interval: {
      get() {
        return rating2days(video.rating);
      },
      set() {}, // Ignore -- keep tabulator happy
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
  });
}

function wrapItem(video, extras = {}) {
  if (video.ref) {
    console.log("ERROR: Already wrapped?");
  }
  return new Proxy(
    { ref: video, ...extras },
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

export {
  isoDuration2seconds,
  formatDuration,
  calcDue,
  wrapItem,
  addComputedFieldsVideo,
  addComputedFieldsPL,
};
