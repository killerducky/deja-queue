"use strict";

const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  Menu,
  globalShortcut,
  clipboard,
  shell,
  nativeTheme,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");
const windowStateKeeper = require("./electron-window-state");

let store;

// youtubePlayer: WebContentsView  winRegister.youtubePlayer.object
// youtubeExplore: BrowserWindow
// main: BrowserWindow
// graphs: BrowserWindow
const winRegister = {};
let winMain = null;
let winYoutubeProxy = null;
let queueMode;

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

app.commandLine.appendSwitch("log-level", "3"); // 0=verbose, 3=errors only

class YoutubePlayerProxy {
  constructor(winParent, winInfo) {
    this.views = [];
    this.active = 0;
    this.enable = true; // If true, actually swap views. Otherwise keep main always.
    this.debug = false; // If true, show inactive view on screen
    this.visible = true;
    this.winInfo = winInfo;
    let webPreferences = {};
    webPreferences.preload = path.join(__dirname, winInfo.preload);
    webPreferences.title = "YoutubePlayer";
    for (let i = 0; i < 2; i += 1) {
      const playerWindow = new WebContentsView({ webPreferences });
      winParent.contentView.addChildView(playerWindow);

      addContextMenu(playerWindow);
      playerWindow.webContents.setWindowOpenHandler((details) => {
        return youtubeExplorerOpenHandler(details);
      });

      // Set to inactive on both. Div size listener will set bounds for the active one later.
      playerWindow.setBounds(this.inactiveBounds());
      playerWindow.webContents.loadURL("https://www.youtube.com/");
      this.views[i] = playerWindow;
    }
    this.views[this.inactive()].webContents.audioMuted = true;
    winRegister[this.winInfo.name] = {
      type: "WebContentsView",
      object: this.views[this.active],
      metadata: { ...this.winInfo },
    };
  }
  volumeChanged(msg) {
    this.views[this.inactive()].webContents.send("broadcast", msg);
  }
  backgroundCueNext(msg) {
    // Change to cueVideo. We know the id by now
    msg.type = "cueVideo";
    this.views[this.inactive()].webContents.send("broadcast", msg);
  }
  inactive() {
    return (this.active + 1) % 2;
  }
  rotateVideo() {
    this.views[this.active].webContents.send("broadcast", {
      type: "rotateVideo",
    });
  }
  inactiveBounds(bounds = {}) {
    if (this.debug) {
      return {
        x: 700,
        y: 200,
        width: bounds.width ?? 700,
        height: bounds.height ?? 500,
      };
    } else {
      return {
        x: -9999,
        y: -9999,
        width: bounds.width ?? 700,
        height: bounds.height ?? 500,
      };
    }
  }
  setBounds(bounds) {
    this.bounds = bounds;
    this.views[this.active].setBounds(
      this.visible ? bounds : this.inactiveBounds(this.bounds)
    );
  }
  hide() {
    this.visible = false;
    this.views[this.active].setBounds(this.inactiveBounds(this.bounds));
  }
  show() {
    this.visible = true;
    console.log("restore", this.bounds);
    this.views[this.active].setBounds(this.bounds);
  }

  playVideo(msg) {
    let foreignKeys = this.views.map((view) => {
      let url = view.webContents.getURL();
      let foreignKey = new URL(url).searchParams.get("v");
      return foreignKey;
    });
    if (
      this.enable &&
      foreignKeys[this.inactive()] == msg.foreignKey &&
      foreignKeys[this.active] != msg.foreignKey
    ) {
      // If enabled and the non-active view has it loaded, and the current doesn't, switch
      let bounds = this.views[this.active].getBounds();
      this.views[this.inactive()].setBounds(bounds);
      this.views[this.active].setBounds(this.inactiveBounds(bounds));
      this.active = this.inactive();
      this.views[this.active].webContents.audioMuted = false;
      this.views[this.inactive()].webContents.audioMuted = true;

      // Some stuff still uses winRegister
      winRegister[this.winInfo.name] = {
        type: "WebContentsView",
        object: this.views[this.active],
        metadata: { ...this.winInfo },
      };
    }

    if (msg?.source == "local") {
      msg.path = path.join(__dirname, "videoplayer.html");
      let win = BrowserWindow.fromWebContents(
        this.views[this.active].webContents
      );
      savedMsgs.set(win.id, msg);
      console.log(`Saved message for window ${win.id}:`, msg);
      this.views[this.active].webContents.loadFile(
        path.join(__dirname, "videoplayer.html"),
        {
          query: {
            v: msg.foreignKey,
            uuid: msg.uuid,
            rotateAngle: msg.rotateAngle,
            ...(msg.type === "cueVideo" && { cueVideo: "1" }),
            ...(msg.needThumb && { needThumb: "1" }),
          },
        }
      );
    } else {
      this.views[this.active].webContents.send("broadcast", msg);
    }
  }
}

