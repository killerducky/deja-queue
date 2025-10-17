## VIP user

- [ ] full screen playlist/database
- [x] 3rd playlist has no title, no thumb
- [ ] add playlist - should add to queue as PL, not individual songs
- [ ] thumb with weird aspect ratio -- tabulator doing something?
- [x] don't allow sort queue
- [?] playlist mode -- do not autoqueue single songs
- [x] click on current song thumb should not reload the youtube page
  - [x] But I think now it's resulting in timeouts!
- [ ] filter X should be there even when not in focus

## Playlists

- [ ] Skip playlist does not always(?) reset the current track number
- [ ] Make title, etc editable
- [ ] Adding the same playlist should not overwrite fields
  - [ ] Rating(!), DateAdded
- [ ] Deleted songs in playlist should not be added
- [ ] Remove videoCnt field, replace with computed field
- [x] Same video in multiple playlists
- [ ] refresh should not change current playing song
- [x] Clicking playlist _moves_ in queue instead of adding another one
- [ ] Playlist should not pop single songs out into the queue
- [ ] Go backwards in playlist / reset playlist
- [ ] log doesn't show track number
- [ ] log doesn't show playlists

## UI

- [ ] restore window size bug
  - [ ] config if sidebar expands on hover or not
- [ ] shift-click to insta play
- [ ] Pasting into Add to Queue -- popup for video/playlist
- [ ] 404 thumbs
  - [x] That one playlist has a 404 thumb?
- [ ] trick youtube to play songs back to back
- [x] Adding new videos should update playlist/DB/etc
- [ ] Q mode dropdown is rounded weirdly
- [ ] visual bar graph or star system for ratings
- [ ] import/export db into file menu
- [ ] delay/skip song buttons in the queue?

## Stats/Algorithm

- [ ] graphs.js DRY
- [ ] config params in .json file
- [x] Graph scores of several illustrative cases
  - [ ] User can live adjust params?!
- [x] Lower impact of rating (due becomes relatively more important)

## Misc

- [x] github rename to deja-queue -- github does 403 redirect indefinitely
- [ ] msg: {"type":"videoPlaying","duration":null,"url":"https://www.youtube.com/watch?v=t9y9TtMVJkk"}
- [ ] msg: {"type":"videoPlaying","duration":null,"url":"https://www.youtube.com/watch?v=u9i_ZWcDHHQ&t=1s"}
  - [ ] youtube was erroring

## Tagline ideas

“Play it like you’ve heard it before.”
“Your queue, reborn.”
“Mixes that feel familiar.”
“Because good songs deserve déjà vu.”
“DejaQueue — play it again.”

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
