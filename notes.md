```js
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
```

```js
const theaterButton = document.querySelector(".ytp-size-button");
if (theaterButton) {
  // If the button is found, simulate a click
  theaterButton.click();
  console.log("Toggled YouTube theater mode.");
} else {
  console.log("Theater mode button not found.");
}
```

```html
<button
  class="ytp-size-button ytp-button"
  title=""
  aria-keyshortcuts="t"
  data-priority="9"
  data-tooltip-title="Theater mode (t)"
  data-title-no-tooltip="Theater mode"
  aria-label="Theater mode (t)"
>
  <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
    <use class="ytp-svg-shadow" xlink:href="#ytp-id-29"></use>
    <path
      d="m 28,11 0,14 -20,0 0,-14 z m -18,2 16,0 0,10 -16,0 0,-10 z"
      fill="#fff"
      fill-rule="evenodd"
      id="ytp-id-29"
    ></path>
  </svg>
</button>
<button
  class="ytp-size-button ytp-button"
  title=""
  aria-keyshortcuts="t"
  data-priority="9"
  data-title-no-tooltip="Default view"
  aria-label="Default view keyboard shortcut t"
  data-tooltip-title="Default view (t)"
>
  <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
    <use class="ytp-svg-shadow" xlink:href="#ytp-id-164"></use>
    <path
      d="m 26,13 0,10 -16,0 0,-10 z m -14,2 12,0 0,6 -12,0 0,-6 z"
      fill="#fff"
      fill-rule="evenodd"
      id="ytp-id-164"
    ></path>
  </svg>
</button>
```

## Queue

- [x] Clicking thumb on top of queue plays the song
- [?] Q - dataTree mode
- [ ] Tag
- [ ] Adding new videos should update playlist/DB/etc
- [ ] Add to Q link text -- option for video/playlist
- [ ] Q mode dropdown is rounded weirdly

## Playlists

- [x] Show Interval
- [x] Track
- [x] Duration
- [?] 404 thumbs
  - [x] Playlist should respect deleted videos
- [ ] Queue according to playlist rating, not song rating
- [x] Playlist mode respect atomicity of the playlist
- [ ] Skip album
- [ ] On startup, play button doesn't work
- [ ]

## Youtube Explorer

- [ ] back/forward
