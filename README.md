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

- When you first launch, a dialog will give instructions on how to get a Google API key.
  - Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
  - Click the **Create credentials** dropdown.
  - Select **API key**, keep the default options, and click **Create**.
  - You'll need to provide this key when you first run DejaQueue

## Install and run

`npm install`

`npm start`

## Usage

- Right click on videos in the youtube player to **Add to Queue**
- Click **Add URL** button and paste a video/playlist link
- The app will automatically select and play the next video based on your ratings and play history.
