import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8765';
const SHOT = process.env.OUT_DIR || '.';
const errors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true
});
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

const step = async (name, fn) => {
  try { await fn(); console.log('  ok  ' + name); }
  catch (e) { console.log('  FAIL ' + name + ' :: ' + e.message); errors.push(name + ': ' + e.message); }
};

await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });

await step('empty state renders', async () => {
  await page.waitForSelector('text=No units yet');
});

await step('save settings', async () => {
  await page.click('[data-tab="settings"]');
  await page.fill('#s-prop', 'Jalan Melati Rentals');
  await page.fill('#s-land', 'H. Pang');
  await page.fill('#s-er', '0.52');
  await page.fill('#s-wr', '1.35');
  await page.fill('#s-cur', 'RM');
  await page.fill('#s-due', '15');
  await page.fill('#s-note', 'Bank transfer to Maybank 5141-2233-9087. Thank you!');
  await page.click('#set-form button[type="submit"]');
  await page.waitForSelector('.toast.show');
});

await step('add two units', async () => {
  await page.click('[data-tab="units"]');
  await page.click('a[href="#/unit/new"]');
  await page.fill('#f-label', 'A1');
  await page.fill('#f-tenant', 'Sarah Lim');
  await page.fill('#f-phone', '+60 12-345 6789');
  await page.fill('#f-rent', '1200');
  await page.click('#unit-form button[type="submit"]');
  await page.waitForSelector('text=Current rent');

  await page.click('[data-tab="units"]');
  await page.click('.icon-btn[href="#/unit/new"]');
  await page.fill('#f-label', 'B2');
  await page.fill('#f-tenant', 'Daniel Teoh');
  await page.fill('#f-phone', '+60 19-888 1234');
  await page.fill('#f-rent', '950');
  await page.click('#unit-form button[type="submit"]');
  await page.waitForSelector('text=Current rent');
});

await step('rates prefill the new bill', async () => {
  await page.click('[data-tab="units"]');
  await page.click('text=A1');
  await page.click('a.btn.primary');
  const er = await page.inputValue('#b-er');
  const wr = await page.inputValue('#b-wr');
  const rent = await page.inputValue('#b-rent');
  if (er !== '0.52' || wr !== '1.35') throw new Error(`rates not prefilled: ${er}/${wr}`);
  if (rent !== '1200') throw new Error('rent not prefilled: ' + rent);
});

await step('live total is correct', async () => {
  await page.fill('#b-ep', '4200');
  await page.fill('#b-ec', '4512');
  await page.fill('#b-wp', '880');
  await page.fill('#b-wc', '914');
  // 312 * 0.52 = 162.24 ; 34 * 1.35 = 45.90 ; + 1200 = 1408.14
  await page.waitForFunction(() =>
    document.querySelector('#readout .total span:last-child')?.textContent.includes('1,408.14'));
});

await step('backwards reading is blocked', async () => {
  await page.fill('#b-ec', '4100');
  await page.waitForSelector('#bill-err .banner');
  await page.click('#bill-form button[type="submit"]');
  await page.waitForTimeout(250);
  if (page.url().includes('/invoice/')) throw new Error('saved despite a backwards reading');
  await page.fill('#b-ec', '4512');
  await page.waitForTimeout(100);
  if (await page.locator('#bill-err .banner').count()) throw new Error('error did not clear');
});

