## VIP user

- [x] Adding new playlist is broken!!!
- [x] TV high res is screwing the restore bounds command
- [x] use electron-window-state library -- see if VIP user issue fixed
- [x] chatgpt modify electron-window-state
- [x] recreated and verified on my own machine, but still weird
- [ ] Smaller window size support
- [ ] add playlist - should add to queue as PL, not individual songs
- [ ] click on single song inside a playlist should skip to that song
- [ ] filter playlists and only queue those playlists
- [ ] full screen playlist/database
- [ ] thumb with weird aspect ratio -- tabulator doing something?
- [ ] filter X should be there even when not in focus
- [ ] API Key should be "invisible"
- [ ] manual rating change does not work

## DB

- [ ] get rid of using DBDATA.queue as the DB!!
- [ ] Use change to move to DB library instead of my own db.js
- [ ] spotify/local
  - [x] local Kinda working, but DB migration is manual only -- beware!
  - [ ] trimYoutube, trimLocal, not very safe right now!

## Playlists

- [x] general improvement of playlists in queue/log
- [x] log doesn't show track number
- [x] log doesn't show playlists
- [ ] Playlist should not pop single songs out into the queue
- [ ] Skip playlist does not always(?) reset the current track number
- [ ] Make title, etc editable
- [ ] Adding the same playlist should not overwrite fields
  - [ ] Rating(!), DateAdded
- [ ] Deleted songs in playlist should not be added
- [ ] Remove videoCnt field, replace with computed field
- [ ] refresh should not change current playing song / playlist
- [ ] Go backwards in playlist / reset playlist

## UI

- [ ] skip/defer in queue/database
- [ ] multi row select
- [ ] shift-click to insta play
- [ ] Pasting into Add to Queue -- popup for video/playlist
- [ ] 404 thumbs
- [ ] Q mode dropdown is rounded weirdly
- [ ] visual bar graph or star system for ratings
- [ ] When last played changes (and maybe other things?), recalculate score
  - [ ] Score is supposed to be semi-stable so don't just always recalculate

## Stats/Algorithm

- [ ] graphs.js DRY
- [ ] config params in .json file
  - [ ] User can live adjust params?!
- [ ] Combine jitter and delay
  - [ ] And show as a number in the delay column

## Tagline ideas

“Play it like you’ve heard it before.”
“Your queue, reborn.”
“Mixes that feel familiar.”
“Because good songs deserve déjà vu.”
“DejaQueue — play it again.”

## Done 2025-10-20 v0.0.3

- [x] change rating of playlist in the queue bug -- only when filtered
- [x] Walk user through API key, dialog, store local.
- [x] Better release process
- [x] volume for dual youtubes
- [x] drag divider for sidebar/youtube
- [x] trick youtube to play songs back to back
- [x] import/export db into file menu

## Done 2025-10-17

- [x] github rename to deja-queue -- github does 403 redirect indefinitely
- [x] (Over)Dues -- reverse x-axis so future items are to the right
- [x] 3rd playlist has no title, no thumb
- [x] don't allow sort queue
- [?] playlist mode -- do not autoqueue single songs
- [x] click on current song thumb should not reload the youtube page
  - [x] But I think now it's resulting in timeouts!
- [x] Same video in multiple playlists
- [x] Clicking playlist _moves_ in queue instead of adding another one
- [x] Lower impact of rating (due becomes relatively more important)
- [x] Graph scores of several illustrative cases
- [x] Adding new videos should update playlist/DB/etc
  - [x] That one playlist has a 404 thumb?

## Done 2025-10-12

- [x] On startup, play button doesn't work
- [x] Total playlist duration
- [x] Allow multiple YTs.
- [x] Don't open graphs by default.
- [x] Fix Current Song for playlist mode bootup
- [x] right click menu -- copy URL
- [x] table column picker/sizer/save/restore
- [x] Youtube window placement more responsive
- [x] multiple youtube explorers

## YT/Spotify/Local

```
      "uuid": "FJ0XmxA3SyU",
      "source": "local" | "youtube" | "spotify"
      "id": "FJ0XmxA3SyU", : "C:/path/to/file"
      "playlistId": "RDGMEMR48zJN_YMORCOLhrAwXwKwVMoNCOyZNMeWE",  // don't even need this!
      "rating": 5,
      "yt": { },
      "scrapedDuration": 73.881,
      "lastPlayDate": 1759787562635,
      "delay": true,
      "channelTitle": "Tribal Trap"
```
