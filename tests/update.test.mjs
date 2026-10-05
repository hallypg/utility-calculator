/* Simulates shipping a new version while the app is open, and checks the
   in-app update prompt appears and applies. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8766';
const SW = 'sw.js';
const original = fs.readFileSync(SW, 'utf8');
// Derived, not hardcoded, so bumping the cache in sw.js never breaks this test.
const CURRENT = original.match(/const CACHE = '([^']+)'/)[1];
const NEXT = CURRENT + '-next';
const errors = [];
const step = async (n, f) => { try { await f(); console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ' :: ' + e.message); errors.push(n + ': ' + e.message); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

try {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });

  await step('service worker takes control', async () => {
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    const names = await page.evaluate(() => caches.keys());
    if (!names.includes(CURRENT)) throw new Error('caches: ' + JSON.stringify(names));
  });

  await step('no update prompt when nothing has shipped', async () => {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForTimeout(800);
    if (await page.locator('.toast.tappable').count()) throw new Error('prompted with no new version');
  });

  await step('shipping a new version raises the prompt', async () => {
    // A marker that only survives while this page is still the one loaded.
    await page.evaluate(() => { window.__notReloaded = true; });
    fs.writeFileSync(SW, original.replace(CURRENT, NEXT));
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForSelector('.toast.tappable.show', { timeout: 15000 });
    const label = await page.textContent('.toast.tappable');
    if (!/tap to update/i.test(label)) throw new Error('prompt reads "' + label + '"');
  });

  await step('the new worker takes over without being asked', async () => {
    // It must not need a message from the page: a page running older code
    // cannot send one, and used to be stranded on the stale cache forever.
    await page.waitForFunction(async name => (await caches.keys()).includes(name),
      NEXT, { timeout: 15000 });
    await page.waitForFunction(async name => !(await caches.keys()).includes(name),
      CURRENT, { timeout: 15000 });
  });

  await step('the Settings button applies an update without a second tap', async () => {
    // Back to the current worker, so the next check has something new to find.
    fs.writeFileSync(SW, original);
    await page.goto(BASE + '/index.html#/settings', { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#check-updates');
    await page.evaluate(() => { window.__stillHere = true; });

    const AGAIN = NEXT + '-again';
    fs.writeFileSync(SW, original.replace(CURRENT, AGAIN));
    await page.click('#check-updates');

    // A check the person asked for reloads itself rather than prompting.
    await page.waitForFunction(() => window.__stillHere === undefined, null, { timeout: 25000 });
    await page.waitForFunction(async name => (await caches.keys()).includes(name),
      AGAIN, { timeout: 15000 });

    // Put the worker back where the remaining steps expect it.
    fs.writeFileSync(SW, original.replace(CURRENT, NEXT));
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await page.evaluate(() => { window.__notReloaded = true; });
  });

  await step('the page is left alone until tapped', async () => {
    if (!(await page.evaluate(() => window.__notReloaded === true)))
      throw new Error('the page reloaded on its own');
  });

  await step('tapping it reloads onto the new version', async () => {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }),
      page.click('.toast.tappable')
    ]);
    if (await page.evaluate(() => window.__notReloaded === true))
      throw new Error('tapping did not reload');
  });

  await step('the prompt is gone afterwards', async () => {
    await page.waitForTimeout(500);
    if (await page.locator('.toast.tappable').count()) throw new Error('prompt still showing');
  });

  await step('data survived the update', async () => {
    const ok = await page.evaluate(() => !!localStorage.getItem('rmu.v1'));
    if (!ok) throw new Error('storage cleared by the update');
  });
} finally {
  fs.writeFileSync(SW, original);
  await browser.close();
}

console.log('\n--- errors (' + errors.length + ') ---');
errors.forEach(e => console.log(e));
process.exit(errors.length ? 1 : 0);
