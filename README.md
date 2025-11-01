# DejaQueue

Your YouTube queue, reimagined.

DejaQueue simplifies managing videos and playlists by automatically choosing the next video to play, letting you focus on watching—not searching.

## Why DejaQueue?

- Auto-plays next video based on ratings/play history
- Create and manage queues from videos or playlists
- Quick search, tagging, and playback controls in one app

## Quick Start (Windows)

1. Download the latest [release](https://github.com/killerducky/deja-queue/releases)
1. Unzip and run `deja-queue.exe`
1. Enter a YouTube API key (see below)

## Get a Google API Key

1. Visit [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Click **Create credentials** → **API key**
3. Use default settings, then copy your key

## How to Use

- Right-click YouTube videos → **Add to Queue**
- Or paste video/playlist links using "Add URL"
- Playback auto-selects next video based on your preferences

## Development

```bash
git clone https://github.com/killerducky/deja-queue
npm install
npm start
```
