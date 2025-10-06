const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  globalShortcut,
} = require("electron");
const path = require("path");
const fs = require("fs");

// const Store = require("electron-store");
// const store = new Store();
let store;

app.commandLine.appendSwitch("disable-logging"); // disable general Chromium logging
app.commandLine.appendSwitch("log-level", "3"); // 0=verbose, 3=errors only
app.commandLine.appendSwitch("disable-features", "VizDisplayCompositor"); // optional GPU warning reduction

function sizeStore(win, label) {
  if (store.get(`${label}WindowMaximized`)) {
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
function createWindow(name) {
  const bounds = store.get(`${name}WindowBounds`) || {
    width: 1280,
    height: 720,
  };
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
  win.loadFile(name == "main" ? "index.html" : `${name}.html`);
  // win.webContents.openDevTools();
  win.on("closed", () => {
    win = null;
  });
  sizeStore(win, name);
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
    icon: path.join(__dirname, "favicon.ico"),
    title: "YouTube Player",
    // parent: BrowserWindow.getFocusedWindow(), // makes it a child window (optional)
    webPreferences: {
      preload: path.join(__dirname, "youtube-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  playerWindow.on("closed", () => {
    playerWindow = null;
  });
  sizeStore(playerWindow, "player");

  playerWindow.webContents.on("context-menu", (event, params) => {
    let url =
      params.linkURL || params.srcURL || playerWindow.webContents.getURL();

    console.log("menu", url);
    if (!url) {
      console.log("no url");
      return;
    }
    const urlParams = new URL(url).searchParams;
    const videoId = urlParams.get("v");
    const listId = urlParams.get("list");
    if (!listId && !videoId) return;

    const template = [];
    if (videoId) {
      template.push({
        label: "Add Video to Queue",
        click: () => {
          const msg = { type: "queue:addVideo", id: videoId };
          console.log("Broadcasting", JSON.stringify(msg));
          BrowserWindow.getAllWindows().forEach((win) => {
            if (win !== playerWindow) {
              win.webContents.send("broadcast", msg);
            }
          });
        },
      });
    }
    if (listId) {
      template.push({
        label: "Add Playlist to Queue",
        click: () => {
          const msg = { type: "queue:addPlaylist", id: listId };
          console.log("Broadcasting", JSON.stringify(msg));
          BrowserWindow.getAllWindows().forEach((win) => {
            if (win !== playerWindow) {
              win.webContents.send("broadcast", msg);
            }
          });
        },
      });
    }
    const menu = Menu.buildFromTemplate(template);

    menu.popup({ window: playerWindow });
  });

  playerWindow.loadURL("https://www.youtube.com/");
  // playerWindow.webContents.openDevTools();
  return playerWindow;
}

function goBack(window) {
  if (window && window.webContents.canGoBack()) {
    window.webContents.goBack();
  }
}

function goForward(window) {
  if (window && window.webContents.canGoForward()) {
    window.webContents.goForward();
  }
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
  createWindow("main");
  createWindow("graphs");
  let playerWindow = createYoutubeWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow("main");
      createWindow("graphs");
      createYoutubeWindow();
    }
  });
  globalShortcut.register("Alt+Left", () => goBack(playerWindow));
  globalShortcut.register("Alt+Right", () => goForward(playerWindow));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
