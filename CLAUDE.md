# Working in this repository

A phone-first web app for billing rental units for rent plus metered
electricity and water. No framework, no build step, no dependencies — edit a
file and reload. See `README.md` for what it does and how it is set up.

## Branching and releases

`main` is what GitHub Pages serves, so it is the live app.

Development happens on this session's `claude/*` branch. **After pushing work
there, fast-forward `main` to the same commit and push it**, otherwise the
published site silently falls behind what was just changed:

```sh
git push -u origin <working-branch>
git branch -f main <working-branch> && git push origin main
```

Both branches should point at the same commit when a change is finished.

## Before pushing

**Bump `CACHE` in `sw.js` and `APP_VERSION` in `js/store.js` together**
(`vN` → `vN+1`) in the same commit as any change to `index.html`, `styles.css`
or a file under `js/`. Without the cache bump the service worker keeps serving
the cached copy and nobody sees the change; `tests/version.test.mjs` fails if
the two drift apart. The version shows at the foot of Settings, which is how a
user reports which build they are actually running.

Run all four suites; they drive the real app in Chromium at phone size:

```sh
npx http-server -p 8765 -s .        # app suites
npx http-server -p 8766 -s -c-1 .   # update suite needs caching off
OUT_DIR=/tmp/out node tests/app.test.mjs
OUT_DIR=/tmp/out node tests/backup.test.mjs
OUT_DIR=/tmp/out node tests/i18n.test.mjs
node tests/update.test.mjs
node tests/version.test.mjs    # no server needed
```

Read the screenshots they write to `OUT_DIR`. Two real bugs in this repo were
visible there while every assertion passed.

## Things that bite

- **A class that sets `display` beats the `hidden` attribute.** This hid
  nothing twice — a confirmation box that was always open, and a button that
  would not retire — because `.confirm` and `.btn` set a display value.
  `styles.css` now carries a global `[hidden] { display: none !important; }`;
  leave it there.
- **Billing is in arrears, and three things follow from it.** A bill's `month`
  is the usage month; its rent covers `month + 1`; its due date runs from
  `issuedOn`, never from `month`, which would already have passed. The Units
  screen and the new-bill form both anchor on `billingMonth()`, the month just
  gone, not on today's month.
- **Both language blocks in `js/i18n.js` must hold the same keys.** The i18n
  suite fails if an untranslated key reaches the screen, but a key missing from
  one language only shows as English text in a Vietnamese app.
- **Don't use native form controls for anything dated.** `<input type="month">`
  is drawn by the OS in the phone's language, not the app's. The month picker is
  built from two selects for this reason; please don't swap it back.
- **Storage is the only copy of a user's data.** Anything that changes the shape
  of saved data needs a migration in `State.migrate` / `migrateUnit`, not a
  version bump that discards it.
- **Bump the version in three files together**: `CACHE` in `sw.js`,
  `APP_VERSION` in `js/store.js`, and `version.json`. `tests/version.test.mjs`
  fails if any drift. The Settings check compares `version.json` from the
  network against `APP_VERSION`, which is the only comparison a stale cache
  cannot fool.
- **`cache.addAll` in the worker's install must use `new Request(path,
  { cache: 'reload' })`.** Plain `addAll` fetches through the browser's HTTP
  cache, so on a host that holds files for minutes — GitHub Pages holds them
  ten — a new worker fills its brand-new cache with the *previous* version's
  files. The cache name advances, the app does not, and no amount of checking
  for updates helps.
- **An update check can be answered from the browser's HTTP cache.** GitHub
  Pages serves `sw.js` with a ten-minute max-age, and a browser will happily
  answer `registration.update()` from that copy, reporting no update when one
  has shipped. The worker is registered with `updateViaCache: 'none'` and the
  manual check refetches `sw.js` with `cache: 'reload'` first. Don't remove
  either; a check that lies is worse than no check.
- **The service worker must never wait to be asked to activate.** It once held
  back until the page sent it a message, which stranded anyone whose cached
  page predated the code that sends it: the page could not ask, so it was
  served the stale cache on every reload, forever. It now calls `skipWaiting`
  on install, and the page offers a reload afterwards instead.
- Each saved bill snapshots the rent and rates it was created with. Changing a
  rate or a unit's rent must never alter a bill already issued.
- **A unit's bills are a chain: each one's closing readings are the next one's
  opening.** The month picker can reach five years back and two forward, so
  bills do not arrive in order. Two rules follow. The new-bill form recomputes
  its opening from whichever month is *picked*, not the month it opened on, and
  leaves alone any opening that has been typed over. And saving a bill that has
  a later bill after it offers to carry that one on, because a later bill
  written before this one still opens from older readings and the stretch
  between them would be charged twice. Changing a closing reading or deleting a
  bill breaks the same chain and is not covered yet.
- **Nothing a save does may be written before the last question is answered.**
  The overlap question above has three outcomes, so it is an in-app box with a
  button each, not `confirm` — people read Cancel as "take me back", and an
  OK/Cancel box cannot say which of three things Cancel means. Deleting the
  bill a save replaces used to happen before that question, so backing out
  would have destroyed it. All of it now runs in one `commit()` after the last
  answer.
