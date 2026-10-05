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

**Bump `CACHE` in `sw.js`** (`rental-utility-vN` → `vN+1`) in the same commit as
any change to `index.html`, `styles.css` or a file under `js/`. Without it the
service worker keeps serving the cached copy and nobody sees the change.

Run all four suites; they drive the real app in Chromium at phone size:

```sh
npx http-server -p 8765 -s .        # app suites
npx http-server -p 8766 -s -c-1 .   # update suite needs caching off
OUT_DIR=/tmp/out node tests/app.test.mjs
OUT_DIR=/tmp/out node tests/backup.test.mjs
OUT_DIR=/tmp/out node tests/i18n.test.mjs
node tests/update.test.mjs
```

Read the screenshots they write to `OUT_DIR`. Two real bugs in this repo were
visible there while every assertion passed.

## Things that bite

- **Both language blocks in `js/i18n.js` must hold the same keys.** The i18n
  suite fails if an untranslated key reaches the screen, but a key missing from
  one language only shows as English text in a Vietnamese app.
- **Don't use native form controls for anything dated.** `<input type="month">`
  is drawn by the OS in the phone's language, not the app's. The month picker is
  built from two selects for this reason; please don't swap it back.
- **Storage is the only copy of a user's data.** Anything that changes the shape
  of saved data needs a migration in `State.migrate` / `migrateUnit`, not a
  version bump that discards it.
- Each saved bill snapshots the rent and rates it was created with. Changing a
  rate or a unit's rent must never alter a bill already issued.
