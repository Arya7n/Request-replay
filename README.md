# RequestReplay

A failed request is annoying to reconstruct by hand, and copying it out of DevTools often takes a token or cookie with it. RequestReplay is a DevTools panel for the page you already have open. It lists that session's requests, redacts likely secrets, and copies a bash curl command. Two responses can be compared by status, headers, and JSON or text.

The panel only sees the inspected page, and only while DevTools is open. Reload if the call happened before DevTools opened. History stays off until you enable it, and stored copies are redacted first. The compare API keeps nothing.

## Run it

```bash
npm install
npm test
npm run build
npm run api
```

In Chrome, open `chrome://extensions`, turn on Developer mode, and load `.output/chrome-mv3`. Open DevTools on a page and choose RequestReplay, then reload that page. `npm run demo` serves `http://127.0.0.1:4173` with dummy credentials so you can see redaction. The redacted curl should get 401. Showing sensitive values and copying again should get 200.

`npm run api` listens on `http://127.0.0.1:3000`. If it is down, inspection and curl still work, and comparison runs in the panel with a note. `PORT` and `ALLOWED_ORIGIN` override the defaults. The allowed origin is this extension's id.

## Next

- Read the curl command before you paste it. Redaction is a heuristic.
- Leave history off unless you want a redacted copy on this profile.
- On Render, run `npm run api` with the platform `PORT` and `ALLOWED_ORIGIN` set to `chrome-extension://jalnnfhdjdmoibmlogjpcgaaoclolihe`.
