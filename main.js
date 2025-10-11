const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  Menu,
  globalShortcut,
} = require("electron");
const path = require("path");
const fs = require("fs");

let store;

// youtubePlayer: WebContentsView
// youtubeExplore: BrowserWindow
// main: BrowserWindow
// graphs: BrowserWindow
const winRegister = {};
let winMain = null;

app.commandLine.appendSwitch("disable-logging"); // disable general Chromium logging
app.commandLine.appendSwitch("log-level", "3"); // 0=verbose, 3=errors only
app.commandLine.appendSwitch("disable-features", "VizDisplayCompositor"); // optional GPU warning reduction

function safeKey(label, suffix) {
  return `${label.replace(/\./g, "_")}${suffix}`;
}

function sizeStore(win, label) {
  const minMaxKey = safeKey(label, "WindowMinMax");
  const boundsKey = safeKey(label, "WindowBounds");

  // Restore state
  const bounds = store.get(boundsKey);
  win.once("ready-to-show", () => {
    if (bounds) {
      win.setBounds(bounds);
      if (store.get(minMaxKey) == "max") {
        win.maximize();
      } else if (store.get(minMaxKey) == "min") {
        win.minimize();
      }
    }

    // Save position and size
    const saveBounds = () => {
      if (!win.isMaximized() && !win.isMinimized()) {
        store.set(boundsKey, win.getBounds());
        // console.log(JSON.stringify(win.getBounds()));
      }
    };
    win.on("resize", saveBounds);
    win.on("move", saveBounds);

    // Save window state
    win.on("maximize", () => store.set(minMaxKey, "max"));
    win.on("unmaximize", () => store.set(minMaxKey, ""));
    win.on("minimize", () => store.set(minMaxKey, "min"));
    win.on("restore", () => store.set(minMaxKey, ""));
  });
}
function youtubeWindowOpenHandler(details, parentWin) {
  const { url } = details;
  console.log("Intercepted window open:", url);

  const childWin = new BrowserWindow({
    title: "YouTube Popup",
    webPreferences: {
      preload: path.join(__dirname, "youtube-preload.js"),
    },
  });

  childWin.webContents.loadURL(url);
  addContextMenu(childWin);

  return { action: "deny" };
}
function createWindow(winInfo) {
  let win = new BrowserWindow({
    icon: path.join(__dirname, "favicon.ico"),
    webPreferences: {
      ...(winInfo.inject
        ? { preload: path.join(__dirname, winInfo.inject) }
        : {}),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  if (winInfo.target.startsWith("http")) {
    win.loadURL(winInfo.target);
  } else {
    win.loadFile(winInfo.target);
  }
  win.on("closed", () => {
    win = null;
  });
  sizeStore(win, winInfo.name);
  if (winInfo.addContextMenu) {
    addContextMenu(win);
  }
  win.webContents.setWindowOpenHandler((details) => {
    return youtubeWindowOpenHandler(details, win);
  });
  winRegister[winInfo.name] = {
    type: "BrowserWindow",
    object: win,
    metadata: { ...winInfo },
  };
  return win;
}

async function setYoutubeBounds(playerWindow, winParent, divTarget) {
  const bounds = await winParent.webContents.executeJavaScript(`
    (() => {
      const el = document.getElementById("${divTarget}");
      const rect = el.getBoundingClientRect();
      const bounds = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      return bounds;
    })()
  `);
  // console.log(bounds);
  playerWindow.setBounds(bounds);
}

async function addContextMenu(playerWindow) {
  playerWindow.webContents.on("context-menu", (event, params) => {
    let url =
      params.linkURL || params.srcURL || playerWindow.webContents.getURL();

    const urlParams = new URL(url).searchParams;
    const videoId = urlParams.get("v");
    const listId = urlParams.get("list");

    const template = [];
    template.push(
      {
        label: "← Go Back",
        enabled: playerWindow.webContents.navigationHistory.canGoBack(),
        click: () => playerWindow.webContents.navigationHistory.goBack(),
      },
      {
        label: "→ Go Forward",
        enabled: playerWindow.webContents.navigationHistory.canGoForward(),
        click: () => playerWindow.webContents.navigationHistory.goForward(),
      },
      { type: "separator" }
    );
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
    if (template.length > 0) {
      const menu = Menu.buildFromTemplate(template);
      menu.popup({ window: playerWindow });
    }
  });
}
async function createYoutubeWindow(winParent, winInfo) {
  const playerWindow = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "youtube-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  winParent.contentView.addChildView(playerWindow);

  addContextMenu(playerWindow);
  playerWindow.webContents.setWindowOpenHandler((details) => {
    return youtubeWindowOpenHandler(details, playerWindow);
  });

  playerWindow.webContents.loadURL("https://www.youtube.com/");
  winRegister[winInfo.name] = {
    type: "WebContentsView",
    object: playerWindow,
    metadata: { ...winInfo },
  };
  winParent.once("ready-to-show", () => {
    setYoutubeBounds(playerWindow, winParent, "youtube");
  });
  return playerWindow;
}

function goBack() {
  let nh = winRegister.youtubeExplore.object.webContents.navigationHistory;
  if (nh.canGoBack()) {
    nh.goBack();
  }
}

function goForward() {
  let nh = winRegister.youtubeExplore.object.webContents.navigationHistory;
  if (nh.canGoForward()) {
    nh.goForward();
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

ipcMain.on("broadcast", async (event, msg) => {
  console.log("msg:", JSON.stringify(msg));
  // console.log(JSON.stringify(event));

  Object.values(winRegister).forEach((win) => {
    win.object.webContents.send("broadcast", msg);
  });
  // tab-button are the buttons that change the view.
  // Change where embedded youtube is shown.
  if (msg.type === "tab-button") {
    // let playerWindow = playerViews.youtubePlay;
    let playerWindow = winRegister.youtubePlayer.object;
    if (msg.targetId === "youtube") {
      await setYoutubeBounds(playerWindow, winMain, "youtube-full");
    } else {
      await setYoutubeBounds(playerWindow, winMain, "youtube");
    }
  }
});

function createAllWindows() {
  winMain = createWindow({
    name: "main",
    target: "index.html",
    inject: "preload.js",
  });
  createYoutubeWindow(winMain, {
    name: "youtubePlayer",
    inject: "youtube-preload.js", // TODO Not used yet
  });
  // winRegister.main.object.webContents.openDevTools();
  // winRegister.youtubePlayer.object.webContents.openDevTools();
}
app.whenReady().then(async () => {
  const StoreModule = await import("electron-store");
  const Store = StoreModule.default; // get the default export
  store = new Store();
  createAllWindows();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAllWindows();
    }
  });
  // We can't really do global now there are multiple YTs allowed
  // globalShortcut.register("CommandOrControl+[", () => goBack());
  // globalShortcut.register("CommandOrControl+]", () => goForward());
  // globalShortcut.register("Alt+Left", () => goBack());
  // globalShortcut.register("Alt+Right", () => goForward());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
