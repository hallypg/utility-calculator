import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8765';
const OUT = process.env.OUT_DIR || '.';
const errors = [];
const step = async (n, f) => { try { await f(); console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ' :: ' + e.message); errors.push(n + ': ' + e.message); } };

const browser = await chromium.launch();

/* ---------- a phone set to Vietnamese ---------- */
const viCtx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  locale: 'vi-VN', isMobile: true, hasTouch: true
});
const vi = await viCtx.newPage();
vi.on('pageerror', e => errors.push('PAGEERROR(vi): ' + e.message));
vi.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE(vi): ' + m.text()); });

await vi.goto(BASE + '/index.html', { waitUntil: 'networkidle' });

await step('vi: auto-detected from the phone language', async () => {
  await vi.waitForSelector('text=Chưa có căn hộ nào');
  const st = await vi.evaluate(() => JSON.parse(localStorage.getItem('rmu.v1')).settings);
  if (st.lang !== 'vi') throw new Error('lang=' + st.lang);
  if (st.currency !== '₫' || st.currencyAfter !== true || st.decimals !== 0)
    throw new Error('VND defaults not applied: ' + JSON.stringify(st));
  const htmlLang = await vi.getAttribute('html', 'lang');
  if (htmlLang !== 'vi') throw new Error('html lang=' + htmlLang);
});

await step('vi: tab bar is translated', async () => {
  const labels = await vi.$$eval('.tab-label', els => els.map(e => e.textContent));
  const want = ['Căn hộ', 'Lịch sử', 'Cài đặt'];
  if (JSON.stringify(labels) !== JSON.stringify(want))
    throw new Error('got ' + JSON.stringify(labels));
});

await step('vi: full flow in Vietnamese', async () => {
  await vi.click('[data-tab="settings"]');
  await vi.fill('#s-er', '3500');
  await vi.fill('#s-wr', '15000');
  await vi.fill('#s-note', 'Chuyển khoản Vietcombank 0123456789. Xin cảm ơn!');
  await vi.click('#topbar button[type="submit"]');
  await vi.waitForSelector('.toast.show');

  await vi.click('[data-tab="units"]');
  await vi.click('a[href="#/unit/new"]');
  await vi.fill('#f-label', 'P101');
  await vi.fill('#f-tenant', 'Nguyễn Thị Lan');
  await vi.fill('#f-phone', '0912 345 678');
  await vi.fill('#f-rent', '3000000');
  await vi.click('#actionbar button[type="submit"]');
  await vi.waitForSelector('text=Tiền thuê / tháng');

  await vi.click('#actionbar a.btn.primary');
  await vi.fill('#b-elecPrev', '1200');
  await vi.fill('#b-elecCurr', '1350');
  await vi.fill('#b-waterPrev', '40');
  await vi.fill('#b-waterCurr', '48');
  // 150 × 3500 = 525.000 ; 8 × 15000 = 120.000 ; + 3.000.000 = 3.645.000
  await vi.waitForFunction(() =>
    document.querySelector('#bill-total')?.textContent.includes('3.645.000'));
});

await step('vi: money uses Vietnamese separators and no decimals', async () => {
  const txt = await vi.textContent('#bill-total');
  if (!txt.includes('3.645.000')) throw new Error('separators wrong: ' + txt);
  if (txt.includes(',00')) throw new Error('decimals shown for VND: ' + txt);
  if (!txt.trim().endsWith('₫')) throw new Error('symbol not trailing: ' + txt);
});

await step('vi: month picker uses Vietnamese month names', async () => {
  const months = await vi.$$eval('#b-month-m option', els => els.map(e => e.textContent));
  if (months.length !== 12) throw new Error('expected 12 months, got ' + months.length);
  // ICU renders the standalone form capitalised ("Tháng 10"); either case is correct.
  if (!/^tháng 10$/i.test(months[9])) throw new Error('October reads "' + months[9] + '"');
  if (months.some(m => /^(January|October|December)$/.test(m)))
    throw new Error('English month leaked into the picker: ' + JSON.stringify(months));
  // The hidden field the form reads must track the selects.
  await vi.selectOption('#b-month-m', '11');
  await vi.waitForFunction(() => document.getElementById('b-month').value.endsWith('-11'));
  await vi.selectOption('#b-month-m', '10');
  await vi.waitForFunction(() => document.getElementById('b-month').value.endsWith('-10'));
});

