let params = new URLSearchParams(window.location.search);
let file = params.get("v");
let cueVideo = params.get("cueVideo");
let needThumb = params.get("needThumb");
console.log("load file", file);
let startTime = parseFloat(params.get("t")) || 0;
let video = document.getElementById("player");
file =
  "file:///" +
  file
    .split(/[/\\]/) // split by slashes
    .map(encodeURIComponent) // encode each segment
    .join("/"); // join with /
video.src = file;
video.currentTime = startTime;
if (!cueVideo) {
  video.play();
} else {
  video.pause();
}
