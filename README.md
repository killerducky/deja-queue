# YouTube Queue Electron App

This Electron app lets you build and manage a **video queue** for YouTube.  
You can paste individual video or playlist links, add them to a queue, and the videos automatically start playing.

Features:

- Automatically selects videos to play based on:
  - Rating
  - How recently the video was last played

---

# Setup

## Create a Google API key

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create an API key.
3. Copy the example environment file and edit it:
   `cp .env-example.json .env.json`
4. Past your API key into .env.json (⚠️ do not check this file into git)

## Install Dependencies and build/run

`npm install`
`npm start`

## Usage

- Paste a video or playlist link into the options page and click **Add to Queue**.
- You must already have a YouTube tab open.
  - If multiple YouTube tabs are open, the extension will talk to the first one.
- Ensure autoplay is allowed for YouTube:
  1. Go to `www.youtube.com`
  2. Click the permission icon to the left of the URL
  3. Set Autoplay to Allow Audio and Video
