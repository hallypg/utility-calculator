import {
  State, uid, monthKey, monthLabel, monthShort, shiftMonth,
  units, activeUnits, findUnit, addUnit, rentOf,
  billsFor, findBill, billForMonth, openingReadings, saveBill, deleteBill,
  compute, money, num, dueDate, fmtDate, monthNames
} from './store.js';
import { renderInvoice, invoiceFilename, shareInvoice, invoiceText } from './invoice.js';
import { t, setLang, getLang, detectLang, plural, LANGUAGES } from './i18n.js';

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

/* A month picker we render ourselves. The native control is drawn by the OS
   in the phone's language, which leaves English months inside a Vietnamese
   screen, so it cannot be used here. */
function monthField(id, name, value) {
  const [vy, vm] = value.split('-').map(Number);
  const thisYear = new Date().getFullYear();
  const from = Math.min(thisYear - 5, vy);
  const to = Math.max(thisYear + 2, vy);

  const months = monthNames()
    .map((label, i) => {
      const v = String(i + 1).padStart(2, '0');
      return `<option value="${v}" ${i + 1 === vm ? 'selected' : ''}>${esc(label)}</option>`;
    })
    .join('');

  let years = '';
  for (let y = to; y >= from; y--) {
    years += `<option value="${y}" ${y === vy ? 'selected' : ''}>${y}</option>`;
  }

  return `<input type="hidden" id="${id}" name="${name}" value="${esc(value)}">
    <div class="month-field">
      <select id="${id}-m" data-mf="${id}" aria-label="${esc(t('bill.month'))}">${months}</select>
      <select id="${id}-y" data-mf="${id}" aria-label="${esc(t('bill.month'))}">${years}</select>
    </div>`;
}

