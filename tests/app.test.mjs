import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8765';
const SHOT = process.env.OUT_DIR || '.';
const errors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  acceptDownloads: true
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
  await page.click('#topbar button[type="submit"]');
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

await step('the three required unit fields are marked and enforced', async () => {
  await page.goto(BASE + '/index.html#/unit/new');
  await page.waitForSelector('#f-label');

  for (const id of ['#f-label', '#f-tenant', '#f-rent']) {
    if (await page.locator(id).getAttribute('required') === null)
      throw new Error(id + ' is not required');
    const label = await page.textContent(`label[for="${id.slice(1)}"]`);
    if (!label.includes('*')) throw new Error(id + ' label is not marked: ' + label.trim());
  }
  // Address is optional and must not be marked.
  if ((await page.textContent('label[for="f-address"]')).includes('*'))
    throw new Error('address is marked required');

  // The rent label carries the currency.
  const rentLabel = await page.textContent('label[for="f-rent"]');
  if (!rentLabel.includes('RM')) throw new Error('rent label lacks the currency: ' + rentLabel.trim());

  // Submitting with the tenant missing must not create anything.
  const before = await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.units.length);
  await page.fill('#f-label', 'ZZ');
  await page.fill('#f-rent', '100');
  await page.click('#actionbar button[type="submit"]');
  await page.waitForTimeout(300);
  const after = await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.units.length);
  if (after !== before) throw new Error('saved a unit without a tenant name');
  if (!page.url().includes('/unit/new')) throw new Error('navigated away from an incomplete form');
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

