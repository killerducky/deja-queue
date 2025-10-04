const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");

// Try to workaround spectrum doh ssl warning
// CertVerifyProcBuiltin for doh-02.spectrum.com failed:
// ----- Certificate i=0 (CN=doh-01.spectrum.com,O=Charter Communications Operating\, LLC,L=St. Louis,ST=Missouri,C=US) -----
// ERROR: Time is after notAfter
app.commandLine.appendSwitch("disable-features", "DnsOverHttps");

// Suppress GPU warnings
app.commandLine.appendSwitch("ignore-gpu-blacklist"); // ignore GPU blacklists
app.commandLine.appendSwitch("disable-gpu"); // optionally disable GPU entirely
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("enable-logging", "stderr");
app.commandLine.appendSwitch("v", "0"); // sets verbose logging to 0 (minimal)

let env;
try {
  const envPath = path.join(__dirname, ".env.json"); // local file relative to main.js
  const data = fs.readFileSync(envPath, "utf-8");
  env = JSON.parse(data);
  console.log("Loaded env:", env);
} catch (err) {
  console.error("Failed to load .env.json", err);
  alert("Could not load .env.json");
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    // fullscreen: true,
    icon: path.join(__dirname, "favicon.ico"),
    webPreferences: {
      preload: __dirname + "/preload.js", // inject our bridge script
      nodeIntegration: false,
      contextIsolation: true,
    },
    preload: path.join(__dirname, "preload.js"),
  });

  win.maximize();
  win.loadFile("index.html");
  // win.loadURL("https://www.youtube.com");
  win.webContents.openDevTools();

  setTimeout(() => {
    win.webContents.executeJavaScript("window.ytControl.pause()");
  }, 5000);

  // Get current time
  win.webContents
    .executeJavaScript("window.ytControl.getTime()")
    .then((t) => console.log("Current time:", t));
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
