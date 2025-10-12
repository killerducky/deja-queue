# DejaQueue

Build and manage a **video queue** for YouTube.  
Paste individual video or playlist links, add them to your queue, and the app will automatically start playback.

Features:

- Automatically selects videos to play based on:
  - Rating
  - How recently each video was last played
- Playback control directly within the app

---

# Setup

## Create a Google API key

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create an API key.
3. Copy the example environment file:
   `cp .env-example.json .env.json`
4. Paste your API key into .env.json
   - ⚠️ do not check this file into git

## Install and run

`npm install`

`npm start`

## Usage

- Right click on videos in the youtube player to **Add to Queue**
- Or paste a video/playlist link from external youtube and **Add to Queue**
- The app will automatically select and play the next video based on your ratings and play history.
