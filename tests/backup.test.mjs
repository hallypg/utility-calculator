import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8765';
const TMP = process.env.OUT_DIR || '.';
const errors = [];
const step = async (n, f) => { try { await f(); console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ' :: ' + e.message); errors.push(n); } };

const firstUnit = p => p.evaluate(async () =>
  (await import('./js/store.js')).State.data.units[0]);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });

// Seed a realistic data set directly.
await page.evaluate(() => {
  localStorage.setItem('rmu.v1', JSON.stringify({
    version: 1,
    // propertyName/landlordName are from an older build; migration should drop them.
    settings: { propertyName: 'Melati', landlordName: 'HP', currency: 'RM', currencyAfter: false,
      elecRate: 0.52, waterRate: 1.35, elecUnit: 'kWh', waterUnit: 'm³', dueDay: 15, invoiceNote: 'Thanks' },
    // Deliberately the pre-migration shape: a dated rents[] list.
    units: [{ id: 'u1', label: 'A1', tenantName: 'Sarah', phone: '123', archived: false, rents: [{ from: '2026-01', amount: 1200 }] }],
    bills: [{ id: 'b1', unitId: 'u1', month: '2026-10', issuedOn: '2026-10-01',
      elecPrev: 4200, elecCurr: 4512, waterPrev: 880, waterCurr: 914,
      elecRate: 0.52, waterRate: 1.35, rent: 1200, adjustment: 0, adjustmentNote: '' }],
    lastBackupAt: null
  }));
});
await page.goto(BASE + '/index.html#/settings', { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });

let backupPath;
await step('backup downloads a valid file', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
  backupPath = TMP + '/' + dl.suggestedFilename();
  await dl.saveAs(backupPath);
  const parsed = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  if (parsed.units.length !== 1 || parsed.bills.length !== 1) throw new Error('backup contents wrong');
  if (!/^rental-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename())) throw new Error('bad name ' + dl.suggestedFilename());
});

await step('settings dropped in a later build are cleaned out', async () => {
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('rmu.v1')).settings);
  if ('propertyName' in st || 'landlordName' in st)
    throw new Error('stale settings survived: ' + JSON.stringify(Object.keys(st)));
  if (st.currency !== 'RM') throw new Error('known settings lost: ' + JSON.stringify(st));
});

await step('an old rents[] list collapses to a single rent', async () => {
  const u = await firstUnit(page);
  if (u.rent !== 1200) throw new Error('migrated rent = ' + JSON.stringify(u));
  if ('rents' in u) throw new Error('rents[] survived migration');
});

await step('backup timestamp is recorded', async () => {
  const ts = await page.evaluate(() => JSON.parse(localStorage.getItem('rmu.v1')).lastBackupAt);
  if (!ts) throw new Error('lastBackupAt not set');
});

await step('CSV exports every bill', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv2')]);
  const p = TMP + '/' + dl.suggestedFilename();
  await dl.saveAs(p);
  const csv = fs.readFileSync(p, 'utf8').trim().split('\n');
  if (csv.length !== 2) throw new Error('expected header + 1 row, got ' + csv.length);
  if (!csv[1].includes('1408.14')) throw new Error('total missing from CSV: ' + csv[1]);
  if (!csv[0].includes('Elec used (kWh)')) throw new Error('header wrong: ' + csv[0]);
});

await step('wiping then restoring brings everything back', async () => {
  await page.evaluate(() => localStorage.removeItem('rmu.v1'));
  await page.goto(BASE + '/index.html#/units', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=No units yet');

  await page.goto(BASE + '/index.html#/settings', { waitUntil: 'networkidle' });
  await page.waitForSelector('#restore-file', { state: 'attached' });

  // The confirmation is rendered in the page, in the app's own language.
  if (await page.locator('#restore-confirm').isVisible())
    throw new Error('restore confirmation is showing before it was asked for');
  await page.click('#restore');
  if (!(await page.locator('#restore-confirm').isVisible()))
    throw new Error('in-page restore confirmation did not open');
  await page.click('#restore-cancel');
  if (await page.locator('#restore-confirm').isVisible())
    throw new Error('cancel did not close the confirmation');
  await page.click('#restore');
  await page.setInputFiles('#restore-file', backupPath);
  await page.waitForTimeout(600);

  const after = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('rmu.v1'));
    return { units: d.units.length, bills: d.bills.length, label: d.units[0].label, rate: d.settings.elecRate };
  });
  if (after.units !== 1 || after.bills !== 1 || after.label !== 'A1' || after.rate !== 0.52)
    throw new Error('restore incomplete: ' + JSON.stringify(after));
});

await step('a junk file is rejected without destroying data', async () => {
  const junk = TMP + '/junk.json';
  fs.writeFileSync(junk, 'not json at all');
  await page.goto(BASE + '/index.html#/settings', { waitUntil: 'networkidle' });
  await page.waitForSelector('#restore-file', { state: 'attached' });
  page.once('dialog', d => d.accept());
  await page.setInputFiles('#restore-file', junk);
  await page.waitForTimeout(400);
  const still = await page.evaluate(() => JSON.parse(localStorage.getItem('rmu.v1')).units.length);
  if (still !== 1) throw new Error('data lost after bad restore');
});

await browser.close();
console.log('\n--- errors (' + errors.length + ') ---');
errors.forEach(e => console.log(e));
process.exit(errors.length ? 1 : 0);