await step('reading fields hint at a number, not a unit', async () => {
  for (const [id, unit] of [['#b-elecPrev', 'kWh'], ['#b-elecCurr', 'kWh'],
                            ['#b-waterPrev', 'm³'], ['#b-waterCurr', 'm³']]) {
    const ph = await page.getAttribute(id, 'placeholder');
    if (ph === unit) throw new Error(id + ' placeholder is the unit "' + ph + '"');
    if (ph !== '0') throw new Error(id + ' placeholder is "' + ph + '"');
  }
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

await step('rates read as a number until Change is pressed', async () => {
  for (const [rate, change] of [['#b-elecRate', '#b-elecRate-change'],
                                ['#b-waterRate', '#b-waterRate-change']]) {
    if (await page.locator(rate).isVisible())
      throw new Error(rate + ' input is showing before Change was pressed');
    if (!(await page.locator(change).isVisible()))
      throw new Error(change + ' is missing');
  }

  // The number itself is on display, with its unit.
  const shown = await page.textContent('#b-elecRate-label');
  if (!/0\.52/.test(shown) || !/kWh/.test(shown))
    throw new Error('rate reads "' + shown.trim() + '"');

  // Pressing Change reveals the field and retires the button.
  await page.click('#b-elecRate-change');
  if (!(await page.locator('#b-elecRate').isVisible()))
    throw new Error('Change did not reveal the rate input');
  if (await page.locator('#b-elecRate-change').isVisible())
    throw new Error('Change is still showing after being pressed');

  // Water is untouched by changing electricity.
  if (await page.locator('#b-waterRate').isVisible())
    throw new Error('changing electricity revealed the water rate too');

  // An edited rate reaches the total.
  await page.fill('#b-elecRate', '1');
  await page.waitForFunction(
    () => /312\.00/.test(document.querySelector('#elec-amt')?.textContent || ''),
    null, { timeout: 5000 });
  await page.fill('#b-elecRate', '0.52');
});

await step('a fresh form shows no error before anything is typed', async () => {
  const unitId = await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.units[0].id);
  await page.goto(BASE + '/index.html#/bill/' + unitId + '/new');
  await page.waitForSelector('#b-elecCurr');
  await page.waitForTimeout(250);
  if (await page.locator('.field-err').count())
    throw new Error('validation fired on an untouched form');
  await page.goBack();
  await page.waitForSelector('#b-elecCurr');
});

await step('backwards reading is reported on Save only', async () => {
  await page.fill('#b-elecCurr', '4100');
  await page.waitForTimeout(250);
  if (await page.locator('#elec-err .field-err').count())
    throw new Error('error shown before Save was pressed');

  await page.click('#actionbar button[type="submit"]');
  await page.waitForSelector('#elec-err .field-err');
  if (page.url().includes('/invoice/')) throw new Error('saved despite a backwards reading');

  // Correcting the reading leaves the message alone; only Save re-evaluates.
  await page.fill('#b-elecCurr', '4512');
  await page.waitForTimeout(200);
  if (!(await page.locator('#elec-err .field-err').count()))
    throw new Error('message cleared while typing instead of on Save');
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

await step('the invoice edit control is a labelled button', async () => {
  const edit = page.locator(`#topbar a[href^="#/bill/"]`);
  if (!(await edit.count())) throw new Error('no edit control in the invoice top bar');
  if ((await edit.textContent()).trim() !== 'Edit')
    throw new Error('edit control reads "' + (await edit.textContent()).trim() + '"');
  if (!(await edit.locator('svg').count())) throw new Error('edit control has no icon');
});

await step('the unit edit control is labelled too', async () => {
  const unitId = await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.units[0].id);
  await page.goto(BASE + '/index.html#/unit/' + unitId);
  await page.waitForSelector('#topbar');
  const edit = page.locator('#topbar a[href$="/edit"]');
  if (!(await edit.count())) throw new Error('no edit control on the unit screen');
  if ((await edit.textContent()).trim() !== 'Edit')
    throw new Error('edit control reads "' + (await edit.textContent()).trim() + '"');
  if (!(await edit.locator('svg').count())) throw new Error('edit control has no icon');
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
  const billId = await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.bills[0].id);
  await page.goto(BASE + '/index.html#/invoice/' + billId);
  await page.waitForSelector('#mark-paid');
  await page.click('#mark-paid');
  await page.waitForTimeout(250);
  const paid = await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.bills[0].paid);
  if (paid !== true) throw new Error('bill not marked paid');

  // The confirmation is a banner above the invoice, not part of the bar.
  const banner = page.locator('#app .banner.ok');
  if (!(await banner.count())) throw new Error('no paid banner above the invoice');
  if (!/paid in full/i.test(await banner.textContent()))
    throw new Error('banner reads "' + (await banner.textContent()).trim() + '"');
  const [by, cy] = [await banner.boundingBox(), await page.locator('.invoice-card').boundingBox()];
  if (!(by.y < cy.y)) throw new Error('the banner is not above the invoice');
  if (await page.locator('#actionbar .banner').count())
    throw new Error('the confirmation is still in the action bar');

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

await step('editing a unit shows the same square Delete in the bar', async () => {
  const unitId = await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.units[0].id);
  await page.goto(BASE + '/index.html#/unit/' + unitId + '/edit');
  await page.waitForSelector('#f-label');

  const del = page.locator('#actionbar #archive-unit');
  const save = page.locator('#actionbar button[type="submit"]');
  if (!(await del.count())) throw new Error('Delete is not in the action bar');
  if (await page.locator('#app #archive-unit').count())
    throw new Error('Delete is still in the page body');

  const [dx, sx] = [await del.boundingBox(), await save.boundingBox()];
  if (!(dx.x < sx.x)) throw new Error('Delete is not left of Save');
  if (Math.abs(dx.width - dx.height) > 1)
    throw new Error(`Delete is ${dx.width}x${dx.height}, not square`);
  if ((await del.textContent()).trim() !== '')
    throw new Error('Delete still carries a text label');
  if (!(await del.getAttribute('aria-label')))
    throw new Error('icon-only Delete has no accessible name');

  // Adding a unit has nothing to delete.
  await page.goto(BASE + '/index.html#/unit/new');
  await page.waitForSelector('#f-label');
  if (await page.locator('#archive-unit').count())
    throw new Error('Delete shown while adding a unit');
});

await step('editing a bill shows Delete beside Save in the bar', async () => {
  const bill = await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.bills[0]);
  await page.goto(BASE + '/index.html#/bill/' + bill.unitId + '/' + bill.month);
  await page.waitForSelector('#b-elecCurr');

  const del = page.locator('#actionbar #del-bill');
  const save = page.locator('#actionbar button[type="submit"]');
  if (!(await del.count())) throw new Error('Delete is not in the action bar');
  if (await page.locator('#app #del-bill').count())
    throw new Error('Delete is still in the page body');

  // Delete sits to the left of Save, as a square icon button.
  const [dx, sx] = [await del.boundingBox(), await save.boundingBox()];
  if (!(dx.x < sx.x)) throw new Error(`Delete at ${dx.x} is not left of Save at ${sx.x}`);
  if (Math.abs(dx.y - sx.y) > 2) throw new Error('the two buttons are not on one row');
  if (Math.abs(dx.width - dx.height) > 1)
    throw new Error(`Delete is ${dx.width}x${dx.height}, not square`);
  if ((await del.textContent()).trim() !== '')
    throw new Error('Delete still carries a text label');
  if (!(await del.locator('svg').count())) throw new Error('Delete has no icon');
  if (!(await del.getAttribute('aria-label')))
    throw new Error('icon-only Delete has no accessible name');

  // A new bill has nothing to delete.
  await page.goto(BASE + '/index.html#/bill/' + bill.unitId + '/new');
  await page.waitForSelector('#b-elecCurr');
  if (await page.locator('#del-bill').count())
    throw new Error('Delete shown while creating a bill');
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
  const d = new Date();
  const lastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 7);
  if (picked !== lastMonth)
    throw new Error('expected last month ' + lastMonth + ', got ' + picked);

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
  for (const want of ['TOTAL DUE: RM1,408.14', 'Electricity: 312 kWh', 'Water: 34 m³', 'Rent (']) {
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

await step('adjustments are gone from the form, the maths and storage', async () => {
  const unitId = await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.units[0].id);
  await page.goto(BASE + '/index.html#/bill/' + unitId + '/new');
  await page.waitForSelector('#b-elecCurr');
  for (const id of ['#b-adj', '#b-adjn']) {
    if (await page.locator(id).count()) throw new Error(id + ' is still on the bill form');
  }

  const total = await page.evaluate(async () => {
    const s = await import('./js/store.js');
    return s.compute({ elecPrev: 0, elecCurr: 100, waterPrev: 0, waterCurr: 10,
                       elecRate: 1, waterRate: 2, rent: 500, adjustment: -50 }).total;
  });
  if (total !== 620) throw new Error('adjustment still affecting the total: ' + total);

  // Fields left by an older build are dropped when the data is loaded.
  const cleaned = await page.evaluate(async () => {
    const d = JSON.parse(localStorage.getItem('rmu.v1'));
    d.bills[0].adjustment = -50;
    d.bills[0].adjustmentNote = 'Repair';
    localStorage.setItem('rmu.v1', JSON.stringify(d));
    const s = await import('./js/store.js');
    s.State.load();
    s.State.save();
    return JSON.parse(localStorage.getItem('rmu.v1')).bills[0];
  });
  if ('adjustment' in cleaned || 'adjustmentNote' in cleaned)
    throw new Error('adjustment fields survived in storage');
});

await step('due day sits in the Invoice section', async () => {
  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('#s-due');

  // It must be below the Invoice heading, not the Currency one.
  const order = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('#app .eyebrow')].map(e => ({
      text: e.textContent.trim(), top: e.getBoundingClientRect().top
    }));
    const due = document.getElementById('s-due').getBoundingClientRect().top;
    const above = heads.filter(h => h.top < due).pop();
    return above ? above.text : null;
  });
  if (!/invoice/i.test(order || ''))
    throw new Error('due day sits under "' + order + '"');

  // And it still saves.
  await page.fill('#s-due', '20');
  await page.click('#topbar button[type="submit"]');
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rmu.v1')).settings.dueDays);
  if (saved !== 20) throw new Error('due days did not save: ' + saved);
  await page.fill('#s-due', '14');
  await page.click('#topbar button[type="submit"]');
  await page.waitForTimeout(300);
});

