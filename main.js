const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

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
      webviewTag: true,
    },
    preload: path.join(__dirname, "preload.js"),
  });

  win.maximize();
  win.loadFile("index.html");
  // win.webContents.openDevTools();

  setTimeout(() => {
    win.webContents.executeJavaScript("window.ytControl.pause()");
  }, 5000);

  // Get current time
  win.webContents
    .executeJavaScript("window.ytControl.getTime()")
    .then((t) => console.log("Current time:", t));
};

ipcMain.handle("read-file", async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath, "utf8");
    return data;
  } catch (error) {
    console.error("Error reading file:", error);
    throw error; // Re-throw to inform the renderer of the error
  }
});

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
