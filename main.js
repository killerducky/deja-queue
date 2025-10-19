const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  Menu,
  globalShortcut,
  clipboard,
  shell,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");

let store;

// youtubePlayer: WebContentsView  winRegister.youtubePlayer.object
// youtubeExplore: BrowserWindow
// main: BrowserWindow
// graphs: BrowserWindow
const winRegister = {};
let winMain = null;
let winYoutubeProxy = null;

const args = process.argv.slice(2); // skip .exe and path

let profile = "default";
const profileIndex = args.indexOf("--profile");
if (profileIndex !== -1 && args[profileIndex + 1]) {
  profile = args[profileIndex + 1];
  console.log("Using profile:", profile);
  const userDataPath = path.join(
    app.getPath("appData"),
    "deja-queue/profiles",
    profile
  );
  console.log(userDataPath);
  app.setPath("userData", userDataPath);
}

app.commandLine.appendSwitch("disable-logging"); // disable general Chromium logging
app.commandLine.appendSwitch("log-level", "3"); // 0=verbose, 3=errors only
// app.commandLine.appendSwitch("disable-features", "VizDisplayCompositor"); // optional GPU warning reduction

class YoutubePlayerProxy {
  constructor(winParent, winInfo) {
    this.views = [];
    this.active = 0;
    this.winInfo = winInfo;
    let webPreferences = {};
    if (winInfo.preload) {
      webPreferences.preload = path.join(__dirname, winInfo.preload);
    }
    for (let i = 0; i < 2; i += 1) {
      const playerWindow = new WebContentsView({ webPreferences });
      winParent.contentView.addChildView(playerWindow);

      addContextMenu(playerWindow);
      playerWindow.webContents.setWindowOpenHandler((details) => {
        return youtubeExplorerOpenHandler(details);
      });

      playerWindow.setBounds({ x: 700, y: 200, width: 700, height: 500 });
      playerWindow.webContents.loadURL("https://www.youtube.com/");
      this.views[i] = playerWindow;
    }
    winRegister[this.winInfo.name] = {
      type: "WebContentsView",
      object: this.views[this.active],
      metadata: { ...this.winInfo },
    };
  }
  backgroundCueNext(msg) {
    // Change to cueVideo. We know the id by now
    msg.type = "cueVideo";
    this.views[(this.active + 1) % 2].webContents.send("broadcast", msg);
  }
  playVideo(msg) {
    console.log(this.views[0].webContents.getURL());
    console.log(this.views[1].webContents.getURL());
    let ids = this.views.map((view) => {
      let url = view.webContents.getURL();
      let id = new URL(url).searchParams.get("v");
      return id;
    });
    if (ids[(this.active + 1) % 2] == msg.id && ids[this.active] != msg.id) {
      // If the non-active view has it loaded, and the current doesn't, switch
      this.active = (this.active + 1) % 2;
      winRegister[this.winInfo.name] = {
        type: "WebContentsView",
        object: this.views[this.active],
        metadata: { ...this.winInfo },
      };
    }
    this.views[this.active].webContents.send("broadcast", msg);
  }
}

function safeKey(label, suffix) {
  return `${label.replace(/\./g, "_")}${suffix}`;
}

function sizeStore(win, label) {
  function saveBounds(win, boundsKey) {
    if (!win.isMaximized() && !win.isMinimized()) {
      store.set(boundsKey, win.getBounds());
      // console.log(JSON.stringify(win.getBounds()));
    }
  }

  const minMaxKey = safeKey(label, "WindowMinMax");
  const boundsKey = safeKey(label, "WindowBounds");

  // Restore state
  const bounds = store.get(boundsKey);
  console.log("bounds:", boundsKey, bounds, store.get(minMaxKey));
  win.once("ready-to-show", () => {
    if (bounds) {
      console.log("set bounds:", boundsKey, bounds, store.get(minMaxKey));
      win.setBounds(bounds);
      if (store.get(minMaxKey) == "max") {
        win.maximize();
      } else if (store.get(minMaxKey) == "min") {
        win.minimize();
      }
    }

    // Save window state
    win.on("resize", () => saveBounds(win, boundsKey));
    win.on("move", () => saveBounds(win, boundsKey));
    win.on("maximize", () => store.set(minMaxKey, "max"));
    win.on("unmaximize", () => store.set(minMaxKey, ""));
    win.on("minimize", () => store.set(minMaxKey, "min"));
    win.on("restore", () => store.set(minMaxKey, ""));
  });
}
function youtubeExplorerOpenHandler(details) {
  const { url } = details;
  const childWin = new BrowserWindow({
    width: 1000,
    height: 700,
    icon: path.join(__dirname, "favicon.ico"),
  });
  childWin.webContents.loadURL(url);
  addContextMenu(childWin);
  childWin.webContents.setWindowOpenHandler((details) => {
    return youtubeExplorerOpenHandler(details);
  });

  return { action: "deny" };
}
function createWindow(winInfo) {
  let win = new BrowserWindow({
    icon: path.join(__dirname, "favicon.ico"),
    webPreferences: {
      ...(winInfo.preload
        ? { preload: path.join(__dirname, winInfo.preload) }
        : {}),
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
    return youtubeExplorerOpenHandler(details);
  });
  winRegister[winInfo.name] = {
    type: "BrowserWindow",
    object: win,
    metadata: { ...winInfo },
  };
  return win;
}

async function addContextMenu(playerWindow) {
  playerWindow.webContents.on("context-menu", (event, params) => {
    let url =
      params.linkURL || params.srcURL || playerWindow.webContents.getURL();

    const urlParams = new URL(url).searchParams;
    const videoId = urlParams.get("v");
    const listId = urlParams.get("list");

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

    template.push(
      { type: "separator" },
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
      { type: "separator" },
      {
        label: "Copy URL",
        click: async () => {
          const url = playerWindow.webContents.getURL();
          const { clipboard } = require("electron");
          clipboard.writeText(url);
        },
      },
      { type: "separator" }
    );
    template.push({
      label: "Inspect / DevTools",
      accelerator: "CmdOrCtrl+Shift+I", // standard Electron dev shortcut
      click: () => {
        if (playerWindow.webContents.isDevToolsOpened()) {
          playerWindow.webContents.closeDevTools();
        } else {
          playerWindow.webContents.openDevTools({ mode: "detach" });
        }
      },
    });
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: playerWindow });
  });
}

