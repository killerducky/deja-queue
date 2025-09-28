const { app, BrowserWindow } = require("electron");

const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: __dirname + "/preload.js", // inject our bridge script
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    // win.loadFile("index.html");
    win.loadURL("https://www.youtube.com");

    setTimeout(() => {
        win.webContents.executeJavaScript("window.ytControl.pause()");
    }, 5000);

    // Get current time
    win.webContents.executeJavaScript("window.ytControl.getTime()").then((t) => console.log("Current time:", t));
};

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
