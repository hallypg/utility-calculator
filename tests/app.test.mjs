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
  await page.click('#actionbar button[type="submit"]');
  await page.waitForSelector('text=Rent / month');

  await page.click('[data-tab="units"]');
  await page.click('.icon-btn[href="#/unit/new"]');
  await page.fill('#f-label', 'B2');
  await page.fill('#f-tenant', 'Daniel Teoh');
  await page.fill('#f-phone', '+60 19-888 1234');
  await page.fill('#f-rent', '950');
  await page.click('#actionbar button[type="submit"]');
  await page.waitForSelector('text=Rent / month');
});

await step('rates prefill the new bill', async () => {
  await page.click('[data-tab="units"]');
  await page.click('text=A1');
  await page.click('#actionbar a.btn.primary');
  const er = await page.inputValue('#b-elecRate');
  const wr = await page.inputValue('#b-waterRate');
  const rent = await page.inputValue('#b-rent');
  if (er !== '0.52' || wr !== '1.35') throw new Error(`rates not prefilled: ${er}/${wr}`);
  if (rent !== '1200') throw new Error('rent not prefilled: ' + rent);
});

await step('live total is correct', async () => {
  await page.fill('#b-elecPrev', '4200');
  await page.fill('#b-elecCurr', '4512');
  await page.fill('#b-waterPrev', '880');
  await page.fill('#b-waterCurr', '914');
  // 312 * 0.52 = 162.24 ; 34 * 1.35 = 45.90 ; + 1200 = 1408.14
  await page.waitForFunction(() =>
    document.querySelector('#bill-total')?.textContent.includes('1,408.14'));
});

await step('backwards reading is blocked', async () => {
  await page.fill('#b-elecCurr', '4100');
  await page.waitForSelector('#elec-err .field-err');
  await page.click('#actionbar button[type="submit"]');
  await page.waitForTimeout(250);
  if (page.url().includes('/invoice/')) throw new Error('saved despite a backwards reading');
  await page.fill('#b-elecCurr', '4512');
  await page.waitForTimeout(100);
  if (await page.locator('#elec-err .field-err').count()) throw new Error('error did not clear');
});

await step('save bill then the invoice screen renders', async () => {
  await page.click('#actionbar button[type="submit"]');
  await page.waitForURL(/#\/invoice\//);
  await page.waitForSelector('.invoice-card');
  const text = (await page.textContent('.invoice-card')).replace(/\s+/g, ' ');
  for (const want of ['RM1,408.14', 'Sarah Lim', 'Total due', 'Meter 4,200']) {
    if (!text.includes(want)) throw new Error('missing "' + want + '" in: ' + text.slice(0, 300));
  }
  if (!(await page.locator('#mark-paid').count())) throw new Error('no mark-paid button');
});

await step('the sendable image still renders', async () => {
  const src = await page.evaluate(async () => {
    const inv = await import('./js/invoice.js');
    const st = await import('./js/store.js');
    const b = st.State.data.bills[0];
    return inv.renderInvoice(b, st.findUnit(b.unitId)).toDataURL('image/png');
  });
  if (!src.startsWith('data:image/png')) throw new Error('not a png');
  const fs = await import('node:fs');
  fs.writeFileSync(SHOT + '/invoice.png', Buffer.from(src.split(',')[1], 'base64'));
});

await step('marking paid flows through to the units screen', async () => {
  await page.click('#mark-paid');
  await page.waitForTimeout(250);
  const paid = await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.bills[0].paid);
  if (paid !== true) throw new Error('bill not marked paid');

  await page.goto(BASE + '/index.html#/units');
  await page.waitForSelector('.summary');
  const sum = (await page.textContent('.summary')).replace(/\s+/g, ' ');
  if (!/All paid up/.test(sum)) throw new Error('summary still shows owing: ' + sum);

  await page.click('#actionbar button[type="submit"]').catch(() => {});
  await page.goto(BASE + '/index.html#/invoice/' + await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.bills[0].id));
  await page.waitForSelector('#mark-paid');
  await page.click('#mark-paid');
  await page.waitForTimeout(250);
  const back = await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.bills[0].paid);
  if (back !== false) throw new Error('could not mark unpaid again');
});

