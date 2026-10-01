import {
  State, uid, monthKey, monthLabel, monthShort, shiftMonth,
  units, activeUnits, findUnit, addUnit, rentFor, setRent,
  billsFor, findBill, billForMonth, openingReadings, saveBill, deleteBill,
  compute, money, num, dueDate, fmtDate
} from './store.js';
import { renderInvoice, invoiceFilename, shareInvoice, invoiceText } from './invoice.js';

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const ICON = {
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><path d="M8 7l4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M10 21v-5h4v5"/></svg>'
};

let toastTimer;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

const nav = hash => { location.hash = hash; };
const money0 = v => (v === 0 || v ? v : '');

/* ================= views ================= */

function viewUnits() {
  const list = activeUnits();
  const now = monthKey();
  const s = State.data.settings;

  const needsRates = !s.elecRate && !s.waterRate;
  const banners = [];
  if (needsRates && list.length) {
    banners.push(`<a class="banner info" href="#/settings">${ICON.warn}<span>Set your electricity and water rates in Settings so bills calculate automatically.</span></a>`);
  }
  banners.push(backupBanner());

  const body = list.length ? list.map(u => {
    const bill = billForMonth(u.id, now);
    const rent = rentFor(u, now);
    return `
      <a class="card tap" href="#/unit/${u.id}">
        <div class="row between">
          <div class="grow">
            <div class="unit-label truncate">${esc(u.label)}</div>
            <div class="muted truncate">${esc(u.tenantName || 'No tenant set')}</div>
          </div>
          <span class="pill ${bill ? 'done' : 'todo'}">${bill ? 'Billed' : 'Not billed'}</span>
        </div>
        <div class="row between" style="margin-top:12px">
          <span class="tiny">Rent ${esc(money(rent))}</span>
          <span class="amount">${bill ? esc(money(compute(bill).total)) : '—'}</span>
        </div>
      </a>`;
  }).join('') : `
    <div class="empty">
      ${ICON.empty}
      <p>No units yet.<br>Add the first one to get started.</p>
      <a class="btn primary" href="#/unit/new">${ICON.plus} Add a unit</a>
    </div>`;

  return {
    title: s.propertyName || 'My Units',
    sub: list.length ? `${list.length} unit${list.length > 1 ? 's' : ''} · ${monthLabel(now)}` : '',
    actions: list.length ? `<a class="icon-btn" href="#/unit/new" aria-label="Add unit">${ICON.plus}</a>` : '',
    body: banners.join('') + body
  };
}

function backupBanner() {
  const last = State.data.lastBackupAt ? new Date(State.data.lastBackupAt) : null;
  if (!State.data.bills.length) return '';
  const days = last ? (Date.now() - last.getTime()) / 86400000 : Infinity;
  if (days < 45) return '';
  const msg = last
    ? `Last backup was ${Math.floor(days)} days ago. Your records live only on this phone.`
    : 'Your records live only on this phone. Save a backup so you can restore them if you lose it.';
  return `<a class="banner" href="#/settings">${ICON.warn}<span>${esc(msg)} Tap to back up.</span></a>`;
}