const savedMsgs = new Map();

ipcMain.on("saveMsg", (event, msg) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  savedMsgs.set(win.id, msg);
  console.log(`Saved message for window ${win.id}:`, msg.type);
});

ipcMain.handle("getSavedMsg", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const msg = savedMsgs.get(win.id) || null;
  console.log(`Retrieved message for window ${win.id}:`, msg.type);
  return msg;
});

function youtubeExplorerOpenHandler(details) {
  const { url } = details;
  const childWin = new BrowserWindow({
    width: 1366,
    height: 768,
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
  winInfo.winState = windowStateKeeper({
    defaultWidth: 1366,
    defaultHeight: 768,
    file: `${winInfo.name}.json`,
  });
  let win = new BrowserWindow({
    x: winInfo.winState.x,
    y: winInfo.winState.y,
    width: winInfo.winState.width,
    height: winInfo.winState.height,
    icon: path.join(__dirname, "favicon.ico"),
    webPreferences: {
      // show: false,
      preload: path.join(__dirname, winInfo.preload),
    },
  });
  winInfo.winState.manage(win);
  if (winInfo.target.startsWith("http")) {
    win.loadURL(winInfo.target);
  } else {
    win.loadFile(winInfo.target);
  }
  win.on("closed", () => {
    win = null;
  });
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
    url = new URL(url);

    const urlParams = url.searchParams;
    let videoId = urlParams.get("v");
    const listId = urlParams.get("list");
    if (url.pathname.startsWith("/shorts/")) {
      videoId = url.pathname.split("/shorts/")[1].split(/[?&]/)[0];
    }

    const template = [];
    if (videoId) {
      template.push({
        label: "Add Video to Queue",
        click: () => {
          const msg = { type: "queue:addVideo", foreignKey: videoId };
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
          const msg = { type: "queue:addPlaylist", foreignKey: listId };
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

ipcMain.on("store-get-sync", (e, { key, defaultValue }) => {
  e.returnValue = store.get(key, defaultValue);
});

ipcMain.on("store-set-sync", (e, key, value) => {
  store.set(key, value);
  e.returnValue = true;
});

function sendBroadcast(msg, windows) {
  if (windows == "all") {
    windows = [winRegister.main.object, winRegister.youtubePlayer.object];
  }
  for (let win of windows) {
    win.webContents.send("broadcast", msg);
  }
}

ipcMain.on("broadcast", async (event, msg) => {
  if (msg.type != "div-resize") {
    console.log("msg:", JSON.stringify(msg));
  }
  if (msg.type === "div-resize") {
    winYoutubeProxy.setBounds(msg.bounds);
  } else if (msg.type == "hideYoutube") {
    winYoutubeProxy.hide();
  } else if (msg.type == "showYoutube") {
    winYoutubeProxy.show();
  } else if (msg.type === "backgroundCueVideo") {
    winYoutubeProxy.backgroundCueNext(msg);
  } else if (msg.type === "volumeChanged") {
    winYoutubeProxy.volumeChanged(msg);
  } else if (msg.type === "playVideo") {
    winYoutubeProxy.playVideo(msg);
  } else if (msg.type === "cueVideo" && msg.source === "local") {
    winYoutubeProxy.playVideo(msg);
  } else {
    Object.values(winRegister).forEach((win) => {
      if (win.object.webContents.id !== event.sender.id) {
        win.object.webContents.send("broadcast", msg);
      }
    });
  }
});

ipcMain.on("save-thumbnail", (event, msg) => {
  console.log("save-thumbnail", msg.uuid);
  let thumbsDir = path.join(app.getPath("userData"), "thumbnails");
  if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir, { recursive: true });
  }
  let filePath = path.join(thumbsDir, `${msg.uuid}.jpg`);

  fs.writeFile(filePath, msg.buffer, (err) => {
    if (err) {
      console.error("Failed to save thmbnail:", err);
    } else {
      console.log("Thumbnail saved to", filePath);
      winRegister.main.object.webContents.send("broadcast", {
        type: "thumbnail-saved",
        uuid: msg.uuid,
        filePath: filePath,
      });
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
function setQueueMode(mode) {
  queueMode = mode;
  store.set("queueMode", mode);
  console.log("setQueueMode", mode);
  winRegister.main.object.webContents.send("broadcast", {
    type: "queueModeChanged",
    mode,
  });
}
function menuHelper(mainitem) {
  let verboseLayout = {
    label: mainitem.label,
    submenu: [],
  };
  for (let subitem of mainitem.submenu) {
    verboseLayout.submenu.push({
      label: subitem.label,
      type: "radio",
      checked: store.get(mainitem.label) == subitem.label,
      click: () => {
        store.set(mainitem.label, subitem.label);
        console.log("click", mainitem.label, subitem.label);
        winRegister.main.object.send("broadcast", {
          type: "menuRadio",
          subtype: mainitem.label,
          value: subitem.label,
        });
      },
    });
  }
  // console.log(verboseLayout);
  return verboseLayout;
}
function buildMenu() {
  let graphsWin;
  let spotifyWin;

  queueMode = store.get("queueMode", "video");
  if (!store.get("Layout")) {
    store.set("Layout", "Video");
  }

  let radioOpts = {
    layout: {
      label: "Layout",
      submenu: [
        { label: "Video" },
        { label: "Database" },
        { label: "Playlists" },
      ],
    },
  };

  const isMac = process.platform === "darwin";
  const template = [
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
    {
      label: "File",
      submenu: [
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
        {
          label: "Export Database",
          click: () => {
            winRegister.main.object.webContents.send("broadcast", {
              type: "exportDatabase",
            });
          },
        },
        { type: "separator" },
        {
          label: "Delete Database",
          click: async () => {
            winRegister.main.object.webContents.send("broadcast", {
              type: "deleteDatabaseRequest",
            });
          },
        },
        { type: "separator" },
        {
          label: "Add local files",
          click: async () => {
            const result = await dialog.showOpenDialog(
              winRegister.main.object,
              {
                properties: ["openDirectory"],
              }
            );

            if (!result.canceled && result.filePaths.length > 0) {
              const dir = result.filePaths[0];
              const files = getAllMp4Files(dir);
              winRegister.main.object.webContents.send("broadcast", {
                type: "importLocalDirectory",
                path: dir,
                files,
              });
            }
          },
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
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
    {
      label: "View",
      submenu: [
        menuHelper(radioOpts.layout),
        {
          label: "Rotate Video",
          click: () => sendBroadcast({ type: "rotateVideo" }, "all"),
        },
        {
          label: "Theme",
          submenu: [
            {
              label: "Light",
              type: "radio",
              checked: nativeTheme.themeSource === "light",
              click: () => setTheme("light"),
            },
            {
              label: "Dark",
              type: "radio",
              checked: nativeTheme.themeSource === "dark",
              click: () => setTheme("dark"),
            },
          ],
        },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
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
                // webPreferences: { preload: path.join(__dirname, "preload.js") },
              });
              graphsWin.maximize();
              graphsWin.loadFile("graphs.html");
            }
          },
        },
        // {
        //   label: "Open Spotify",
        //   click: () => {
        //     if (spotifyWin && !spotifyWin.isDestroyed()) {
        //       if (!spotifyWin.isVisible()) {
        //         spotifyWin.show();
        //       }
        //       spotifyWin.focus();
        //       spotifyWin.moveTop();
        //     } else {
        //       spotifyWin = new BrowserWindow({
        //         width: 1000,
        //         height: 700,
        //         // webPreferences: {
        //         //   plugins: true,
        //         //   webSecurity: true,
        //         // },
        //       });
        //       spotifyWin.maximize();
        //       // spotifyWin.webContents.setUserAgent(
        //       //   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
        //       // );
        //       spotifyWin.webContents.loadURL("https://open.spotify.com");
        //       // const filePath = path.join(__dirname, "spotify-embed.html");
        //       // spotifyWin.loadURL("file://" + filePath);
        //       // spotifyWin.loadFile("spotify-embed.html");
        //       // spotifyWin.webContents.loadURL(
        //       //   "http://localhost/spotify-embed.html"
        //       // );
        //       // spotifyWin.webContents.loadURL(
        //       //   "https://open.spotify.com/track/3LII8A23VIs7pzudea2VSo?si=b1c4b0c019084459"
        //       // );
        //     }
        //   },
        // },
      ],
    },
    {
      label: "Settings",
      submenu: [
        {
          label: "Queue Mode",
          submenu: [
            {
              label: "Video",
              type: "radio",
              checked: queueMode === "video",
              click: () => setQueueMode("video"),
            },
            {
              label: "Playlist",
              type: "radio",
              checked: queueMode === "playlist",
              click: () => setQueueMode("playlist"),
            },
          ],
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

function getAllMp4Files(dir) {
  let results = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recursively search subdirectory
      results = results.concat(getAllMp4Files(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".mp4")) {
      results.push(fullPath);
    }
  }

  return results;
}

function setDefaults() {
  nativeTheme.themeSource = store.get("theme") || "dark";
  store.set("profile", profile);
}

function setTheme(theme) {
  nativeTheme.themeSource = theme;
  store.set("theme", theme);
}

app.whenReady().then(async () => {
  const StoreModule = await import("electron-store");
  const Store = StoreModule.default; // get the default export
  store = new Store();
  setDefaults();
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