await step('the unit CTA always offers a new bill', async () => {
  const unitId = await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.bills[0].unitId);
  await page.goto(BASE + '/index.html#/unit/' + unitId);
  await page.waitForSelector('#actionbar a.btn.primary');

  const label = (await page.textContent('#actionbar a.btn.primary')).trim();
  if (/edit/i.test(label)) throw new Error('CTA offers editing: ' + label);
  if (label !== 'New bill') throw new Error('unexpected CTA: ' + label);

  // Even though this month already has a bill, the CTA opens a blank form,
  // always preselected to the current month.
  await page.click('#actionbar a.btn.primary');
  await page.waitForSelector('#b-elecCurr');
  if (!/New bill/.test(await page.textContent('#topbar')))
    throw new Error('opened the existing bill instead of a new one');
  if (await page.inputValue('#b-elecCurr') !== '')
    throw new Error('blank form was prefilled from the existing bill');

  const picked = await page.inputValue('#b-month');
  const thisMonth = new Date().toISOString().slice(0, 7);
  if (picked !== thisMonth) throw new Error('expected ' + thisMonth + ', got ' + picked);

  // The existing bill is still reachable from its card.
  await page.goto(BASE + '/index.html#/unit/' + unitId);
  await page.click('.card.tap[href^="#/invoice/"]');
  await page.waitForSelector('.invoice-card');
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
  await page.waitForSelector('#b-elecPrev');
  const ep = await page.inputValue('#b-elecPrev');
  const wp = await page.inputValue('#b-waterPrev');
  if (ep !== '4512' || wp !== '914') throw new Error(`carry-over wrong: ${ep}/${wp}`);
  await page.waitForSelector('text=carried over from');
});

await step('editing rent leaves saved bills alone but applies to new ones', async () => {
  const unitId = await page.evaluate(async () => (await import('./js/store.js')).State.data.bills[0].unitId);
  await page.goto(BASE + '/index.html#/unit/' + unitId + '/edit');
  await page.fill('#f-rent', '1300');
  await page.click('#actionbar button[type="submit"]');
  await page.waitForTimeout(250);

  const res = await page.evaluate(async () => {
    const s = await import('./js/store.js');
    const old = s.State.data.bills[0];
    return { oldRent: s.compute(old).rent, unitRent: s.rentOf(s.findUnit(old.unitId)) };
  });
  if (res.oldRent !== 1200) throw new Error('saved bill rent changed to ' + res.oldRent);
  if (res.unitRent !== 1300) throw new Error('unit rent not updated: ' + res.unitRent);

  // A fresh bill should pick up the new amount.
  await page.goto(BASE + '/index.html#/bill/' + unitId + '/2027-01');
  await page.waitForSelector('#b-rent');
  const prefilled = await page.inputValue('#b-rent');
  if (prefilled !== '1300') throw new Error('new bill prefilled ' + prefilled);
});

await step('address and starting readings seed the first bill', async () => {
  await page.goto(BASE + '/index.html#/unit/new');
  await page.waitForSelector('#f-selec');
  await page.fill('#f-label', 'C3');
  await page.fill('#f-address', '12 Harrow St');
  await page.fill('#f-tenant', 'Ana Reyes');
  await page.fill('#f-rent', '800');
  await page.fill('#f-selec', '5000');
  await page.fill('#f-swater', '300');
  await page.click('#actionbar button[type="submit"]');
  await page.waitForSelector('text=Rent / month');

  if (!(await page.textContent('body')).includes('12 Harrow St'))
    throw new Error('address not shown on the unit screen');

  await page.click('#actionbar a.btn.primary');
  await page.waitForSelector('#b-elecPrev');
  const ep = await page.inputValue('#b-elecPrev');
  const wp = await page.inputValue('#b-waterPrev');
  if (ep !== '5000' || wp !== '300')
    throw new Error('starting readings not used as opening: ' + ep + '/' + wp);

  // An existing unit has no starting-readings card; it comes from history instead.
  await page.goto(BASE + '/index.html#/units');
  await page.waitForSelector('text=Ana Reyes');
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
  await page.waitForSelector('text=Sarah Lim');
  const persisted = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('rmu.v1'));
    return { units: d.units.length, bills: d.bills.length, rate: d.settings.elecRate };
  });
  if (persisted.units !== 3 || persisted.bills !== 1 || persisted.rate !== 0.52)
    throw new Error('bad persisted state ' + JSON.stringify(persisted));
});

await step('screenshots', async () => {
  await page.goto(BASE + '/index.html#/units');
  await page.waitForSelector('text=Sarah Lim');
  await page.screenshot({ path: SHOT + '/screen-units.png' });
  const unitId = await page.evaluate(async () => (await import('./js/store.js')).State.data.bills[0].unitId);
  await page.goto(BASE + '/index.html#/bill/' + unitId + '/2026-12');
  await page.fill('#b-elecCurr', '5000');
  await page.fill('#b-waterCurr', '960');
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