await step('checking for updates reports being current', async () => {
  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('#check-updates');
  if (!(await page.textContent('#app')).includes('v'))
    throw new Error('no version shown in Settings');
  // Let any toast from an earlier step clear first.
  await page.waitForFunction(() => !document.querySelector('.toast.show'),
    null, { timeout: 8000 }).catch(() => {});
  await page.click('#check-updates');
  await page.waitForFunction(
    () => /latest version/i.test(document.querySelector('.toast.show')?.textContent || ''),
    null, { timeout: 15000 });

  // It must have asked the server, not a cached answer.
  const asked = await page.evaluate(async () => {
    const res = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
    return (await res.json()).version;
  });
  const shown = await page.evaluate(async () =>
    (await import('./js/store.js')).APP_VERSION);
  if (asked !== shown) throw new Error(`published ${asked} but running ${shown}`);
  if (await page.locator('#check-updates').isDisabled())
    throw new Error('button left disabled after the check');
});

await step('the backup reminder is only in Settings', async () => {
  await page.goto(BASE + '/index.html#/units');
  await page.waitForSelector('.summary');
  if (await page.locator('#app .banner').count())
    throw new Error('a banner is still on the Units screen');

  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('#backup');
  const banner = page.locator('#app .banner');
  if (!(await banner.count()))
    throw new Error('the backup reminder is missing from Settings');
  if (!/only on this phone/i.test(await banner.textContent()))
    throw new Error('unexpected banner text: ' + (await banner.textContent()).trim());
});

let savedBills = null;