function viewUnitForm(id) {
  const u = id === 'new' ? null : findUnit(id);
  if (id !== 'new' && !u) return notFound();
  return {
    title: u ? 'Edit unit' : 'Add unit',
    back: u ? `#/unit/${u.id}` : '#/units',
    body: `
      <form id="unit-form" class="card">
        <div class="field">
          <label for="f-label">Unit name</label>
          <input id="f-label" name="label" required placeholder="e.g. Unit A1" value="${esc(u?.label || '')}">
        </div>
        <div class="field">
          <label for="f-tenant">Tenant name</label>
          <input id="f-tenant" name="tenantName" placeholder="e.g. Sarah Lim" value="${esc(u?.tenantName || '')}">
        </div>
        <div class="field">
          <label for="f-phone">Phone number</label>
          <input id="f-phone" name="phone" type="tel" inputmode="tel" placeholder="e.g. +60 12-345 6789" value="${esc(u?.phone || '')}">
        </div>
        ${u ? '' : `
        <div class="field">
          <label for="f-rent">Monthly rent</label>
          <input id="f-rent" name="rent" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00">
        </div>`}
        <button class="btn primary block" type="submit">${u ? 'Save changes' : 'Add unit'}</button>
      </form>
      ${u ? `<button class="btn danger block" id="archive-unit" style="margin-top:12px">Delete this unit</button>` : ''}`,
    mount() {
      document.getElementById('unit-form').addEventListener('submit', e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        if (!f.label.trim()) return;
        if (u) {
          Object.assign(u, { label: f.label.trim(), tenantName: f.tenantName.trim(), phone: f.phone.trim() });
          State.save();
          toast('Unit updated');
          nav(`#/unit/${u.id}`);
        } else {
          const created = addUnit(f);
          toast('Unit added');
          nav(`#/unit/${created.id}`);
        }
      });
      document.getElementById('archive-unit')?.addEventListener('click', () => {
        const n = billsFor(u.id).length;
        if (!confirm(`Delete ${u.label}? This also deletes its ${n} saved bill${n === 1 ? '' : 's'}. This cannot be undone.`)) return;
        State.data.bills = State.data.bills.filter(b => b.unitId !== u.id);
        State.data.units = State.data.units.filter(x => x.id !== u.id);
        State.save();
        toast('Unit deleted');
        nav('#/units');
      });
    }
  };
}

function viewUnit(id) {
  const u = findUnit(id);
  if (!u) return notFound();
  const now = monthKey();
  const bills = billsFor(u.id);
  const rent = rentFor(u, now);
  const thisMonth = billForMonth(u.id, now);

  const history = bills.length ? bills.map(b => {
    const c = compute(b);
    return `
      <a class="hist-row" href="#/invoice/${b.id}" style="text-decoration:none;color:inherit">
        <div class="grow">
          <div style="font-weight:600">${esc(monthShort(b.month))}</div>
          <div class="tiny">Rent ${esc(money(c.rent))} · Utilities ${esc(money(c.utilities))}</div>
        </div>
        <span class="amount">${esc(money(c.total))}</span>
      </a>`;
  }).join('') : '<p class="muted" style="margin:4px 0">No bills recorded yet.</p>';

  const rentRows = (u.rents || []).slice().sort((a, b) => b.from.localeCompare(a.from)).map(r =>
    `<div class="hist-row"><div class="grow"><div style="font-weight:600">${esc(money(r.amount))}</div>
     <div class="tiny">From ${esc(monthShort(r.from))}</div></div>
     <button class="btn sm ghost" data-rm-rent="${esc(r.from)}">Remove</button></div>`
  ).join('') || '<p class="muted" style="margin:4px 0">No rent set yet.</p>';

  return {
    title: u.label,
    sub: u.tenantName || '',
    back: '#/units',
    actions: `<a class="icon-btn" href="#/unit/${u.id}/edit" aria-label="Edit unit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></a>`,
    body: `
      <div class="card">
        <div class="row between">
          <div><div class="tiny">Current rent</div><div class="amount">${esc(money(rent))}</div></div>
          ${u.phone ? `<div class="row" style="gap:8px">
            <a class="btn sm" href="tel:${esc(u.phone)}">Call</a>
            <a class="btn sm" href="sms:${esc(u.phone)}">Text</a>
          </div>` : ''}
        </div>
      </div>

      <a class="btn primary block" href="#/bill/${u.id}/${thisMonth ? thisMonth.month : now}">
        ${thisMonth ? `Edit ${monthShort(now)} bill` : `Create ${monthShort(now)} bill`}
      </a>

      <h2>Bill history</h2>
      <div class="card">${history}</div>

      <h2>Rent history</h2>
      <div class="card">
        ${rentRows}
        <form id="rent-form" class="two" style="margin-top:14px">
          <div><label for="r-amt">New rent</label><input id="r-amt" name="amount" type="number" inputmode="decimal" step="0.01" min="0" required placeholder="0.00"></div>
          <div><label for="r-from">Starting</label><input id="r-from" name="from" type="month" required value="${now}"></div>
          <button class="btn block" type="submit" style="grid-column:1/-1">Set rent</button>
        </form>
        <p class="tiny" style="margin:10px 0 0">Past bills keep the rent they were created with, so changing this never alters old invoices.</p>
      </div>`,
    mount() {
      document.getElementById('rent-form').addEventListener('submit', e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        setRent(u, f.from, f.amount);
        toast('Rent updated');
        render();
      });
      app.querySelectorAll('[data-rm-rent]').forEach(btn =>
        btn.addEventListener('click', () => {
          u.rents = u.rents.filter(r => r.from !== btn.dataset.rmRent);
          State.save();
          render();
        }));
    }
  };
}

