/* Simulates shipping a new version while the app is open, and checks the
   in-app update prompt appears and applies. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8766';
const SW = 'sw.js';
const original = fs.readFileSync(SW, 'utf8');
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
    if (!names.includes('rental-utility-v5')) throw new Error('caches: ' + JSON.stringify(names));
  });

  await step('no update prompt when nothing has shipped', async () => {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForTimeout(800);
    if (await page.locator('.toast.tappable').count()) throw new Error('prompted with no new version');
  });

  await step('shipping a new version raises the prompt', async () => {
    fs.writeFileSync(SW, original.replace('rental-utility-v5', 'rental-utility-v6'));
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForSelector('.toast.tappable.show', { timeout: 15000 });
    const label = await page.textContent('.toast.tappable');
    if (!/tap to update/i.test(label)) throw new Error('prompt reads "' + label + '"');
  });

  await step('the old version is still running until tapped', async () => {
    const names = await page.evaluate(() => caches.keys());
    if (!names.includes('rental-utility-v5')) throw new Error('old cache dropped early');
  });

  await step('tapping it applies the update and reloads', async () => {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }),
      page.click('.toast.tappable')
    ]);
    await page.waitForFunction(async () => (await caches.keys()).includes('rental-utility-v6'),
      null, { timeout: 15000 });
    await page.waitForFunction(async () => !(await caches.keys()).includes('rental-utility-v5'),
      null, { timeout: 15000 });
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