await step('units split into still-to-bill and billed', async () => {
  // Keep the real bills to put back; these two steps rewrite them.
  savedBills = await page.evaluate(() => localStorage.getItem('rmu.v1'));

  // Three units: one billed for the month being billed, two not.
  await page.evaluate(async () => {
    const s = await import('./js/store.js');
    const month = s.billingMonth();
    const d = s.State.data;
    d.bills = [{
      id: 'grp1', unitId: d.units[0].id, month, issuedOn: new Date().toISOString().slice(0, 10),
      elecPrev: 0, elecCurr: 10, waterPrev: 0, waterCurr: 1,
      elecRate: 1, waterRate: 1, rent: 100, paid: false
    }];
    s.State.save();
  });

  await page.goto(BASE + '/index.html#/units');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.summary');

  // The screen says which month it is working on.
  if (!(await page.textContent('#topbar')).match(/Billing for/))
    throw new Error('the billing month is not stated');

  // Both headings show, to-bill first.
  const heads = await page.$$eval('#app .eyebrow', els => els.map(e => e.textContent.trim()));
  if (!/Still to bill \(2\)/.test(heads[0] || ''))
    throw new Error('first heading is "' + heads[0] + '"');
  if (!/^Billed$/.test(heads[1] || ''))
    throw new Error('second heading is "' + heads[1] + '"');

  // A unit with no bill for the month shows when it was last billed,
  // so a skipped month cannot hide.
  const body = (await page.textContent('#app')).replace(/\s+/g, ' ');
  if (!/No bills yet|Last billed/.test(body))
    throw new Error('to-bill cards do not say when they were last billed');

  // The pill answers payment only; "Not billed" is the heading's job now.
  if (/Not billed/.test(body)) throw new Error('a card still carries a Not billed pill');

  // A unit that has never been billed owes nothing, but calling it "Paid up"
  // would be nonsense, so it carries no pill at all.
  const never = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#app .card.tap')];
    const card = cards.find(c => /No bills yet/.test(c.textContent));
    return card ? card.querySelectorAll('.pill').length : -1;
  });
  if (never === -1) throw new Error('no never-billed unit on screen to check');
  if (never !== 0) throw new Error('a never-billed unit carries a payment pill');

  // The summary counts what is left to do.
  if (!/To bill/.test(await page.textContent('.summary')))
    throw new Error('summary does not show the to-bill count');
});

await step('no headings when every unit is on the same side', async () => {
  await page.evaluate(async () => {
    const s = await import('./js/store.js');
    const month = s.billingMonth();
    const today = new Date().toISOString().slice(0, 10);
    s.State.data.bills = s.State.data.units.map((u, i) => ({
      id: 'all' + i, unitId: u.id, month, issuedOn: today,
      elecPrev: 0, elecCurr: 10, waterPrev: 0, waterCurr: 1,
      elecRate: 1, waterRate: 1, rent: 100, paid: true
    }));
    s.State.save();
  });
  await page.goto(BASE + '/index.html#/units');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.summary');

  const heads = await page.$$eval('#app .eyebrow', els => els.map(e => e.textContent.trim()));
  if (heads.length) throw new Error('headings shown with nothing to separate: ' + JSON.stringify(heads));
  if (!/is billed for/.test(await page.textContent('#app')))
    throw new Error('no all-done confirmation');

  // Put the real data back for the steps that follow.
  await page.evaluate(raw => localStorage.setItem('rmu.v1', raw), savedBills);
  await page.goto(BASE + '/index.html#/units');
  await page.reload({ waitUntil: 'networkidle' });
});

await step('the tab bar is units and settings only', async () => {
  await page.goto(BASE + '/index.html#/units');
  await page.waitForSelector('.tabbar');
  const tabs = await page.$$eval('.tabbar a', els => els.map(e => e.dataset.tab));
  if (JSON.stringify(tabs) !== JSON.stringify(['units', 'settings']))
    throw new Error('tabs are ' + JSON.stringify(tabs));

  // The old address must not render a blank screen.
  await page.goto(BASE + '/index.html#/history');
  await page.waitForTimeout(250);
  const body = (await page.textContent('#app')).trim();
  if (!body) throw new Error('#/history renders nothing');
});

await step('CSV export still covers every bill', async () => {
  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('#csv2');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv2')]);
  const p = SHOT + '/' + dl.suggestedFilename();
  await dl.saveAs(p);
  const fs = await import('node:fs');
  const rows = fs.readFileSync(p, 'utf8').trim().split('\n');
  const bills = await page.evaluate(async () =>
    (await import('./js/store.js')).State.data.bills.length);
  if (rows.length !== bills + 1)
    throw new Error(`CSV has ${rows.length - 1} rows for ${bills} bills`);
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
