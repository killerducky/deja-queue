const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

// const Store = require("electron-store");
// const store = new Store();
let store;

app.commandLine.appendSwitch("disable-logging"); // disable general Chromium logging
app.commandLine.appendSwitch("log-level", "3"); // 0=verbose, 3=errors only
app.commandLine.appendSwitch("disable-features", "VizDisplayCompositor"); // optional GPU warning reduction

function sizeStore(win, label) {
  if (store.get("mainWindowMaximized")) {
    win.maximize();
  }
  win.on("resize", () => {
    if (!win.isMaximized()) {
      store.set(`${label}WindowBounds`, win.getBounds());
    }
  });
  win.on("move", () => {
    if (!win.isMaximized()) {
      store.set(`${label}WindowBounds`, win.getBounds());
    }
  });
  win.on("maximize", () => store.set(`${label}WindowMaximized`, true));
  win.on("unmaximize", () => store.set(`${label}WindowMaximized`, false));
}
function createWindow() {
  const bounds = store.get("mainWindowBounds") || { width: 1280, height: 720 };
  let win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    icon: path.join(__dirname, "favicon.ico"),
    webPreferences: {
      preload: __dirname + "/preload.js", // inject our bridge script
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadFile("index.html");
  // win.webContents.openDevTools();
  win.on("closed", () => {
    win = null;
  });
  sizeStore(win, "main");
}

function createYoutubeWindow() {
  const bounds = store.get("playerWindowBounds") || {
    width: 1280,
    height: 720,
  };
  let playerWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    title: "YouTube Player",
    // parent: BrowserWindow.getFocusedWindow(), // makes it a child window (optional)
    webPreferences: {
      preload: path.join(__dirname, "youtube-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  playerWindow.loadURL("https://www.youtube.com/");
  // playerWindow.webContents.openDevTools();

  playerWindow.on("closed", () => {
    playerWindow = null;
  });
  sizeStore(playerWindow, "player");
}

ipcMain.handle("read-file", async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath, "utf8");
    return data;
  } catch (error) {
    console.error("Error reading file:", error);
    throw error; // Re-throw to inform the renderer of the error
  }
});

ipcMain.on("broadcast", (event, msg) => {
  console.log("main got", JSON.stringify(msg));
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents != event.sender) {
      win.webContents.send("broadcast", msg);
    }
  });
});

app.whenReady().then(async () => {
  const StoreModule = await import("electron-store");
  const Store = StoreModule.default; // get the default export
  store = new Store();
  createWindow();
  createYoutubeWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