ipcMain.handle("openExternal", async (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle("read-file", async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath, "utf8");
    return data;
  } catch (error) {
    console.error("Error reading file:", error);
    throw error; // Re-throw to inform the renderer of the error
  }
});

ipcMain.on("store-get-sync", (e, key) => {
  e.returnValue = store.get(key);
});

ipcMain.on("store-set-sync", (e, key, value) => {
  store.set(key, value);
  e.returnValue = true;
});

ipcMain.on("broadcast", async (event, msg) => {
  if (msg.type != "div-resize") {
    console.log("msg:", JSON.stringify(msg));
  }
  if (msg.type === "div-resize") {
    winRegister.youtubePlayer.object.setBounds(msg.bounds);
    return;
  }
  if (msg.type === "backgroundCueVideo") {
    winYoutubeProxy.backgroundCueNext(msg);
    return;
  }
  if (msg.type === "playVideo") {
    winYoutubeProxy.playVideo(msg);
  }
  // console.log(JSON.stringify(event));

  Object.values(winRegister).forEach((win) => {
    if (win.object.webContents.id !== event.sender.id) {
      win.object.webContents.send("broadcast", msg);
    }
  });
});

function createAllWindows() {
  winMain = createWindow({
    name: "main",
    target: "index.html",
    preload: "preload.js",
  });
  winYoutubeProxy = new YoutubePlayerProxy(winMain, {
    name: "youtubePlayer",
    preload: "youtube-preload.js",
  });
  // winRegister.main.object.webContents.openDevTools();
  // winRegister.youtubePlayer.object.webContents.openDevTools();
}
function buildMenu() {
  let graphsWin;
  const isMac = process.platform === "darwin";
  const template = [
    // { role: 'appMenu' }
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    // { role: 'fileMenu' }
    {
      label: "File",
      submenu: [
        {
          label: "Delete Database",
          click: async () => {
            winRegister.main.object.webContents.send("broadcast", {
              type: "deleteDatabaseRequest",
            });
          },
        },
        {
          label: "Export Database",
          click: () => {
            winRegister.main.object.webContents.send("broadcast", {
              type: "exportDatabase",
            });
          },
        },
        {
          label: "Import Database",
          click: async () => {
            const result = await dialog.showOpenDialog(
              winRegister.main.object.webContents,
              {
                properties: ["openFile"],
                filters: [{ name: "JSON", extensions: ["json"] }],
              }
            );
            if (!result.canceled && result.filePaths.length > 0) {
              let filePath = result.filePaths[0];
              winRegister.main.object.webContents.send("broadcast", {
                type: "importDatabase",
                filePath,
              });
            }
          },
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    // { role: 'editMenu' }
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle" },
              { role: "delete" },
              { role: "selectAll" },
              { type: "separator" },
              {
                label: "Speech",
                submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
              },
            ]
          : [{ role: "delete" }, { type: "separator" }, { role: "selectAll" }]),
      ],
    },
    // { role: 'viewMenu' }
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    // { role: 'windowMenu' }
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front" },
              { type: "separator" },
              { role: "window" },
            ]
          : [{ role: "close" }]),
        { type: "separator" },
        {
          label: "Open Graphs",
          click: () => {
            if (graphsWin && !graphsWin.isDestroyed()) {
              if (!graphsWin.isVisible()) {
                graphsWin.show();
              }
              graphsWin.focus();
              graphsWin.moveTop();
            } else {
              graphsWin = new BrowserWindow({
                width: 1000,
                height: 700,
                webPreferences: { preload: path.join(__dirname, "preload.js") },
              });
              graphsWin.maximize();
              graphsWin.loadFile("graphs.html");
            }
          },
        },
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Learn More",
          click: async () => {
            await shell.openExternal(
              "https://github.com/killerducky/deja-queue"
            );
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  const StoreModule = await import("electron-store");
  const Store = StoreModule.default; // get the default export
  store = new Store();
  buildMenu();
  createAllWindows();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAllWindows();
    }
  });
  console.log("User Data Path:", app.getPath("userData"));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
