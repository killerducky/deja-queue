"use strict";

const path = require("path");
const electron = require("electron");
const jsonfile = require("jsonfile");
const mkdirp = require("mkdirp");

module.exports = function (options) {
  const app = electron.app || electron.remote.app;
  const screen = electron.screen || electron.remote.screen;
  let state;
  let winRef;
  let stateChangeTimer;
  const eventHandlingDelay = 100;
  const config = Object.assign(
    {
      file: "window-state.json",
      path: app.getPath("userData"),
      maximize: true,
      fullScreen: true,
      defaultWidth: 800,
      defaultHeight: 600,
    },
    options
  );
  const fullStoreFileName = path.join(config.path, config.file);

  function isNormal(win) {
    return !win.isMaximized() && !win.isMinimized() && !win.isFullScreen();
  }

  function hasBounds() {
    return (
      state &&
      Number.isInteger(state.x) &&
      Number.isInteger(state.y) &&
      Number.isInteger(state.width) &&
      state.width > 0 &&
      Number.isInteger(state.height) &&
      state.height > 0
    );
  }

  function resetStateToDefault() {
    const displayBounds = screen.getPrimaryDisplay().bounds;
    state = {
      width: config.defaultWidth,
      height: config.defaultHeight,
      x: 0,
      y: 0,
      displayBounds,
    };
  }

  function windowWithinBounds(bounds) {
    return (
      state.x >= bounds.x &&
      state.y >= bounds.y &&
      state.x + state.width <= bounds.x + bounds.width &&
      state.y + state.height <= bounds.y + bounds.height
    );
  }

  function ensureWindowVisibleOnSomeDisplay() {
    const visible = screen.getAllDisplays().some((display) => {
      return windowWithinBounds(display.bounds);
    });
    if (!visible) resetStateToDefault();
  }

  function validateState() {
    const isValid =
      state && (hasBounds() || state.isMaximized || state.isFullScreen);
    if (!isValid) {
      state = null;
      return;
    }
    if (hasBounds() && state.displayBounds) {
      ensureWindowVisibleOnSomeDisplay();
    }
  }

  function updateState(win) {
    win = win || winRef;
    if (!win) return;

    try {
      const winBounds = win.getBounds();
      const display = screen.getDisplayMatching(winBounds);
      // const scale = display.scaleFactor || 1;
      const scale = 1;

      if (isNormal(win)) {
        // Save logical bounds (pixels / scaleFactor)
        state.x = Math.round(winBounds.x / scale);
        state.y = Math.round(winBounds.y / scale);
        state.width = Math.round(winBounds.width / scale);
        state.height = Math.round(winBounds.height / scale);
      }

      state.isMaximized = win.isMaximized();
      state.isFullScreen = win.isFullScreen();
      state.displayBounds = display.bounds;
      state.displayScale = scale;
    } catch (err) {}
  }

  function saveState(win) {
    if (win) updateState(win);
    try {
      mkdirp.sync(path.dirname(fullStoreFileName));
      jsonfile.writeFileSync(fullStoreFileName, state);
    } catch (err) {}
  }

  function stateChangeHandler() {
    clearTimeout(stateChangeTimer);
    stateChangeTimer = setTimeout(updateState, eventHandlingDelay);
  }

  function closeHandler() {
    updateState();
  }

  function closedHandler() {
    unmanage();
    saveState();
  }

  function manage(win) {
    // Apply saved bounds
    if (hasBounds()) {
      try {
        const display = screen.getDisplayNearestPoint({
          x: state.x,
          y: state.y,
        });
        // const scale = display.scaleFactor || 1;
        const scale = 1;

        const scaledBounds = {
          x: Math.round(state.x * scale),
          y: Math.round(state.y * scale),
          width: Math.round(state.width * scale),
          height: Math.round(state.height * scale),
        };

        win.setBounds(scaledBounds);
      } catch (err) {}
    }

    if (config.maximize && state.isMaximized) win.maximize();
    if (config.fullScreen && state.isFullScreen) win.setFullScreen(true);

    win.on("resize", stateChangeHandler);
    win.on("move", stateChangeHandler);
    win.on("close", closeHandler);
    win.on("closed", closedHandler);

    winRef = win;
  }

  function unmanage() {
    if (!winRef) return;
    winRef.removeListener("resize", stateChangeHandler);
    winRef.removeListener("move", stateChangeHandler);
    clearTimeout(stateChangeTimer);
    winRef.removeListener("close", closeHandler);
    winRef.removeListener("closed", closedHandler);
    winRef = null;
  }

  // Load previous state
  try {
    state = jsonfile.readFileSync(fullStoreFileName);
  } catch (err) {}

  validateState();

  // Fallback defaults
  state = Object.assign(
    {
      width: config.defaultWidth,
      height: config.defaultHeight,
    },
    state
  );

  return {
    get x() {
      return state.x;
    },
    get y() {
      return state.y;
    },
    get width() {
      return state.width;
    },
    get height() {
      return state.height;
    },
    get displayBounds() {
      return state.displayBounds;
    },
    get isMaximized() {
      return state.isMaximized;
    },
    get isFullScreen() {
      return state.isFullScreen;
    },
    saveState,
    unmanage,
    manage,
    resetStateToDefault,
  };
};