function viewBill(unitId, month) {
  const u = findUnit(unitId);
  if (!u) return notFound();

  const existing = billForMonth(unitId, month);
  const open = openingReadings(unitId, month);
  const s = State.data.settings;

  const b = existing || {
    unitId, month,
    elecPrev: open.elecPrev, elecCurr: '',
    waterPrev: open.waterPrev, waterCurr: '',
    elecRate: s.elecRate, waterRate: s.waterRate,
    rent: rentFor(u, month),
    adjustment: 0, adjustmentNote: '',
    issuedOn: new Date().toISOString().slice(0, 10)
  };

  const carried = !existing && open.fromMonth
    ? `<div class="banner info">${ICON.warn}<span>Opening readings carried over from ${esc(monthShort(open.fromMonth))}.</span></div>`
    : '';

  return {
    title: existing ? 'Edit bill' : 'New bill',
    sub: `${u.label} · ${monthLabel(month)}`,
    back: `#/unit/${unitId}`,
    body: `
      ${carried}
      <form id="bill-form">
        <div class="card">
          <div class="field">
            <label for="b-month">Billing month</label>
            <input id="b-month" name="month" type="month" required value="${esc(b.month)}">
          </div>

          <h2 style="margin-top:6px">Electricity (${esc(s.elecUnit)})</h2>
          <div class="two">
            <div class="field"><label for="b-ep">Previous reading</label>
              <input id="b-ep" name="elecPrev" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(b.elecPrev))}"></div>
            <div class="field"><label for="b-ec">Current reading</label>
              <input id="b-ec" name="elecCurr" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(b.elecCurr))}"></div>
          </div>
          <div class="field"><label for="b-er">Rate per ${esc(s.elecUnit)}</label>
            <input id="b-er" name="elecRate" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(b.elecRate))}"></div>

          <h2>Water (${esc(s.waterUnit)})</h2>
          <div class="two">
            <div class="field"><label for="b-wp">Previous reading</label>
              <input id="b-wp" name="waterPrev" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(b.waterPrev))}"></div>
            <div class="field"><label for="b-wc">Current reading</label>
              <input id="b-wc" name="waterCurr" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(b.waterCurr))}"></div>
          </div>
          <div class="field"><label for="b-wr">Rate per ${esc(s.waterUnit)}</label>
            <input id="b-wr" name="waterRate" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(b.waterRate))}"></div>

          <h2>Rent &amp; adjustments</h2>
          <div class="field"><label for="b-rent">Rent for this month</label>
            <input id="b-rent" name="rent" type="number" inputmode="decimal" step="0.01" min="0" required value="${esc(money0(b.rent))}"></div>
          <div class="two">
            <div class="field"><label for="b-adj">Adjustment</label>
              <input id="b-adj" name="adjustment" type="number" inputmode="decimal" step="0.01" placeholder="0.00" value="${b.adjustment ? esc(b.adjustment) : ''}"></div>
            <div class="field"><label for="b-adjn">Reason</label>
              <input id="b-adjn" name="adjustmentNote" placeholder="e.g. Repair" value="${esc(b.adjustmentNote || '')}"></div>
          </div>
          <p class="tiny" style="margin:-4px 0 0">Use a negative adjustment for a discount or credit.</p>
        </div>

        <div class="card readout" id="readout"></div>
        <div id="bill-err"></div>
        <button class="btn primary block" type="submit">${existing ? 'Save bill' : 'Save &amp; preview invoice'}</button>
      </form>
      ${existing ? `<button class="btn danger block" id="del-bill" style="margin-top:12px">Delete this bill</button>` : ''}`,
    mount() {
      const form = document.getElementById('bill-form');
      const readout = document.getElementById('readout');
      const errBox = document.getElementById('bill-err');

      const read = () => {
        const f = Object.fromEntries(new FormData(form));
        return { ...b, ...f };
      };

      const problems = draft => {
        const out = [];
        if (Number(draft.elecCurr) < Number(draft.elecPrev))
          out.push(`Electricity current reading (${num(draft.elecCurr)}) is lower than the previous one (${num(draft.elecPrev)}). Check for a typo, or correct the previous reading.`);
        if (Number(draft.waterCurr) < Number(draft.waterPrev))
          out.push(`Water current reading (${num(draft.waterCurr)}) is lower than the previous one (${num(draft.waterPrev)}). Check for a typo, or correct the previous reading.`);
        return out;
      };

      const refresh = () => {
        const draft = read();
        const c = compute(draft);
        readout.innerHTML = `
          <div class="line"><span class="lbl">Electricity · ${esc(num(c.elecUsed))} ${esc(s.elecUnit)}</span><span>${esc(money(c.elecAmount))}</span></div>
          <div class="line"><span class="lbl">Water · ${esc(num(c.waterUsed))} ${esc(s.waterUnit)}</span><span>${esc(money(c.waterAmount))}</span></div>
          <div class="line"><span class="lbl">Rent</span><span>${esc(money(c.rent))}</span></div>
          ${c.adjustment ? `<div class="line"><span class="lbl">${esc(draft.adjustmentNote || 'Adjustment')}</span><span>${esc(money(c.adjustment))}</span></div>` : ''}
          <div class="line total"><span>Total</span><span>${esc(money(c.total))}</span></div>`;
        const errs = problems(draft);
        errBox.innerHTML = errs.map(e => `<div class="banner">${ICON.warn}<span>${esc(e)}</span></div>`).join('');
      };

      form.addEventListener('input', refresh);
      refresh();

      form.addEventListener('submit', e => {
        e.preventDefault();
        const draft = read();
        if (problems(draft).length) {
          toast('Fix the reading before saving');
          errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        const clash = State.data.bills.find(x =>
          x.unitId === unitId && x.month === draft.month && x.id !== (existing?.id));
        if (clash && !confirm(`A bill for ${monthLabel(draft.month)} already exists. Replace it?`)) return;
        if (clash) deleteBill(clash.id);

        const payload = {
          id: existing?.id,
          unitId,
          month: draft.month,
          issuedOn: b.issuedOn || new Date().toISOString().slice(0, 10),
          elecPrev: Number(draft.elecPrev) || 0,
          elecCurr: Number(draft.elecCurr) || 0,
          waterPrev: Number(draft.waterPrev) || 0,
          waterCurr: Number(draft.waterCurr) || 0,
          elecRate: Number(draft.elecRate) || 0,
          waterRate: Number(draft.waterRate) || 0,
          rent: Number(draft.rent) || 0,
          adjustment: Number(draft.adjustment) || 0,
          adjustmentNote: (draft.adjustmentNote || '').trim()
        };
        const id = saveBill(payload);
        toast('Bill saved');
        nav(`#/invoice/${id}`);
      });

      document.getElementById('del-bill')?.addEventListener('click', () => {
        if (!confirm('Delete this bill? This cannot be undone.')) return;
        deleteBill(existing.id);
        toast('Bill deleted');
        nav(`#/unit/${unitId}`);
      });
    }
  };
}

function viewInvoice(billId) {
  const bill = findBill(billId);
  if (!bill) return notFound();
  const u = findUnit(bill.unitId);
  if (!u) return notFound();

  return {
    title: 'Invoice',
    sub: `${u.label} · ${monthShort(bill.month)}`,
    back: `#/unit/${bill.unitId}`,
    body: `
      <img class="preview" id="inv-preview" alt="Invoice for ${esc(u.label)}, ${esc(monthLabel(bill.month))}">
      <div class="stack" style="margin-top:16px">
        <button class="btn primary block" id="share-img">${ICON.share} Send invoice image</button>
        <button class="btn block" id="copy-text">${ICON.copy} Copy as text</button>
        <a class="btn ghost block" href="#/bill/${bill.unitId}/${bill.month}">Edit this bill</a>
      </div>
      <p class="tiny" style="text-align:center;margin-top:14px">Due ${esc(fmtDate(dueDate(bill.month)))}</p>`,
    mount() {
      let canvas;
      try {
        canvas = renderInvoice(bill, u);
        document.getElementById('inv-preview').src = canvas.toDataURL('image/png');
      } catch (err) {
        console.error(err);
        toast('Could not draw the invoice');
        return;
      }

      document.getElementById('share-img').addEventListener('click', async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const result = await shareInvoice(canvas, invoiceFilename(bill, u));
          if (result === 'downloaded') toast('Image saved to your downloads');
          if (result === 'shared') toast('Shared');
        } catch (err) {
          console.error(err);
          toast('Could not share the image');
        } finally {
          btn.disabled = false;
        }
      });

      document.getElementById('copy-text').addEventListener('click', async () => {
        const text = invoiceText(bill, u);
        try {
          await navigator.clipboard.writeText(text);
          toast('Copied');
        } catch {
          prompt('Copy the invoice text:', text);
        }
      });
    }
  };
}