/* Keeps the hidden field (the one forms read) in step with the two selects. */
function bindMonthFields() {
  app.querySelectorAll('select[data-mf]').forEach(sel => {
    sel.addEventListener('change', () => {
      const id = sel.dataset.mf;
      const hidden = document.getElementById(id);
      if (!hidden) return;
      hidden.value = `${document.getElementById(id + '-y').value}-${document.getElementById(id + '-m').value}`;
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

/* A toast that stays put until tapped — used for the update prompt. */
function updateToast(onTap) {
  if (document.querySelector('.toast.tappable')) return;
  const el = document.createElement('button');
  el.className = 'toast tappable';
  el.type = 'button';
  el.textContent = t('app.updateReady');
  el.addEventListener('click', () => {
    el.textContent = t('app.updating');
    el.disabled = true;
    onTap();
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
}

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
    banners.push(`<a class="banner info" href="#/settings">${ICON.warn}<span>${esc(t('units.needRates'))}</span></a>`);
  }
  banners.push(backupBanner());

  const body = list.length ? list.map(u => {
    const bill = billForMonth(u.id, now);
    const rent = rentOf(u);
    return `
      <a class="card tap" href="#/unit/${u.id}">
        <div class="row between">
          <div class="grow">
            <div class="unit-label truncate">${esc(u.label)}</div>
            <div class="muted truncate">${esc(u.tenantName || t('inv.tenant'))}</div>
          </div>
          <span class="pill ${bill ? 'done' : 'todo'}">${esc(bill ? t('units.billed') : t('units.notBilled'))}</span>
        </div>
        <div class="row between" style="margin-top:12px">
          <span class="tiny">${esc(t('units.rent', { amount: money(rent) }))}</span>
          <span class="amount">${bill ? esc(money(compute(bill).total)) : '—'}</span>
        </div>
      </a>`;
  }).join('') : `
    <div class="empty">
      ${ICON.empty}
      <p>${t('units.empty')}</p>
      <a class="btn primary" href="#/unit/new">${ICON.plus} ${esc(t('units.addFirst'))}</a>
    </div>`;

  return {
    title: t('units.title'),
    sub: list.length ? t('units.sub', { n: list.length, s: plural(list.length), month: monthLabel(now) }) : '',
    actions: list.length ? `<a class="icon-btn" href="#/unit/new" aria-label="${esc(t('units.add'))}">${ICON.plus}</a>` : '',
    body: banners.join('') + body
  };
}

function backupBanner() {
  const last = State.data.lastBackupAt ? new Date(State.data.lastBackupAt) : null;
  if (!State.data.bills.length) return '';
  const days = last ? (Date.now() - last.getTime()) / 86400000 : Infinity;
  if (days < 45) return '';
  const msg = last ? t('backup.stale', { days: Math.floor(days) }) : t('backup.never');
  return `<a class="banner" href="#/settings">${ICON.warn}<span>${esc(msg)} ${esc(t('backup.tap'))}</span></a>`;
}

function viewUnitForm(id) {
  const u = id === 'new' ? null : findUnit(id);
  if (id !== 'new' && !u) return notFound();
  return {
    title: u ? t('unit.edit') : t('unit.add'),
    back: u ? `#/unit/${u.id}` : '#/units',
    body: `
      <form id="unit-form" class="card">
        <div class="field">
          <label for="f-label">${esc(t('unit.name'))}</label>
          <input id="f-label" name="label" required placeholder="${esc(t('unit.namePh'))}" value="${esc(u?.label || '')}">
        </div>
        <div class="field">
          <label for="f-tenant">${esc(t('unit.tenant'))}</label>
          <input id="f-tenant" name="tenantName" placeholder="${esc(t('unit.tenantPh'))}" value="${esc(u?.tenantName || '')}">
        </div>
        <div class="field">
          <label for="f-phone">${esc(t('unit.phone'))}</label>
          <input id="f-phone" name="phone" type="tel" inputmode="tel" placeholder="${esc(t('unit.phonePh'))}" value="${esc(u?.phone || '')}">
        </div>
        <div class="field">
          <label for="f-rent">${esc(t('unit.rent'))}</label>
          <input id="f-rent" name="rent" type="number" inputmode="decimal" step="any" min="0" value="${esc(u ? (u.rent || '') : '')}">
        </div>
        <p class="tiny" style="margin:-4px 0 14px">${esc(t('unit.rentNote'))}</p>
        <button class="btn primary block" type="submit">${esc(u ? t('unit.save') : t('unit.add'))}</button>
      </form>
      ${u ? `<button class="btn danger block" id="archive-unit" style="margin-top:12px">${esc(t('unit.delete'))}</button>` : ''}`,
    mount() {
      document.getElementById('unit-form').addEventListener('submit', e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        if (!f.label.trim()) return;
        if (u) {
          Object.assign(u, {
            label: f.label.trim(),
            tenantName: f.tenantName.trim(),
            phone: f.phone.trim(),
            rent: Number(f.rent) || 0
          });
          State.save();
          toast(t('unit.updated'));
          nav(`#/unit/${u.id}`);
        } else {
          const created = addUnit(f);
          toast(t('unit.added'));
          nav(`#/unit/${created.id}`);
        }
      });
      document.getElementById('archive-unit')?.addEventListener('click', () => {
        const n = billsFor(u.id).length;
        if (!confirm(t('unit.confirmDelete', { label: u.label, n }))) return;
        State.data.bills = State.data.bills.filter(b => b.unitId !== u.id);
        State.data.units = State.data.units.filter(x => x.id !== u.id);
        State.save();
        toast(t('unit.deleted'));
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
  const rent = rentOf(u);
  const thisMonth = billForMonth(u.id, now);

  const history = bills.length ? bills.map(b => {
    const c = compute(b);
    return `
      <a class="hist-row" href="#/invoice/${b.id}" style="text-decoration:none;color:inherit">
        <div class="grow">
          <div style="font-weight:600">${esc(monthShort(b.month))}</div>
          <div class="tiny">${esc(t('unit.billSummary', { rent: money(c.rent), utilities: money(c.utilities) }))}</div>
        </div>
        <span class="amount">${esc(money(c.total))}</span>
      </a>`;
  }).join('') : `<p class="muted" style="margin:4px 0">${esc(t('unit.noBills'))}</p>`;

  return {
    title: u.label,
    sub: u.tenantName || '',
    back: '#/units',
    actions: `<a class="icon-btn" href="#/unit/${u.id}/edit" aria-label="${esc(t('unit.edit'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></a>`,
    body: `
      <div class="card">
        <div class="row between">
          <div><div class="tiny">${esc(t('unit.currentRent'))}</div><div class="amount">${esc(money(rent))}</div></div>
          ${u.phone ? `<div class="row" style="gap:8px">
            <a class="btn sm" href="tel:${esc(u.phone)}">${esc(t('unit.call'))}</a>
            <a class="btn sm" href="sms:${esc(u.phone)}">${esc(t('unit.text'))}</a>
          </div>` : ''}
        </div>
      </div>

      <a class="btn primary block" href="#/bill/${u.id}/${thisMonth ? thisMonth.month : now}">
        ${esc(thisMonth ? t('unit.editBill', { month: monthShort(now) }) : t('unit.createBill', { month: monthShort(now) }))}
      </a>

      <h2>${esc(t('unit.billHistory'))}</h2>
      <div class="card">${history}</div>`
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
    rent: rentOf(u),
    adjustment: 0, adjustmentNote: '',
    issuedOn: new Date().toISOString().slice(0, 10)
  };

  const carried = !existing && open.fromMonth
    ? `<div class="banner info">${ICON.warn}<span>${esc(t('bill.carried', { month: monthShort(open.fromMonth) }))}</span></div>`
    : '';

  return {
    title: existing ? t('bill.edit') : t('bill.new'),
    sub: `${u.label} · ${monthLabel(month)}`,
    back: `#/unit/${unitId}`,
    body: `
      ${carried}
      <form id="bill-form">
        <div class="card">
          <div class="field">
            <label for="b-month-m">${esc(t('bill.month'))}</label>
            ${monthField('b-month', 'month', b.month)}
          </div>

          <h2 style="margin-top:6px">${esc(t('bill.electricity', { unit: s.elecUnit }))}</h2>
          <div class="two">
            <div class="field"><label for="b-ep">${esc(t('bill.prev'))}</label>
              <input id="b-ep" name="elecPrev" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(b.elecPrev))}"></div>
            <div class="field"><label for="b-ec">${esc(t('bill.curr'))}</label>
              <input id="b-ec" name="elecCurr" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(b.elecCurr))}"></div>
          </div>
          <div class="field"><label for="b-er">${esc(t('bill.rate', { unit: s.elecUnit }))}</label>
            <input id="b-er" name="elecRate" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(b.elecRate))}"></div>

          <h2>${esc(t('bill.water', { unit: s.waterUnit }))}</h2>
          <div class="two">
            <div class="field"><label for="b-wp">${esc(t('bill.prev'))}</label>
              <input id="b-wp" name="waterPrev" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(b.waterPrev))}"></div>
            <div class="field"><label for="b-wc">${esc(t('bill.curr'))}</label>
              <input id="b-wc" name="waterCurr" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(b.waterCurr))}"></div>
          </div>
          <div class="field"><label for="b-wr">${esc(t('bill.rate', { unit: s.waterUnit }))}</label>
            <input id="b-wr" name="waterRate" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(b.waterRate))}"></div>

          <h2>${esc(t('bill.rentSection'))}</h2>
          <div class="field"><label for="b-rent">${esc(t('bill.rent'))}</label>
            <input id="b-rent" name="rent" type="number" inputmode="decimal" step="0.01" min="0" required value="${esc(money0(b.rent))}"></div>
          <div class="two">
            <div class="field"><label for="b-adj">${esc(t('bill.adjustment'))}</label>
              <input id="b-adj" name="adjustment" type="number" inputmode="decimal" step="0.01" placeholder="0.00" value="${b.adjustment ? esc(b.adjustment) : ''}"></div>
            <div class="field"><label for="b-adjn">${esc(t('bill.reason'))}</label>
              <input id="b-adjn" name="adjustmentNote" placeholder="${esc(t('bill.reasonPh'))}" value="${esc(b.adjustmentNote || '')}"></div>
          </div>
          <p class="tiny" style="margin:-4px 0 0">${esc(t('bill.adjustNote'))}</p>
        </div>

        <div class="card readout" id="readout"></div>
        <div id="bill-err"></div>
        <button class="btn primary block" type="submit">${esc(existing ? t('bill.save') : t('bill.saveNew'))}</button>
      </form>
      ${existing ? `<button class="btn danger block" id="del-bill" style="margin-top:12px">${esc(t('bill.delete'))}</button>` : ''}`,
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
          out.push(t('bill.backwardsElec', { curr: num(draft.elecCurr), prev: num(draft.elecPrev) }));
        if (Number(draft.waterCurr) < Number(draft.waterPrev))
          out.push(t('bill.backwardsWater', { curr: num(draft.waterCurr), prev: num(draft.waterPrev) }));
        return out;
      };

      const refresh = () => {
        const draft = read();
        const c = compute(draft);
        readout.innerHTML = `
          <div class="line"><span class="lbl">${esc(t('inv.electricity'))} · ${esc(num(c.elecUsed))} ${esc(s.elecUnit)}</span><span>${esc(money(c.elecAmount))}</span></div>
          <div class="line"><span class="lbl">${esc(t('inv.water'))} · ${esc(num(c.waterUsed))} ${esc(s.waterUnit)}</span><span>${esc(money(c.waterAmount))}</span></div>
          <div class="line"><span class="lbl">${esc(t('inv.rent'))}</span><span>${esc(money(c.rent))}</span></div>
          ${c.adjustment ? `<div class="line"><span class="lbl">${esc(draft.adjustmentNote || t('inv.adjustment'))}</span><span>${esc(money(c.adjustment))}</span></div>` : ''}
          <div class="line total"><span>${esc(t('bill.total'))}</span><span>${esc(money(c.total))}</span></div>`;
        const errs = problems(draft);
        errBox.innerHTML = errs.map(e => `<div class="banner">${ICON.warn}<span>${esc(e)}</span></div>`).join('');
      };

      form.addEventListener('input', refresh);
      refresh();

      form.addEventListener('submit', e => {
        e.preventDefault();
        const draft = read();
        if (problems(draft).length) {
          toast(t('bill.fixFirst'));
          errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        const clash = State.data.bills.find(x =>
          x.unitId === unitId && x.month === draft.month && x.id !== (existing?.id));
        if (clash && !confirm(t('bill.confirmReplace', { month: monthLabel(draft.month) }))) return;
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
        toast(t('bill.saved'));
        nav(`#/invoice/${id}`);
      });

      document.getElementById('del-bill')?.addEventListener('click', () => {
        if (!confirm(t('bill.confirmDelete'))) return;
        deleteBill(existing.id);
        toast(t('bill.deleted'));
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
    title: t('invoice.title'),
    sub: `${u.label} · ${monthShort(bill.month)}`,
    back: `#/unit/${bill.unitId}`,
    body: `
      <img class="preview" id="inv-preview" alt="${esc(t('invoice.title'))} — ${esc(u.label)}, ${esc(monthLabel(bill.month))}">
      <div class="stack" style="margin-top:16px">
        <button class="btn primary block" id="share-img">${ICON.share} ${esc(t('invoice.send'))}</button>
        <button class="btn block" id="copy-text">${ICON.copy} ${esc(t('invoice.copy'))}</button>
        <a class="btn ghost block" href="#/bill/${bill.unitId}/${bill.month}">${esc(t('invoice.editBill'))}</a>
      </div>
      <p class="tiny" style="text-align:center;margin-top:14px">${esc(t('invoice.due', { date: fmtDate(dueDate(bill.month)) }))}</p>`,
    mount() {
      let canvas;
      try {
        canvas = renderInvoice(bill, u);
        document.getElementById('inv-preview').src = canvas.toDataURL('image/png');
      } catch (err) {
        console.error(err);
        toast(t('invoice.drawFailed'));
        return;
      }

      document.getElementById('share-img').addEventListener('click', async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const result = await shareInvoice(canvas, invoiceFilename(bill, u));
          if (result === 'downloaded') toast(t('invoice.saved'));
          if (result === 'shared') toast(t('invoice.shared'));
        } catch (err) {
          console.error(err);
          toast(t('invoice.shareFailed'));
        } finally {
          btn.disabled = false;
        }
      });

      document.getElementById('copy-text').addEventListener('click', async () => {
        const text = invoiceText(bill, u);
        try {
          await navigator.clipboard.writeText(text);
          toast(t('invoice.copied'));
        } catch {
          prompt(t('invoice.copyPrompt'), text);
        }
      });
    }
  };
}

function viewHistory() {
  const bills = State.data.bills.slice().sort((a, b) => b.month.localeCompare(a.month));
  if (!bills.length) {
    return { title: t('history.title'), body: `<div class="empty">${ICON.history}<p>${t('history.empty')}</p></div>` };
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
              <div style="font-weight:600">${esc(u ? u.label : t('history.deletedUnit'))}</div>
              <div class="tiny">${esc(t('history.rowSummary', { rent: money(c.rent), elec: money(c.elecAmount), water: money(c.waterAmount) }))}</div>
            </div>
            <span class="amount">${esc(money(c.total))}</span>
          </a>`;
        }).join('')}
        <div class="hist-row" style="border-top:2px solid var(--line);border-bottom:0">
          <span class="grow" style="font-weight:700">${esc(t('history.monthTotal'))}</span>
          <span class="amount">${esc(money(total))}</span>
        </div>
      </div>`;
  }).join('');

  return {
    title: t('history.title'),
    sub: t('history.sub', { n: bills.length, s: plural(bills.length) }),
    body: body + `<button class="btn block" id="csv" style="margin-top:18px">${esc(t('history.exportCsv'))}</button>`,
    mount() {
      document.getElementById('csv').addEventListener('click', exportCsv);
    }
  };
}

function viewSettings() {
  const s = State.data.settings;
  const last = State.data.lastBackupAt ? new Date(State.data.lastBackupAt) : null;

  return {
    title: t('set.title'),
    body: `
      <form id="set-form" class="card">
        <h2 style="margin-top:0">${esc(t('set.language'))}</h2>
        <div class="field">
          <select id="s-lang" name="lang">
            ${LANGUAGES.map(l => `<option value="${l.code}" ${l.code === getLang() ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
          </select>
        </div>

        <h2>${esc(t('set.rates'))}</h2>
        <div class="two">
          <div class="field"><label for="s-er">${esc(t('set.elecRate'))}</label>
            <input id="s-er" name="elecRate" type="number" inputmode="decimal" step="any" min="0" value="${esc(money0(s.elecRate))}"></div>
          <div class="field"><label for="s-eu">${esc(t('set.perUnit'))}</label>
            <input id="s-eu" name="elecUnit" value="${esc(s.elecUnit)}"></div>
        </div>
        <div class="two">
          <div class="field"><label for="s-wr">${esc(t('set.waterRate'))}</label>
            <input id="s-wr" name="waterRate" type="number" inputmode="decimal" step="any" min="0" value="${esc(money0(s.waterRate))}"></div>
          <div class="field"><label for="s-wu">${esc(t('set.perUnit'))}</label>
            <input id="s-wu" name="waterUnit" value="${esc(s.waterUnit)}"></div>
        </div>
        <p class="tiny" style="margin:-4px 0 0">${esc(t('set.ratesNote'))}</p>

        <h2>${esc(t('set.invoice'))}</h2>
        <div class="two">
          <div class="field"><label for="s-cur">${esc(t('set.currency'))}</label>
            <input id="s-cur" name="currency" value="${esc(s.currency)}"></div>
          <div class="field"><label for="s-dec">${esc(t('set.decimals'))}</label>
            <select id="s-dec" name="decimals">
              <option value="0" ${s.decimals === 0 ? 'selected' : ''}>0</option>
              <option value="2" ${s.decimals !== 0 ? 'selected' : ''}>2</option>
            </select></div>
        </div>
        <div class="field"><label for="s-due">${esc(t('set.dueDay'))}</label>
          <input id="s-due" name="dueDay" type="number" inputmode="numeric" min="1" max="28" value="${esc(s.dueDay)}"></div>
        <div class="field switch">
          <input id="s-after" name="currencyAfter" type="checkbox" ${s.currencyAfter ? 'checked' : ''}>
          <label for="s-after" style="margin:0">${esc(t('set.symbolAfter'))}</label>
        </div>
        <div class="field"><label for="s-note">${esc(t('set.note'))}</label>
          <textarea id="s-note" name="invoiceNote" placeholder="${esc(t('set.notePh'))}">${esc(s.invoiceNote)}</textarea></div>

        <button class="btn primary block" type="submit">${esc(t('set.save'))}</button>
      </form>

      <h2>${esc(t('set.data'))}</h2>
      ${backupBanner()}
      <div class="card stack">
        <p class="tiny" style="margin:0">
          ${esc(t('set.dataNote'))}
          ${last ? `<br><br>${esc(t('set.lastBackup', { date: fmtDate(last) }))}` : ''}
        </p>
        <button class="btn primary block" id="backup">${esc(t('set.backup'))}</button>
        <button class="btn block" id="restore">${esc(t('set.restore'))}</button>
        <button class="btn block" id="csv2">${esc(t('set.exportCsv'))}</button>
        <input type="file" id="restore-file" accept="application/json,.json" hidden>
      </div>

      <h2>${esc(t('set.danger'))}</h2>
      <div class="card">
        <button class="btn danger block" id="wipe">${esc(t('set.wipe'))}</button>
      </div>
      <p class="tiny" style="text-align:center;margin:18px 0 0">${esc(t('set.footer'))}</p>`,
    mount() {
      document.getElementById('set-form').addEventListener('submit', e => {
        e.preventDefault();
        const f = new FormData(e.target);
        Object.assign(State.data.settings, {
          lang: f.get('lang'),
          decimals: Number(f.get('decimals')) === 0 ? 0 : 2,
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
        applyLang(State.data.settings.lang);
        toast(t('set.saved'));
        render();
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
          if (!confirm(t('set.confirmRestore', { units: parsed.units.length, bills: n }))) return;
          State.replaceAll(parsed);
          applyLang(State.data.settings.lang);
          toast(t('set.restored'));
          nav('#/units');
        } catch (err) {
          console.error(err);
          alert(t('set.badFile'));
        } finally {
          picker.value = '';
        }
      });

      document.getElementById('wipe').addEventListener('click', () => {
        if (!confirm(t('set.confirmWipe'))) return;
        if (!confirm(t('set.confirmWipe2'))) return;
        localStorage.removeItem('rmu.v1');
        State.load();
        applyLang(State.data.settings.lang);
        toast(t('set.wiped'));
        nav('#/units');
      });
    }
  };
}

const notFound = () => ({
  title: t('nf.title'),
  back: '#/units',
  body: `<div class="empty"><p>${esc(t('nf.body'))}</p><a class="btn" href="#/units">${esc(t('nf.back'))}</a></div>`
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
  toast(t('set.backupSaved'));
}

function exportCsv() {
  const s = State.data.settings;
  const cell = v => {
    const str = String(v ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const head = [t('csv.month'), t('csv.unit'), t('csv.tenant'), t('csv.rent'),
    t('csv.elecPrev'), t('csv.elecCurr'), t('csv.elecUsed', { unit: s.elecUnit }),
    t('csv.elecRate'), t('csv.elecAmount'),
    t('csv.waterPrev'), t('csv.waterCurr'), t('csv.waterUsed', { unit: s.waterUnit }),
    t('csv.waterRate'), t('csv.waterAmount'),
    t('csv.adjustment'), t('csv.adjustmentNote'), t('csv.total')];
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
  toast(t('set.csvExported'));
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
  bindMonthFields();
  view.mount?.();

  document.querySelectorAll('.tabbar a').forEach(a => {
    a.classList.toggle('on', a.dataset.tab === tab);
    a.querySelector('.tab-label').textContent = t(`tab.${a.dataset.tab}`);
  });

  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

function applyLang(code) {
  setLang(code);
  document.documentElement.lang = getLang();
}

State.load();

/* First run: follow the phone's language, and start from conventions that
   suit it. Everything here stays editable in Settings. */
if (!State.data.settings.lang) {
  const detected = detectLang();
  State.data.settings.lang = detected;
  if (detected === 'vi' && !State.data.units.length) {
    Object.assign(State.data.settings, { currency: '₫', currencyAfter: true, decimals: 0 });
  }
  State.save();
}
applyLang(State.data.settings.lang);

if (!location.hash) location.hash = '#/units';
render();

/* A home-screen app has no reload button, so it has to offer the update itself.
   The new worker sits in "waiting" until the person taps. */
if ('serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', async () => {
    let reg;
    try {
      reg = await navigator.serviceWorker.register('./sw.js');
    } catch (err) {
      console.warn('SW failed', err);
      return;
    }

    const offer = worker => {
      if (!worker) return;
      updateToast(() => worker.postMessage({ type: 'SKIP_WAITING' }));
    };

    if (reg.waiting) offer(reg.waiting);

    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        // Only an update, not the very first install.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) offer(installing);
      });
    });

    // Check again whenever the app is brought back to the foreground.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
  });
}
