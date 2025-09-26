console.log("background");
browser.runtime.onInstalled.addListener(() => {
    console.log("Extension installed, opening options page…");
    browser.runtime.openOptionsPage();
});