function viewHistory() {
  const bills = State.data.bills.slice().sort((a, b) => b.month.localeCompare(a.month));
  if (!bills.length) {
    return { title: 'History', body: `<div class="empty">${ICON.history}<p>No bills yet.<br>Create one from a unit.</p></div>` };
  }

  const groups = {};
  for (const b of bills) (groups[b.month] ||= []).push(b);

  const body = Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(month => {
    const rows = groups[month];
    const total = rows.reduce((sum, b) => sum + compute(b).total, 0);
    return `
      <h2>${esc(monthLabel(month))}</h2>
      <div class="card">
        ${rows.map(b => {
          const u = findUnit(b.unitId);
          const c = compute(b);
          return `<a class="hist-row" href="#/invoice/${b.id}" style="text-decoration:none;color:inherit">
            <div class="grow">
              <div style="font-weight:600">${esc(u ? u.label : 'Deleted unit')}</div>
              <div class="tiny">Rent ${esc(money(c.rent))} · Elec ${esc(money(c.elecAmount))} · Water ${esc(money(c.waterAmount))}</div>
            </div>
            <span class="amount">${esc(money(c.total))}</span>
          </a>`;
        }).join('')}
        <div class="hist-row" style="border-top:2px solid var(--line);border-bottom:0">
          <span class="grow" style="font-weight:700">Month total</span>
          <span class="amount">${esc(money(total))}</span>
        </div>
      </div>`;
  }).join('');

  return {
    title: 'History',
    sub: `${bills.length} bill${bills.length > 1 ? 's' : ''}`,
    body: body + `<button class="btn block" id="csv" style="margin-top:18px">Export all as CSV</button>`,
    mount() {
      document.getElementById('csv').addEventListener('click', exportCsv);
    }
  };
}

