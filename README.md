# YouTube Queue Extension

This Firefox extension lets you build and manage a **video queue** for YouTube.  
You can paste individual video or playlist links into the options page, add them to a queue, and the extension will automatically load them into an open YouTube tab.

Features:

-   Automatically selects videos to play based on:
    -   Rating
    -   How recently the video was last played

---

# Extension setup

## Create a Google API key

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create an API key.
3. Copy the example environment file and edit it:
   `cp .env-example.json .env.json`
4. Past your API key into .env.json (⚠️ do not check this file into git)

## Install Dependencies

`npm install`

## Load Extension in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click Load Temporary Add-on…
3. Select `manifest.json`.

A new tab should open with a URL like:

`moz-extension://1fca52e4-13ce-4fec-9141-bcb140f4a5c0/options.html`

## Usage

-   Paste a video or playlist link into the options page and click **Add to Queue**.
-   You must already have a YouTube tab open.
    -   If multiple YouTube tabs are open, the extension will talk to the first one.
-   Ensure autoplay is allowed for YouTube:
    1. Go to `www.youtube.com`
    2. Click the permission icon to the left of the URL
    3. Set Autoplay to Allow Audio and Video

## Change Firefox storage settings

-   ⚠️ By default the database is deleted every time you close Firefox or unload the extension.
    -   Use Export often to save your queue.
-   Change default to keep the database:
    -   Set the folowing in `about:config`:
        -   `extensions.webextensions.keepStorageOnUninstall = true`
        -   `extensions.webextensions.keepUuidOnUninstall = true`
