# Tests

Browser tests driven by Playwright. They exercise the real app in Chromium at
phone viewport: creating units, calculating a bill, rendering the invoice image,
carrying readings between months, and the backup/restore round trip.

```sh
npx http-server -p 8765 -s .     # serve the app from the repo root
OUT_DIR=/tmp/out node tests/app.test.mjs
OUT_DIR=/tmp/out node tests/backup.test.mjs
OUT_DIR=/tmp/out node tests/i18n.test.mjs
node tests/version.test.mjs         # no browser or server needed

npx http-server -p 8766 -s -c-1 .   # a second server, caching disabled
node tests/update.test.mjs
```

Playwright must be resolvable from the repo (`npm i -D playwright &&
npx playwright install chromium`).

`update.test.mjs` rewrites `sw.js` to simulate a deploy against a live page,
then checks the update prompt appears, that it stays away when nothing has
shipped, that the old cache keeps serving until the tap, and that applying it
preserves stored data. It restores `sw.js` when it finishes, and needs its own
server on port 8766 with caching disabled so the browser sees the edited worker.

`i18n.test.mjs` runs the app twice, in a browser context set to `vi-VN` and one
set to `en-GB`, checking language detection, Vietnamese number and currency
formatting, the translated invoice, switching language without losing data, and
that no untranslated key reaches the screen.

`OUT_DIR` is where screenshots and downloaded files are written.
Both scripts exit non-zero if anything fails.