function viewSettings() {
  const s = State.data.settings;
  const last = State.data.lastBackupAt ? new Date(State.data.lastBackupAt) : null;

  return {
    title: 'Settings',
    body: `
      <form id="set-form" class="card">
        <h2 style="margin-top:0">Property</h2>
        <div class="field"><label for="s-prop">Property name</label>
          <input id="s-prop" name="propertyName" placeholder="Shown on invoices" value="${esc(s.propertyName)}"></div>
        <div class="field"><label for="s-land">Your name</label>
          <input id="s-land" name="landlordName" placeholder="Shown at the foot of invoices" value="${esc(s.landlordName)}"></div>

        <h2>Rates</h2>
        <div class="two">
          <div class="field"><label for="s-er">Electricity rate</label>
            <input id="s-er" name="elecRate" type="number" inputmode="decimal" step="any" min="0" value="${esc(money0(s.elecRate))}"></div>
          <div class="field"><label for="s-eu">Per unit</label>
            <input id="s-eu" name="elecUnit" value="${esc(s.elecUnit)}"></div>
        </div>
        <div class="two">
          <div class="field"><label for="s-wr">Water rate</label>
            <input id="s-wr" name="waterRate" type="number" inputmode="decimal" step="any" min="0" value="${esc(money0(s.waterRate))}"></div>
          <div class="field"><label for="s-wu">Per unit</label>
            <input id="s-wu" name="waterUnit" value="${esc(s.waterUnit)}"></div>
        </div>
        <p class="tiny" style="margin:-4px 0 0">These prefill new bills. Each saved bill keeps the rate it was created with.</p>

        <h2>Invoice</h2>
        <div class="two">
          <div class="field"><label for="s-cur">Currency symbol</label>
            <input id="s-cur" name="currency" value="${esc(s.currency)}"></div>
          <div class="field"><label for="s-due">Due day of month</label>
            <input id="s-due" name="dueDay" type="number" inputmode="numeric" min="1" max="28" value="${esc(s.dueDay)}"></div>
        </div>
        <div class="field switch">
          <input id="s-after" name="currencyAfter" type="checkbox" ${s.currencyAfter ? 'checked' : ''}>
          <label for="s-after" style="margin:0">Show symbol after the amount</label>
        </div>
        <div class="field"><label for="s-note">Footer note</label>
          <textarea id="s-note" name="invoiceNote" placeholder="e.g. Bank transfer to 1234-5678. Thank you!">${esc(s.invoiceNote)}</textarea></div>

        <button class="btn primary block" type="submit">Save settings</button>
      </form>

      <h2>Your data</h2>
      ${backupBanner()}
      <div class="card stack">
        <p class="tiny" style="margin:0">
          Everything is stored on this phone only — nothing is sent anywhere, and there is no account.
          That also means a lost or wiped phone loses the records, so save a backup file somewhere safe
          (email it to yourself, or put it in your cloud drive).
          ${last ? `<br><br>Last backup: <strong>${esc(fmtDate(last))}</strong>.` : ''}
        </p>
        <button class="btn primary block" id="backup">Save backup file</button>
        <button class="btn block" id="restore">Restore from backup</button>
        <button class="btn block" id="csv2">Export history as CSV</button>
        <input type="file" id="restore-file" accept="application/json,.json" hidden>
      </div>

      <h2>Danger zone</h2>
      <div class="card">
        <button class="btn danger block" id="wipe">Erase everything</button>
      </div>
      <p class="tiny" style="text-align:center;margin:18px 0 0">Rental Utility Calculator · works offline</p>`,
    mount() {
      document.getElementById('set-form').addEventListener('submit', e => {
        e.preventDefault();
        const f = new FormData(e.target);
        Object.assign(State.data.settings, {
          propertyName: f.get('propertyName').trim(),
          landlordName: f.get('landlordName').trim(),
          elecRate: Number(f.get('elecRate')) || 0,
          waterRate: Number(f.get('waterRate')) || 0,
          elecUnit: f.get('elecUnit').trim() || 'kWh',
          waterUnit: f.get('waterUnit').trim() || 'm³',
          currency: f.get('currency') || '$',
          currencyAfter: f.get('currencyAfter') === 'on',
          dueDay: Math.min(Math.max(Number(f.get('dueDay')) || 15, 1), 28),
          invoiceNote: f.get('invoiceNote').trim()
        });
        State.save();
        toast('Settings saved');
      });

      document.getElementById('backup').addEventListener('click', backup);
      document.getElementById('csv2').addEventListener('click', exportCsv);

      const picker = document.getElementById('restore-file');
      document.getElementById('restore').addEventListener('click', () => picker.click());
      picker.addEventListener('change', async () => {
        const file = picker.files[0];
        if (!file) return;
        try {
          const parsed = JSON.parse(await file.text());
          if (!parsed || !Array.isArray(parsed.units)) throw new Error('Not a backup file');
          const n = (parsed.bills || []).length;
          if (!confirm(`Restore ${parsed.units.length} unit(s) and ${n} bill(s)? This replaces everything currently on this phone.`)) return;
          State.replaceAll(parsed);
          toast('Backup restored');
          nav('#/units');
        } catch (err) {
          console.error(err);
          alert('That file could not be read as a backup.');
        } finally {
          picker.value = '';
        }
      });

      document.getElementById('wipe').addEventListener('click', () => {
        if (!confirm('Erase all units, bills and settings on this phone? This cannot be undone.')) return;
        if (!confirm('Really erase everything? Make sure you have a backup first.')) return;
        localStorage.removeItem('rmu.v1');
        State.load();
        toast('Everything erased');
        nav('#/units');
      });
    }
  };
}

