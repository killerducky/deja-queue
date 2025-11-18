import {
  getVideoIdFromInput,
  addVideoOrPlaylist,
  logAndPlayNext,
  sendMessage,
} from "./options.js";

async function initYoutubeKey() {
  let youtube_api_key = window.electronAPI.get("youtube_api_key");
  if (youtube_api_key) {
    return;
  }

  document.addEventListener("click", async (e) => {
    const link = e.target.closest("a.external-link");
    if (!link) return;

    e.preventDefault();
    await window.electronAPI.openExternal(link.href);
  });

  const dialog = document.getElementById("add-api-key-dialog");
  const form = dialog.querySelector("form");
  const input = form.querySelector("input");

  dialog.showModal();
  // Make it harder to skip this, but not impossible?
  let dismissable = false;
  if (dismissable) {
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        dialog.close();
      }
    });
  }
  form.addEventListener("submit", async (e) => {
    env.youtube_api_key = input.value.trim();
    if (env.youtube_api_key) {
      window.electronAPI.set("youtube_api_key", env.youtube_api_key);
    }
  });
}

function hideYoutubeOnDialog() {
  const dialogObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      console.log("mutate");
      if (
        m.type === "attributes" &&
        m.attributeName === "open" &&
        m.target.tagName === "DIALOG"
      ) {
        const anyOpen = !!document.querySelector("dialog[open]");
        sendMessage({ type: anyOpen ? "hideYoutube" : "showYoutube" });
      }
    }
  });
  dialogObserver.observe(document, {
    attributes: true,
    attributeFilter: ["open"],
    subtree: true,
  });
}

function buttons() {
  const fastForwardBtn = document.getElementById("fastForward");
  const skipBtn = document.getElementById("skip");
  const delayBtn = document.getElementById("delay");
  const pauseBtn = document.getElementById("pause");
  const playBtn = document.getElementById("play");
  const addDialog = document.getElementById("addDialog");
  const addForm = document.getElementById("addForm");
  const addInput = document.getElementById("videoInput");
  const addBtn = document.getElementById("add");

  addBtn.addEventListener("click", () => {
    addInput.value = "";
    addDialog.showModal();
  });
  addDialog.addEventListener("click", (e) => {
    if (e.target === addDialog) {
      addDialog.close();
    }
  });
  addForm.addEventListener("submit", async (e) => {
    const url = addInput.value.trim();
    const response = getVideoIdFromInput(url);
    if (response.foreignKey) {
      addVideoOrPlaylist(response);
    } else {
      console.log("Error: Could not find ID:", url);
    }
  });
  skipBtn.addEventListener("click", async (e) => {
    let params = e.shiftKey ? { skipWholeList: true } : {};
    logAndPlayNext("skip", params);
  });
  delayBtn.addEventListener("click", async (e) => {
    let params = e.shiftKey ? { delayWholeList: true } : {};
    logAndPlayNext("delay", params);
  });
  pauseBtn.addEventListener("click", async () => {
    sendMessage({ type: "pauseVideo" });
  });
  playBtn.addEventListener("click", async () => {
    sendMessage({ type: "resumeVideo" });
  });
  fastForwardBtn.addEventListener("click", async () => {
    sendMessage({ type: "fastForward" });
  });
}

function initHandleDividers() {
  let resizeObserver = null;
  let activeYoutubeDiv;
  function handleDivider(divEl, vert) {
    let isDragging = false;
    const container = divEl.parentElement;
    const divSizeKey = `${divEl.id}-size`;
    const savedSize = window.electronAPI.get(divSizeKey);

    if (savedSize) {
      container.style.setProperty(`--${divSizeKey}`, `${savedSize}px`);
    }

    divEl.addEventListener("mousedown", (e) => {
      isDragging = true;
      document.body.style.cursor = vert ? "row-resize" : "col-resize";
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const rect = container.getBoundingClientRect();
      let newSize = vert ? e.clientY - rect.top : e.clientX - rect.left;

      // Limit resizing range
      const minSize = 250;
      const maxSize = 1000;
      newSize = Math.min(Math.max(newSize, minSize), maxSize);
      container.style.setProperty(`--${divSizeKey}`, `${newSize}px`);
    });

    window.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = "default";

        const currentSize = parseFloat(
          container.style.getPropertyValue(`--${divSizeKey}`)
        );
        window.electronAPI.set(divSizeKey, currentSize);
      }
    });
  }
  document.querySelectorAll(".my-divider").forEach((divEl) => {
    const isVertical = divEl.classList.contains("vertical");
    handleDivider(divEl, isVertical);
  });

  function youtubeDiv() {
    return (
      document.querySelector(".active#youtube-full") ||
      document.getElementById("youtube")
    );
  }

  // Track the currently active div
  activeYoutubeDiv = youtubeDiv();
  startResizeObserver(activeYoutubeDiv);

  // Observe changes in class attributes
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (
        mutation.type !== "attributes" ||
        mutation.attributeName !== "class"
      ) {
        continue;
      }
      const target = mutation.target;
      if (target.classList.contains("active") && target !== activeYoutubeDiv) {
        activeYoutubeDiv = youtubeDiv();
        // Start observing the new active div
        startResizeObserver(activeYoutubeDiv);
      }
    }
  });

  function startResizeObserver(div) {
    // Disconnect previous observer
    if (resizeObserver) resizeObserver.disconnect();

    // Create a new ResizeObserver
    resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const rect = entry.target.getBoundingClientRect();
        const bounds = {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        };

        // Send new size to main process
        electronAPI.sendBroadcast({
          type: "div-resize",
          bounds,
        });
      }
    });

    resizeObserver.observe(div);
  }

  // Observe all tab-content divs
  // TODO: Should really be the youtube divs only
  document.querySelectorAll(".tab-content").forEach((div) => {
    observer.observe(div, { attributes: true });
  });
}

function activateTab(targetId) {
  if (targetId == "Video") {
    targetId = "youtube-full";
  }
  const contents = document.querySelectorAll(".tab-content");
  contents.forEach((c) => c.classList.remove("active"));
  const target = document.querySelector(`#${targetId}`);
  if (target) target.classList.add("active");

  if (targetId !== "youtube-full") {
    document.querySelector("#youtube").classList.add("active");
  }
  sendMessage({ type: "tab-button", targetId });
}

function handleThemeChange() {
  const themeLink = document.getElementById("tabulator-theme");

  function updateTheme() {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    themeLink.href = isDark
      ? "assets/tabulator_site_dark.min.css"
      : "assets/tabulator_site.min.css";
  }

  // Run on load
  updateTheme();

  // Listen for user preference changes
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", updateTheme);
}

function initActivateTab() {
  activateTab(window.electronAPI.get("Layout", "Video"));
  window.electronAPI.onBroadcast(async (msg) => {
    if (msg.type === "menuRadio" && msg.subtype === "Layout") {
      activateTab(msg.value);
    }
  });
}

export function initUI() {
  handleThemeChange();
  hideYoutubeOnDialog();
  initHandleDividers();
  initActivateTab();
  initYoutubeKey();
  buttons();
}