await step('en: month picker uses English month names', async () => {
  const enPage = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB' })).newPage();
  await enPage.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await enPage.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('rmu.v1'));
    d.units = [{ id: 'u9', label: 'Z9', tenantName: 'T', phone: '', archived: false, rents: [] }];
    localStorage.setItem('rmu.v1', JSON.stringify(d));
  });
  await enPage.goto(BASE + '/index.html#/bill/u9/2026-10', { waitUntil: 'networkidle' });
  await enPage.reload({ waitUntil: 'networkidle' });
  const months = await enPage.$$eval('#b-month-m option', els => els.map(e => e.textContent));
  if (months[9] !== 'October') throw new Error('got ' + JSON.stringify(months.slice(0, 3)));
  await enPage.context().close();
});

await step('vi: invoice renders in Vietnamese', async () => {
  await vi.click('#actionbar button[type="submit"]');
  await vi.waitForURL(/#\/invoice\//);
  await vi.waitForSelector('.invoice-card');
  const screen = (await vi.textContent('.invoice-card')).replace(/\s+/g, ' ');
  for (const want of ['3.645.000 ₫', 'Nguyễn Thị Lan', 'Tổng phải trả']) {
    if (!screen.includes(want)) throw new Error('missing "' + want + '" on screen: ' + screen.slice(0, 300));
  }
  const src = await vi.evaluate(async () => {
    const inv = await import('./js/invoice.js');
    const st = await import('./js/store.js');
    const b = st.State.data.bills[0];
    return inv.renderInvoice(b, st.findUnit(b.unitId)).toDataURL('image/png');
  });
  fs.writeFileSync(OUT + '/invoice-vi.png', Buffer.from(src.split(',')[1], 'base64'));

  const text = await vi.evaluate(async () => {
    const m = await import('./js/invoice.js');
    const st = await import('./js/store.js');
    const b = st.State.data.bills[0];
    return m.invoiceText(b, st.findUnit(b.unitId));
  });
  for (const want of ['TỔNG PHẢI TRẢ: 3.645.000 ₫', 'Tiền điện: 150 kWh', 'Căn hộ P101', 'Hạn thanh toán']) {
    if (!text.includes(want)) throw new Error('missing "' + want + '" in:\n' + text);
  }
});

await step('vi: screenshots', async () => {
  await vi.goto(BASE + '/index.html#/units');
  await vi.waitForSelector('text=Nguyễn Thị Lan');
  await vi.screenshot({ path: OUT + '/screen-units-vi.png' });
  const id = await vi.evaluate(async () => (await import('./js/store.js')).State.data.bills[0].unitId);
  await vi.goto(BASE + '/index.html#/bill/' + id + '/2026-12');
  await vi.fill('#b-elecCurr', '1500');
  await vi.fill('#b-waterCurr', '55');
  await vi.waitForTimeout(150);
  await vi.screenshot({ path: OUT + '/screen-bill-vi.png', fullPage: true });
});

await step('vi: short months read as 10/2026', async () => {
  await vi.goto(BASE + '/index.html#/units');
  await vi.waitForSelector('.summary');
  const summary = await vi.textContent('.summary');
  if (/thg/i.test(summary))
    throw new Error('summary still uses the Intl short month: ' + summary.replace(/\s+/g, ' '));
  if (!/\d{1,2}\/20\d\d/.test(summary))
    throw new Error('summary has no month in m/yyyy form: ' + summary.replace(/\s+/g, ' '));

  // The long form is untouched: "tháng 10 năm 2026" still reads naturally.
  const header = await vi.textContent('#topbar');
  if (!/tháng/i.test(header))
    throw new Error('the long month form was changed too: ' + header.replace(/\s+/g, ' '));
});

await step('vi: dates read as 05/10/2026, on screen and on the image', async () => {
  const bill = await vi.evaluate(async () =>
    (await import('./js/store.js')).State.data.bills[0]);
  await vi.goto(BASE + '/index.html#/invoice/' + bill.id);
  await vi.waitForSelector('.invoice-card');

  const card = (await vi.textContent('.invoice-card')).replace(/\s+/g, ' ');
  if (/thg/i.test(card)) throw new Error('the invoice screen still says thg: ' + card.slice(0, 200));
  if (!/\d{2}\/\d{2}\/20\d\d/.test(card))
    throw new Error('no dd/mm/yyyy date on the invoice: ' + card.slice(0, 200));

  // The same must hold for the image that actually gets sent.
  const text = await vi.evaluate(async () => {
    const inv = await import('./js/invoice.js');
    const st = await import('./js/store.js');
    const b = st.State.data.bills[0];
    return inv.invoiceText(b, st.findUnit(b.unitId));
  });
  if (/thg/i.test(text)) throw new Error('the sent invoice still says thg:\n' + text);

  // "tháng" is part of the long month, so a label must not repeat it.
  for (const page of [card, text]) {
    if (/tháng tháng/i.test(page))
      throw new Error('a month word is doubled: ' + page.match(/.{0,40}tháng tháng.{0,20}/i)[0]);
  }
});

await step('vi: switching to English keeps the data', async () => {
  await vi.goto(BASE + '/index.html#/settings');
  await vi.waitForSelector('[data-lang="en"]');
  if (await vi.getAttribute('[data-lang="vi"]', 'aria-pressed') !== 'true')
    throw new Error('Vietnamese row not marked as selected');
  await vi.click('[data-lang="en"]');
  await vi.waitForTimeout(300);
  await vi.goto(BASE + '/index.html#/units');
  await vi.waitForSelector('text=Nguyễn Thị Lan');
  const labels = await vi.$$eval('.tab-label', els => els.map(e => e.textContent));
  if (labels[0] !== 'Units') throw new Error('did not switch: ' + JSON.stringify(labels));
  const bills = await vi.evaluate(() => JSON.parse(localStorage.getItem('rmu.v1')).bills.length);
  if (bills !== 1) throw new Error('data lost on language switch');
});

await step('vi: the choice survives a reload', async () => {
  await vi.reload({ waitUntil: 'networkidle' });
  const labels = await vi.$$eval('.tab-label', els => els.map(e => e.textContent));
  if (labels[0] !== 'Units') throw new Error('language not persisted: ' + JSON.stringify(labels));
});

/* ---------- a phone set to English ---------- */
const enCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB' });
const en = await enCtx.newPage();
en.on('pageerror', e => errors.push('PAGEERROR(en): ' + e.message));

await step('en: defaults to English with ordinary currency settings', async () => {
  await en.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await en.waitForSelector('text=No units yet');
  const st = await en.evaluate(() => JSON.parse(localStorage.getItem('rmu.v1')).settings);
  if (st.lang !== 'en') throw new Error('lang=' + st.lang);
  if (st.currency !== '$' || st.currencyAfter || st.decimals !== 2)
    throw new Error('en defaults wrong: ' + JSON.stringify(st));
});

await step('en: no untranslated key leaks into the UI', async () => {
  for (const hash of ['#/units', '#/history', '#/settings', '#/unit/new']) {
    await en.goto(BASE + '/index.html' + hash, { waitUntil: 'networkidle' });
    await en.waitForTimeout(120);
    const body = await en.textContent('body');
    const leak = body.match(/\b(units|unit|bill|invoice|inv|set|csv|tab|history|backup|nf)\.[a-zA-Z]+\b/);
    if (leak) throw new Error('raw key rendered: ' + leak[0] + ' on ' + hash);
  }
});

await browser.close();
console.log('\n--- errors (' + errors.length + ') ---');
errors.forEach(e => console.log(e));
process.exit(errors.length ? 1 : 0);