const notFound = () => ({
  title: 'Not found',
  back: '#/units',
  body: `<div class="empty"><p>That item no longer exists.</p><a class="btn" href="#/units">Back to units</a></div>`
});

/* ================= data export ================= */

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function backup() {
  const stamp = new Date().toISOString().slice(0, 10);
  download(`rental-backup-${stamp}.json`, JSON.stringify(State.data, null, 2), 'application/json');
  State.data.lastBackupAt = new Date().toISOString();
  State.save();
  toast('Backup saved — keep it somewhere safe');
}

function exportCsv() {
  const s = State.data.settings;
  const cell = v => {
    const str = String(v ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const head = ['Month', 'Unit', 'Tenant', 'Rent', 'Elec prev', 'Elec curr', `Elec used (${s.elecUnit})`,
    'Elec rate', 'Elec amount', 'Water prev', 'Water curr', `Water used (${s.waterUnit})`,
    'Water rate', 'Water amount', 'Adjustment', 'Adjustment note', 'Total'];
  const rows = State.data.bills
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(b => {
      const u = findUnit(b.unitId);
      const c = compute(b);
      return [b.month, u?.label || '', u?.tenantName || '', c.rent,
        b.elecPrev, b.elecCurr, c.elecUsed, b.elecRate, c.elecAmount,
        b.waterPrev, b.waterCurr, c.waterUsed, b.waterRate, c.waterAmount,
        c.adjustment, b.adjustmentNote || '', c.total].map(cell).join(',');
    });
  download(`rental-history-${new Date().toISOString().slice(0, 10)}.csv`,
    [head.map(cell).join(','), ...rows].join('\n'), 'text/csv');
  toast('CSV exported');
}

/* ================= router ================= */

const ROUTES = [
  [/^\/units?$/, viewUnits],
  [/^\/unit\/new$/, () => viewUnitForm('new')],
  [/^\/unit\/([^/]+)\/edit$/, id => viewUnitForm(id)],
  [/^\/unit\/([^/]+)$/, id => viewUnit(id)],
  [/^\/bill\/([^/]+)\/([^/]+)$/, (unitId, month) => viewBill(unitId, month)],
  [/^\/invoice\/([^/]+)$/, id => viewInvoice(id)],
  [/^\/history$/, viewHistory],
  [/^\/settings$/, viewSettings]
];

function currentTab(path) {
  if (path.startsWith('/history')) return 'history';
  if (path.startsWith('/settings')) return 'settings';
  return 'units';
}

function render() {
  const path = (location.hash || '#/units').slice(1) || '/units';
  let view = null;
  for (const [re, fn] of ROUTES) {
    const m = path.match(re);
    if (m) { view = fn(...m.slice(1)); break; }
  }
  if (!view) view = viewUnits();

  const tab = currentTab(path);
  document.getElementById('topbar').innerHTML = `
    ${view.back ? `<a class="icon-btn" href="${view.back}" aria-label="Back">${ICON.back}</a>` : ''}
    <h1>${esc(view.title)}${view.sub ? `<span class="sub">${esc(view.sub)}</span>` : ''}</h1>
    ${view.actions || ''}`;

  app.innerHTML = view.body;
  view.mount?.();

  document.querySelectorAll('.tabbar a').forEach(a =>
    a.classList.toggle('on', a.dataset.tab === tab));

  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

State.load();
if (!location.hash) location.hash = '#/units';
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW failed', err)));
}
