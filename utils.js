let DEFAULT_RATING = 7.5;
let MAX_ERRS = 5; // After this many errors treat it as bad

let DIVERSITY_FACTOR = 24;
let LONG_DELAY_START = 1.25;
let LONG_DELAY_TIME = 4;
let LONG_DELAY_BONUS = 2.5; // half a half a rating point per doubling
let INIT_FACTOR = 30;
let COOLDOWN_PENALTY = -60;
let COOLDOWN_JITTER_START = 3; // Subtract N days from the interval
let COOLDOWN_JITTER_RATE = 0.2; // Add up to X% jitter to that part of the interval
let RATING_FACTOR = 0.5; // 0 = all ratings same. 1 = 10 points per rating point
let DUP_SCORE = -9;
let ERR_SCORE = -10;

export function rating2color(rating) {
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

export function cooldownFactor(daysSince, rating, noise = true, salt = "salt") {
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
  let daysOverdue = daysSince - T * LONG_DELAY_START;
  if (ratio < 1) {
    const eased = Math.pow(ratio, 2);
    return COOLDOWN_PENALTY * (1 - eased);
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

// split out so we can test easier
export function scoreHelper(daysSince, rating, noise = true, salt = "salt") {
  let score = 0;
  // Mix rating and DEFAULT_RATING, and multiply by 10
  score += 10 * ((1 - RATING_FACTOR) * DEFAULT_RATING + RATING_FACTOR * rating);
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

export { isoDuration2seconds, formatDuration };
