Create a google API key
https://console.cloud.google.com/apis/credentials

Copy .env-example.json to .env.json (do not check into Git!) and edit the key.

Firefox: Go to `about:debugging#/runtime/this-firefox`

Click "Load Temporary Add-on..."
Add `manifest.json`

It should open a new tab with something like:
`moz-extension://1fca52e4-13ce-4fec-9141-bcb140f4a5c0/options.html`

Paste video or playlist links and click "Add to Queue"

You must have another tab open on youtube. If you have multiple youtube tabs open it talks to the first one.
Ensure firefox is not blocking auto start for youtube
`about:preferences` search "Autoplay", "Allow Audio and Video" default, or for youtube.

Big gotcha: The DB is deleted every time you close Firefox or unload the extension! Use Export often!

about:config

extensions.webextensions.keepStorageOnUninstall = true
extensions.webextensions.keepUuidOnUninstall = true
