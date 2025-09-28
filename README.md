Create a google API key
https://console.cloud.google.com/apis/credentials

Create .env (do not check into Git!)

```
API_KEY=YourKeyGoesHere
```

Firefox: Go to `about:debugging#/runtime/this-firefox`

Click "Load Temporary Add-on..."
Add `manifest.json`

It should open a new tab with something like:
`moz-extension://1fca52e4-13ce-4fec-9141-bcb140f4a5c0/options.html`

Paste video or playlist links and click "Add to Queue"
