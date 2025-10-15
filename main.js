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
  console.log("bounds:", bounds, store.get(minMaxKey));
  win.once("ready-to-show", () => {
    if (bounds) {
      console.log("set bounds:", bounds, store.get(minMaxKey));
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
    const handleResize = async () => {
      saveBounds();
      const target = await win.webContents.executeJavaScript(`
      (() => {
        const activeButton = document.querySelector(".tab-button.active");
        const target = activeButton?.dataset.target;
        return target;
      })()
      `);
      if (target == "youtube") {
        setYoutubeBounds(
          winRegister.youtubePlayer.object,
          winMain,
          "youtube-full"
        );
      } else {
        setYoutubeBounds(winRegister.youtubePlayer.object, winMain, "youtube");
      }
    };
    win.on("resize", handleResize);
    win.webContents.on("devtools-opened", handleResize);
    win.webContents.on("devtools-closed", handleResize);
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
    icon: path.join(__dirname, "favicon.ico"),
  });
  childWin.webContents.loadURL(url);
  addContextMenu(childWin);
  childWin.webContents.setWindowOpenHandler((details) => {
    return youtubeWindowOpenHandler(details, childWin);
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
async function createYoutubeWindow(winParent, winInfo) {
  let webPreferences = {};
  if (winInfo.preload) {
    webPreferences.preload = path.join(__dirname, winInfo.preload);
  }
  const playerWindow = new WebContentsView({
    webPreferences,
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
  console.log("msg:", JSON.stringify(msg));
  // console.log(JSON.stringify(event));

  Object.values(winRegister).forEach((win) => {
    win.object.webContents.send("broadcast", msg);
  });
  // tab-button are the buttons that change the view.
  // Change where embedded youtube is shown.
  if (msg.type === "tab-button") {
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
    preload: "preload.js",
  });
  createYoutubeWindow(winMain, {
    name: "youtubePlayer",
    preload: "youtube-preload.js",
  });
  // createYoutubeWindow(winMain, {
  //   name: "youtubePlayer2",
  //   preload: "",
  // });
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
                width: 900,
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
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