await step('save bill then invoice renders', async () => {
  await page.click('#bill-form button[type="submit"]');
  await page.waitForURL(/#\/invoice\//);
  await page.waitForFunction(() => {
    const img = document.getElementById('inv-preview');
    return img && img.src.startsWith('data:image/png') && img.naturalHeight > 400;
  }, null, { timeout: 5000 });
});

await step('invoice screenshot', async () => {
  const src = await page.getAttribute('#inv-preview', 'src');
  const b64 = src.split(',')[1];
  const fs = await import('node:fs');
  fs.writeFileSync(SHOT + '/invoice.png', Buffer.from(b64, 'base64'));
});

await step('invoice text copy is well formed', async () => {
  const txt = await page.evaluate(async () => {
    const mod = await import('./js/invoice.js');
    const store = await import('./js/store.js');
    const bill = store.State.data.bills[0];
    return mod.invoiceText(bill, store.findUnit(bill.unitId));
  });
  for (const want of ['TOTAL DUE: RM1,408.14', 'Electricity: 312 kWh', 'Water: 34 m³', 'Rent: RM1,200.00']) {
    if (!txt.includes(want)) throw new Error('missing "' + want + '" in:\n' + txt);
  }
});

await step('second month carries the opening readings', async () => {
  await page.goto(BASE + '/index.html#/bill/' + await page.evaluate(async () => {
    const s = await import('./js/store.js');
    return s.State.data.bills[0].unitId;
  }) + '/2026-11');
  await page.waitForSelector('#b-ep');
  const ep = await page.inputValue('#b-ep');
  const wp = await page.inputValue('#b-wp');
  if (ep !== '4512' || wp !== '914') throw new Error(`carry-over wrong: ${ep}/${wp}`);
  await page.waitForSelector('text=carried over from');
});

await step('rent change does not rewrite past bills', async () => {
  const unitId = await page.evaluate(async () => (await import('./js/store.js')).State.data.bills[0].unitId);
  await page.goto(BASE + '/index.html#/unit/' + unitId);
  await page.fill('#r-amt', '1300');
  await page.fill('#r-from', '2026-11');
  await page.click('#rent-form button[type="submit"]');
  await page.waitForTimeout(200);
  const res = await page.evaluate(async () => {
    const s = await import('./js/store.js');
    const old = s.State.data.bills[0];
    return { oldRent: s.compute(old).rent, nov: s.rentFor(s.findUnit(old.unitId), '2026-11'), oct: s.rentFor(s.findUnit(old.unitId), '2026-10') };
  });
  if (res.oldRent !== 1200) throw new Error('past bill rent changed to ' + res.oldRent);
  if (res.nov !== 1300) throw new Error('new rent not applied: ' + res.nov);
  if (res.oct !== 1200) throw new Error('rent leaked backwards: ' + res.oct);
});

await step('history and CSV', async () => {
  await page.click('[data-tab="history"]');
  await page.waitForSelector('text=Month total');
  const csv = await page.evaluate(async () => {
    const s = await import('./js/store.js');
    return s.State.data.bills.length;
  });
  if (csv !== 1) throw new Error('unexpected bill count ' + csv);
});

await step('data survives a reload', async () => {
  await page.goto(BASE + '/index.html#/units', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=Jalan Melati Rentals');
  await page.waitForSelector('text=Sarah Lim');
  const persisted = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('rmu.v1'));
    return { units: d.units.length, bills: d.bills.length, rate: d.settings.elecRate };
  });
  if (persisted.units !== 2 || persisted.bills !== 1 || persisted.rate !== 0.52)
    throw new Error('bad persisted state ' + JSON.stringify(persisted));
});

await step('screenshots', async () => {
  await page.goto(BASE + '/index.html#/units');
  await page.waitForSelector('text=Sarah Lim');
  await page.screenshot({ path: SHOT + '/screen-units.png' });
  const unitId = await page.evaluate(async () => (await import('./js/store.js')).State.data.bills[0].unitId);
  await page.goto(BASE + '/index.html#/bill/' + unitId + '/2026-12');
  await page.fill('#b-ec', '5000');
  await page.fill('#b-wc', '960');
  await page.waitForTimeout(150);
  await page.screenshot({ path: SHOT + '/screen-bill.png', fullPage: true });
});

await step('dark mode renders', async () => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(BASE + '/index.html#/units');
  await page.waitForSelector('text=Sarah Lim');
  await page.screenshot({ path: SHOT + '/screen-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });
});

await browser.close();

console.log('\n--- errors (' + errors.length + ') ---');
errors.forEach(e => console.log(e));
process.exit(errors.length ? 1 : 0);
