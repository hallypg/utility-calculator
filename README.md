# Rental Utility Calculator

A small phone app for landlords who bill tenants for rent plus metered
electricity and water. You key in each unit's meter readings, it works out the
charges, and it produces an invoice image you can send straight into a chat.

It is a web app that installs to the phone's home screen. **There are no
accounts, no server and no running costs** — the data lives in the browser
storage on the phone it is used on, and nothing is ever sent anywhere.

## What it does

- **Units** — a list of the units being managed, each with tenant name and phone
  (tap to call or text).
- **Rent with history** — rent is stored as a series of changes with start
  months, so raising the rent never rewrites invoices already issued.
- **Monthly bills** — enter this month's electricity and water readings; the
  opening readings carry over automatically from the previous month. Usage and
  charges update as you type.
- **Invoice image** — rendered on the phone and handed to the native share
  sheet, so it goes directly into WhatsApp, Messages or email as a picture.
  There is also a plain-text version to copy and paste.
- **History** — every bill by month, with month totals, plus CSV export.
- **Works offline** — once installed, it opens and works with no connection.

## Setting it up for someone

### 1. Publish it

In this repository, go to **Settings → Pages**, set **Source** to *Deploy from a
branch*, pick the branch and the `/ (root)` folder, and save. After a minute the
app is live at:

```
https://<your-github-username>.github.io/utility-calculator/
```

The repository must be public for GitHub Pages to serve it on a free account.
That is fine here: the code contains no data. Every user's records stay on their
own phone.

It can also be served by any static host, or opened straight from a local copy
of `index.html`.

### 2. Have them install it

Send them the link and ask them to add it to their home screen. **This step
matters — it is not cosmetic.** On iPhone, Safari erases a website's stored data
after seven days without a visit, but apps added to the home screen are exempt.
A once-a-month billing app opened in a normal tab could lose its records between
uses.

- **iPhone (Safari):** Share button → *Add to Home Screen*.
- **Android (Chrome):** menu → *Add to Home screen* / *Install app*.

### 3. First run

Open **Settings** and fill in the property name, the electricity and water rates,
the currency symbol, the due day, and a footer note for the invoice (bank details
and so on). Then add units from the **Units** tab.

## Monthly routine

1. Open a unit and tap **Create bill**.
2. Type in the two current meter readings. Previous readings fill themselves in;
   rent and rates are prefilled but can be overridden for that month.
3. Check the running total, then save.
4. Tap **Send invoice image** and pick the tenant's chat.

## Backups

All data is on the phone, which means a lost or wiped phone means lost records.
**Settings → Save backup file** writes a `.json` file to keep somewhere safe —
emailed to yourself, or saved to a cloud drive. **Restore from backup** reads it
back, on the same phone or a new one. The app shows a reminder if no backup has
been taken in 45 days.

`Export history as CSV` produces a spreadsheet of every bill for record-keeping
or tax purposes.

## How the numbers work

```
electricity = (current reading − previous reading) × electricity rate
water       = (current reading − previous reading) × water rate
total       = rent + electricity + water + adjustment
```

An adjustment is an optional extra line — a repair charge, or a negative amount
for a discount or credit.

Each saved bill stores a snapshot of the rates and rent used at the time, so
changing a rate in Settings affects only future bills and never alters history.
A current reading lower than the previous one is blocked, since it is almost
always a typo.

## Project layout

```
index.html              app shell and tab bar
styles.css              all styling, light and dark
js/store.js             data model, storage, calculations
js/invoice.js           invoice drawing and sharing
js/app.js               screens and routing
sw.js                   offline caching
manifest.webmanifest    home-screen install metadata
icons/                  app icons
```

No build step, no dependencies, no framework. Edit a file and reload.

After changing any file in the app shell, bump `CACHE` in `sw.js` so installed
copies pick up the new version.

## Adding cloud sync later

The storage layer is confined to `State` in `js/store.js` — `load`, `save` and
`replaceAll`. Syncing to a cloud drive or hosted database means changing those
three functions and nothing else.
