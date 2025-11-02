let params = new URLSearchParams(window.location.search);
let file = params.get("v");
let cueVideo = params.get("cueVideo");
let startTime = parseFloat(params.get("t")) || 0;
console.log("load file", file);
let video = document.getElementById("player");
let canvas = document.getElementById("player");

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
