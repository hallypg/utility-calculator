# Tests

Browser tests driven by Playwright. They exercise the real app in Chromium at
phone viewport: creating units, calculating a bill, rendering the invoice image,
carrying readings between months, and the backup/restore round trip.

```sh
npx http-server -p 8765 -s .     # serve the app from the repo root
OUT_DIR=/tmp/out node tests/app.test.mjs
OUT_DIR=/tmp/out node tests/backup.test.mjs
```

`OUT_DIR` is where screenshots and downloaded files are written.
Both scripts exit non-zero if anything fails.
