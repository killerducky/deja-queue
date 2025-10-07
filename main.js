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

// const Store = require("electron-store");
// const store = new Store();
let store;
const playerViews = []; // store WebContentsView instances
let winMain = null;

app.commandLine.appendSwitch("disable-logging"); // disable general Chromium logging
app.commandLine.appendSwitch("log-level", "3"); // 0=verbose, 3=errors only
app.commandLine.appendSwitch("disable-features", "VizDisplayCompositor"); // optional GPU warning reduction

function sizeStore(win, label) {
  const minMaxKey = `${label}WindowMinMax`;
  const boundsKey = `${label}WindowBounds`;

  // Restore state
  const bounds = store.get(boundsKey);
  if (bounds) win.setBounds(bounds);
  if (store.get(minMaxKey) == "max") {
    win.maximize();
  } else if (store.get(minMaxKey) == "min") {
    win.minimize();
  }

  // Save position and size
  const saveBounds = () => {
    if (!win.isMaximized() && !win.isMinimized()) {
      store.set(boundsKey, win.getBounds());
    }
  };
  win.on("resize", saveBounds);
  win.on("move", saveBounds);

  // Save window state
  win.on("maximize", () => store.set(minMaxKey, "max"));
  win.on("unmaximize", () => store.set(minMaxKey, ""));
  win.on("minimize", () => store.set(minMaxKey, "min"));
  win.on("restore", () => store.set(minMaxKey, ""));
}
function createWindow(name) {
  let win = new BrowserWindow({
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
async function createYoutubeWindow(winParent) {
  const playerWindow = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "youtube-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  winParent.contentView.addChildView(playerWindow);
  playerViews.push(playerWindow);

  await setYoutubeBounds(playerWindow, winParent, "youtube");

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

  playerWindow.webContents.loadURL("https://www.youtube.com/");
  // playerWindow.webContents.openDevTools();
  return playerWindow;
}

function goBack(window) {
  // if (window && window.webContents.canGoBack()) {
  //   window.webContents.goBack();
  // }
  if (playerViews[0] && playerViews[0].webContents.canGoBack()) {
    playerViews[0].webContents.goBack();
  }
}

function goForward(window) {
  if (playerViews[0] && playerViews[0].webContents.canGoForward()) {
    playerViews[0].webContents.goForward();
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
  console.log("main got", JSON.stringify(msg));
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents != event.sender) {
      win.webContents.send("broadcast", msg);
    }
  });
  playerViews.forEach((view) => {
    if (view.webContents !== event.sender) {
      view.webContents.send("broadcast", msg);
    }
  });
  if (msg.type === "tab-button") {
    let playerWindow = playerViews[0];
    if (msg.targetId === "youtube") {
      // playerWindow.setBounds({ x: 220, y: 100, width: 1000, height: 500 });
      await setYoutubeBounds(playerWindow, winMain, "youtube-full");
    } else {
      // playerWindow.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      // console.log(playerWindow, winMain);
      await setYoutubeBounds(playerWindow, winMain, "youtube");
    }
  }
});

app.whenReady().then(async () => {
  const StoreModule = await import("electron-store");
  const Store = StoreModule.default; // get the default export
  store = new Store();
  winMain = createWindow("main");
  let winGraph = createWindow("graphs");
  let playerWindow = createYoutubeWindow(winMain);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      winMain = createWindow("main");
      winGraph = createWindow("graphs");
      playerWindow = createYoutubeWindow(winMain);
    }
  });
  globalShortcut.register("Alt+Left", () => goBack(playerWindow));
  globalShortcut.register("Alt+Right", () => goForward(playerWindow));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
