# Rental Utility Calculator

A small phone app for landlords who bill tenants for rent plus metered
electricity and water. You key in each unit's meter readings, it works out the
charges, and it produces an invoice image you can send straight into a chat.

It is a web app that installs to the phone's home screen. **There are no
accounts, no server and no running costs** — the data lives in the browser
storage on the phone it is used on, and nothing is ever sent anywhere.

## What it does

- **Units** — a list of the units being managed, each with tenant name, address
  and phone (tap to call or text), split into those that still need a bill for
  the month being billed and those that have one. A summary at the top shows
  how much is awaiting payment and how many units are left to bill.
- **Paid / unpaid** — each bill carries a paid flag, set from its invoice. What
  is still owed shows against the unit and in the month totals.
- **Rent per unit** — one monthly amount on the unit, edited whenever it
  changes. Each saved bill keeps a snapshot of the rent it was created with, so
  raising the rent never rewrites invoices already issued.
- **Monthly bills** — electricity and water each get their own card with its
  rate, last and this month's readings side by side, and a running usage × rate
  line. Opening readings carry over from the previous month, or from the
  starting readings entered when the unit was created. The total updates as you
  type, in a bar pinned above the tab bar.
- **Invoice screen** — the bill as the tenant sees it: amount, due date, who it
  is for, line items with meter movements, and the payment note from Settings.
- **Invoice image** — *Send image* renders the invoice on the phone and hands it
  to the native share sheet, so it goes into WhatsApp, Messages or email as a
  picture. There is also a plain-text version to copy and paste.
- **History** — every bill by month, with month totals, plus CSV export.
- **Works offline** — once installed, it opens and works with no connection.
- **English and Vietnamese** — the app picks the phone's language on first run
  and can be switched any time in Settings. The invoice image is translated too,
  so tenants read it in their own language.

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

### 2. Have them install it — before entering any data

Send them the link and ask them to add it to their home screen **first, before
typing anything in**. This step is not cosmetic, for two separate reasons.

**A home-screen app has its own storage, separate from the browser.** Data
entered in a browser tab does not carry over when the app is later installed —
the installed app opens empty, which looks exactly like data loss. Install
first, enter data second.

**On iPhone, stored data is deleted after seven days without a visit.** That is
iOS's cap on script-writable storage, and it applies to sites opened in a
browser. A home-screen web app runs in its own container with its own usage
counter and is exempt. A once-a-month billing app used in a plain tab would lose
its records between uses.

- **iPhone:** Share button → *Add to Home Screen*. Safari is the simplest route
  to recommend, though since iOS 16.4 Chrome, Edge and Firefox can also create
  real home-screen web apps. On iOS before 16.4, only Safari can — other
  browsers add a plain bookmark, which does not get the protections above.
- **Android (Chrome):** menu → *Add to Home screen* / *Install app*.

Worth warning them: clearing the browser's website data can also clear the
home-screen app's data. Keep backups (see below).

### 3. First run

Open **Settings** and fill in the language, the electricity and water rates, the
currency symbol, the due day, and a footer note for the invoice (bank details and
so on). Then add units from the **Units** tab.

On a phone set to Vietnamese the app starts in Vietnamese with VND conventions —
the `₫` symbol after the amount and no decimal places. All of that is editable.

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
total       = rent + electricity + water
```

**Bills are raised in arrears.** A bill created in November covers October's
electricity and water, and November's rent — so the rent line names a
different month from the meter readings, deliberately. The month a new bill
opens on is the month just gone, and the Units screen groups by that same
month.

The due date runs from the day the bill was issued, not from the usage month,
which would otherwise have passed before the invoice was written. Settings
holds the number of days.


Each saved bill stores a snapshot of the rates and rent used at the time, so
changing a rate in Settings, or a unit's rent, affects only future bills and
never alters history.
A current reading lower than the previous one is blocked, since it is almost
always a typo.

## Screen layout

The screens follow a design canvas made separately as a wireframe: the layout
and the information on each screen come from it, the visual styling does not.
Primary actions sit in a bar pinned above the tab bar rather than scrolling with
the content, and Settings is reached from the tab bar rather than the header.

## Project layout

```
index.html              app shell and tab bar
styles.css              all styling, light and dark
js/store.js             data model, storage, calculations
js/i18n.js              translations and locale formatting
js/invoice.js           invoice drawing and sharing
js/app.js               screens and routing
sw.js                   offline caching
manifest.webmanifest    home-screen install metadata
icons/                  app icons
```

No build step, no dependencies, no framework. Edit a file and reload.

## Shipping an update

**Bump `CACHE` in `sw.js`** (e.g. `rental-utility-v5` → `v6`) in the same commit
as any change to `index.html`, `styles.css` or a file in `js/`. Without that the
service worker keeps serving the cached copy and nobody sees the change.

An app launched from the home screen has no address bar and no reload button, so
the app handles the rest itself. On launch, and whenever it returns to the
foreground, it checks for a new version and shows a tappable **"New version
available"** prompt when one is ready. The running version is left alone until
the person taps, so an update never swaps files out while someone is part-way
through entering a bill. Tapping applies it and reloads.

**Settings → App → Check for updates** asks the server on demand, reporting
either the update prompt or that this is the latest version. The version it
shows above the button is what a user should quote when reporting a problem,
since a stale build and a real bug look identical from the outside.

Failing that, fully closing the app — App Switcher on iPhone, Recents on
Android — and reopening it forces a check too.

In a browser that has no service worker (Chrome, Firefox and Edge on iOS, which
all use WKWebView without the browser entitlement) the button simply reloads,
since nothing is cached by the app there in the first place.

Deleting and re-adding the home-screen icon also forces an update, but it
**destroys the stored records**, because a home-screen app's storage goes with
it. Take a backup first if there is no other option.

Stored data is unaffected by ordinary updates; it is keyed separately from the
cached code.

## Adding another language

Everything users see comes from `js/i18n.js`. Add a block to `STRINGS` keyed by
language code, copying the `en` block and translating the values, then add an
entry to `LANGUAGES` and a locale to `LOCALES`. The locale drives date, month
and number formatting, so separators and month names follow automatically.

Nothing else needs touching — the Settings picker is built from `LANGUAGES`, and
`tests/i18n.test.mjs` checks that no untranslated key leaks into the UI.

Note the month picker is built in-app from two `<select>`s rather than using
`<input type="month">`. A native date control is drawn by the operating system
in the *phone's* language, which left English month names sitting inside a
Vietnamese screen. Please don't swap it back for the native input.

A few things still come from the OS and cannot be translated by the page: the
buttons in confirm and alert dialogs, the file picker used by Restore, and the
on-screen keyboard. They follow the phone's own language setting.

## Adding cloud sync later

The storage layer is confined to `State` in `js/store.js` — `load`, `save` and
`replaceAll`. Syncing to a cloud drive or hosted database means changing those
three functions and nothing else.
