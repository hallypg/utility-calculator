import {
  State, uid, monthKey, monthLabel, monthShort, shiftMonth,
  activeUnits, findUnit, addUnit, rentOf,
  billsFor, findBill, billForMonth, openingReadings, saveBill, deleteBill,
  compute, money, num, dueDate, fmtDate, monthNames, invoiceNumber,
  summary, owedFor, togglePaid, APP_VERSION
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
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.3 0z"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
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
  const sum = summary(now);

  const banners = [];
  if (!s.elecRate && !s.waterRate && list.length) {
    banners.push(`<a class="banner info" href="#/settings">${ICON.warn}<span>${esc(t('units.needRates'))}</span></a>`);
  }

  if (!list.length) {
    return {
      title: t('units.title'),
      body: banners.join('') + `
        <div class="empty">
          ${ICON.empty}
          <p>${t('units.empty')}</p>
          <a class="btn primary" href="#/unit/new">${ICON.plus} ${esc(t('units.addFirst'))}</a>
        </div>`
    };
  }

  const summaryCard = `
    <div class="card summary">
      <div class="col">
        <span class="k">${esc(t('units.owing'))}</span>
        <span class="v">${esc(money(sum.owed))}</span>
        <span class="s">${esc(sum.count ? t('units.owingCount', { n: sum.count, s: plural(sum.count) }) : t('units.allPaid'))}</span>
      </div>
      <div class="col">
        <span class="k">${esc(t('units.billedThis', { month: monthShort(now) }))}</span>
        <span class="v">${esc(num(sum.billedThisMonth))}</span>
        <span class="s">${esc(t('units.created'))}</span>
      </div>
    </div>`;

  const cards = list.map(u => {
    const owed = owedFor(u.id);
    const billed = billForMonth(u.id, now);
    const pill = owed > 0
      ? { cls: 'unpaid', label: t('units.unpaid') }
      : billed ? { cls: 'done', label: t('units.paid') } : { cls: 'todo', label: t('units.notBilled') };
    return `
      <a class="card tap" href="#/unit/${u.id}">
        <div class="unit-row">
          <span class="tile">${ICON.home}</span>
          <span class="grow">
            <span class="unit-label truncate" style="display:block">${esc(u.label)}</span>
            <span class="muted truncate" style="display:block">${esc(u.tenantName || t('inv.tenant'))}</span>
            <span class="tiny" style="display:block">${esc(t('units.rent', { amount: money(rentOf(u)) }))}</span>
          </span>
          <span style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <span class="pill ${pill.cls}">${esc(pill.label)}</span>
            ${owed > 0 ? `<span class="owing">${esc(money(owed))}</span>` : ''}
          </span>
        </div>
      </a>`;
  }).join('');

  return {
    title: t('units.title'),
    sub: monthLabel(now),
    actions: `<a class="icon-btn" href="#/unit/new" aria-label="${esc(t('units.add'))}">${ICON.plus}</a>`,
    body: banners.join('') + summaryCard +
      `<div class="eyebrow">${esc(t('units.count', { n: list.length, s: plural(list.length) }))}</div>` +
      `<div class="stack">${cards}</div>`
  };
}

function backupBanner() {
  const last = State.data.lastBackupAt ? new Date(State.data.lastBackupAt) : null;
  if (!State.data.bills.length) return '';
  const days = last ? (Date.now() - last.getTime()) / 86400000 : Infinity;
  if (days < 45) return '';
  const msg = last ? t('backup.stale', { days: Math.floor(days) }) : t('backup.never');
  return `<div class="banner">${ICON.warn}<span>${esc(msg)}</span></div>`;
}

function viewUnitForm(id) {
  const u = id === 'new' ? null : findUnit(id);
  if (id !== 'new' && !u) return notFound();
  const s = State.data.settings;

  return {
    title: u ? t('unit.edit') : t('unit.add'),
    back: u ? `#/unit/${u.id}` : '#/units',
    bar: true,
    body: `
      <form id="unit-form">
        <p class="tiny" style="margin:0 0 12px 6px"><span class="req" aria-hidden="true">*</span> ${esc(t('unit.required'))}</p>
        <div class="card">
          <div class="eyebrow" style="margin:0 0 12px">${esc(t('unit.sectionUnit'))}</div>
          <div class="field">
            <label for="f-label">${esc(t('unit.name'))} <span class="req" aria-hidden="true">*</span></label>
            <input id="f-label" name="label" required placeholder="${esc(t('unit.namePh'))}" value="${esc(u?.label || '')}">
          </div>
          <div class="field" style="margin-bottom:0">
            <label for="f-address">${esc(t('unit.address'))}</label>
            <input id="f-address" name="address" placeholder="${esc(t('unit.addressPh'))}" value="${esc(u?.address || '')}">
          </div>
        </div>

        <div class="card">
          <div class="eyebrow" style="margin:0 0 12px">${esc(t('unit.sectionTenant'))}</div>
          <div class="field">
            <label for="f-tenant">${esc(t('unit.tenant'))} <span class="req" aria-hidden="true">*</span></label>
            <input id="f-tenant" name="tenantName" required placeholder="${esc(t('unit.tenantPh'))}" value="${esc(u?.tenantName || '')}">
          </div>
          <div class="field" style="margin-bottom:0">
            <label for="f-phone">${esc(t('unit.phone'))}</label>
            <input id="f-phone" name="phone" type="tel" inputmode="tel" placeholder="${esc(t('unit.phonePh'))}" value="${esc(u?.phone || '')}">
          </div>
        </div>

        <div class="card">
          <div class="eyebrow" style="margin:0 0 12px">${esc(t('unit.sectionRent'))}</div>
          <div class="field" style="margin-bottom:8px">
            <label for="f-rent">${esc(t('unit.rent'))} (${esc(s.currency)}) <span class="req" aria-hidden="true">*</span></label>
            <input id="f-rent" name="rent" type="number" inputmode="decimal" step="any" min="0" required value="${esc(u ? (u.rent || '') : '')}">
          </div>
          <p class="tiny" style="margin:0">${esc(t('unit.rentNote'))}</p>
        </div>

        ${u ? '' : `
        <div class="card">
          <div class="eyebrow" style="margin:0 0 4px">${esc(t('unit.startReadings'))}</div>
          <p class="tiny" style="margin:0 0 12px">${esc(t('unit.startHint'))}</p>
          <div class="two">
            <div class="field" style="margin-bottom:0">
              <label for="f-selec">${esc(t('unit.startElec', { unit: s.elecUnit }))}</label>
              <input id="f-selec" name="startElec" type="number" inputmode="decimal" step="any" min="0" placeholder="0">
            </div>
            <div class="field" style="margin-bottom:0">
              <label for="f-swater">${esc(t('unit.startWater', { unit: s.waterUnit }))}</label>
              <input id="f-swater" name="startWater" type="number" inputmode="decimal" step="any" min="0" placeholder="0">
            </div>
          </div>
        </div>`}
      </form>`,
    actionbar: u
      ? `<div class="row" style="gap:10px">
           <button class="btn danger square" id="archive-unit" aria-label="${esc(t('unit.delete'))}">${ICON.trash}</button>
           <button class="btn primary grow" type="submit" form="unit-form">${esc(t('unit.save'))}</button>
         </div>`
      : `<button class="btn primary block" type="submit" form="unit-form">${esc(t('unit.add'))}</button>`,
    mount() {
      document.getElementById('unit-form').addEventListener('submit', e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        if (!f.label.trim() || !f.tenantName.trim() || !String(f.rent).trim()) {
          toast(t('unit.missing'));
          return;
        }
        if (u) {
          Object.assign(u, {
            label: f.label.trim(),
            address: (f.address || '').trim(),
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
  const s = State.data.settings;

  const history = bills.length ? bills.map(b => {
    const c = compute(b);
    return `
      <a class="card tap" href="#/invoice/${b.id}">
        <div class="bill-row">
          <div class="top">
            <span class="left">
              <span style="font-weight:800;font-size:16px">${esc(monthShort(b.month))}</span>
              <span class="pill ${b.paid ? 'done' : 'unpaid'}">${esc(b.paid ? t('units.paid') : t('units.unpaid'))}</span>
            </span>
            <span class="amount">${esc(money(c.total))}</span>
          </div>
          <div class="breakdown">
            <span>${esc(t('inv.rent'))}<b>${esc(money(c.rent))}</b></span>
            <span>${esc(t('inv.electricity'))} · ${esc(num(c.elecUsed))}<b>${esc(money(c.elecAmount))}</b></span>
            <span>${esc(t('inv.water'))} · ${esc(num(c.waterUsed))}<b>${esc(money(c.waterAmount))}</b></span>
          </div>
        </div>
      </a>`;
  }).join('') : `<div class="card"><p class="muted" style="margin:0">${esc(t('unit.noBills'))}</p></div>`;

  const meta = [u.phone, u.address].filter(Boolean).map(esc).join(' · ');

  return {
    title: u.label,
    sub: u.tenantName || '',
    back: '#/units',
    bar: true,
    actions: `<a class="btn sm" href="#/unit/${u.id}/edit">${ICON.edit} ${esc(t('common.edit'))}</a>`,
    body: `
      <div class="card">
        <div class="tiny">${esc(t('inv.tenant'))}</div>
        <div style="font-size:20px;font-weight:800">${esc(u.tenantName || '—')}</div>
        ${meta ? `<div class="muted">${meta}</div>` : ''}
        <div class="row between" style="border-top:1px solid var(--line);margin-top:14px;padding-top:14px">
          <span class="muted" style="font-weight:600">${esc(t('unit.rentPerMonth'))}</span>
          <span class="amount">${esc(money(rentOf(u)))}</span>
        </div>
        ${u.phone ? `<div class="row" style="gap:8px;margin-top:12px">
          <a class="btn sm" href="tel:${esc(u.phone)}">${esc(t('unit.call'))}</a>
          <a class="btn sm" href="sms:${esc(u.phone)}">${esc(t('unit.text'))}</a>
        </div>` : ''}
      </div>

      <div class="eyebrow">${esc(t('unit.billHistory'))}</div>
      <div class="stack">${history}</div>`,
    actionbar: `<a class="btn primary block" href="#/bill/${u.id}/new">
      ${ICON.plus} ${esc(t('unit.newBill'))}
    </a>`
  };
}

function viewBill(unitId, month, forceNew) {
  const u = findUnit(unitId);
  if (!u) return notFound();

  // forceNew keeps the form blank even when that month already has a bill;
  // saving onto an occupied month still asks before replacing it.
  const existing = forceNew ? null : billForMonth(unitId, month);
  const open = openingReadings(unitId, month);
  const s = State.data.settings;

  const b = existing || {
    unitId, month,
    elecPrev: open.elecPrev, elecCurr: '',
    waterPrev: open.waterPrev, waterCurr: '',
    elecRate: s.elecRate, waterRate: s.waterRate,
    rent: rentOf(u),
    issuedOn: new Date().toISOString().slice(0, 10)
  };

  const carried = !existing && open.fromMonth
    ? `<div class="banner info">${ICON.warn}<span>${esc(t('bill.carried', { month: monthShort(open.fromMonth) }))}</span></div>`
    : '';

  const utility = (kind, icon, unitLabel, prevId, currId, rateId, prevVal, currVal, rateVal) => `
    <div class="card">
      <div class="util-head">
        <span class="tile sm ${kind}">${icon}</span>
        <span class="name">${esc(kind === 'elec' ? t('inv.electricity') : t('inv.water'))}</span>
        <span class="rate" id="${rateId}-label"></span>
      </div>
      <div class="two">
        <div class="field" style="margin-bottom:12px">
          <label for="${prevId}">${esc(t('bill.lastMonth'))}</label>
          <input id="${prevId}" name="${prevId.slice(2)}" type="number" inputmode="decimal" step="any" min="0" required
                 placeholder="0" value="${esc(money0(prevVal))}">
        </div>
        <div class="field" style="margin-bottom:12px">
          <label for="${currId}">${esc(t('bill.thisMonth'))}</label>
          <input id="${currId}" name="${currId.slice(2)}" type="number" inputmode="decimal" step="any" min="0" required
                 placeholder="0" value="${esc(money0(currVal))}">
        </div>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label for="${rateId}">${esc(t('bill.rate', { unit: unitLabel }))}</label>
        <input id="${rateId}" name="${rateId.slice(2)}" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(rateVal))}">
      </div>
      <div id="${kind}-err"></div>
      <div class="calc-strip ${kind}">
        <span id="${kind}-calc"></span>
        <span class="amt" id="${kind}-amt"></span>
      </div>
    </div>`;

  return {
    title: existing ? t('bill.edit') : t('bill.new'),
    sub: `${u.label}${u.tenantName ? ` · ${u.tenantName}` : ''} · ${monthLabel(month)}`,
    back: `#/unit/${unitId}`,
    bar: true,
    body: `
      ${carried}
      <form id="bill-form">
        <div class="card">
          <div class="field" style="margin-bottom:0">
            <label for="b-month-m">${esc(t('bill.month'))}</label>
            ${monthField('b-month', 'month', b.month)}
          </div>
        </div>

        ${utility('elec', ICON.bolt, s.elecUnit, 'b-elecPrev', 'b-elecCurr', 'b-elecRate', b.elecPrev, b.elecCurr, b.elecRate)}
        ${utility('water', ICON.drop, s.waterUnit, 'b-waterPrev', 'b-waterCurr', 'b-waterRate', b.waterPrev, b.waterCurr, b.waterRate)}

        <div class="card">
          <div class="field" style="margin-bottom:6px">
            <label for="b-rent" style="font-size:16px;font-weight:800;color:var(--ink)">${esc(t('inv.rent'))}</label>
            <p class="tiny" style="margin:0 0 8px">${esc(t('bill.rentHint'))}</p>
            <input id="b-rent" name="rent" type="number" inputmode="decimal" step="any" min="0" required value="${esc(money0(b.rent))}">
          </div>
        </div>
      </form>`,
    actionbar: `
      <div class="totals">
        <span class="lbl">${esc(t('bill.totalFor', { month: monthShort(month) }))}</span>
        <span class="val" id="bill-total">—</span>
      </div>
      ${existing
        ? `<div class="row" style="gap:10px">
             <button class="btn danger square" id="del-bill" aria-label="${esc(t('bill.delete'))}">${ICON.trash}</button>
             <button class="btn primary grow" type="submit" form="bill-form">${esc(t('bill.save'))}</button>
           </div>`
        : `<button class="btn primary block" type="submit" form="bill-form">${esc(t('bill.saveNew'))}</button>`}`,
    mount() {
      const form = document.getElementById('bill-form');
      const read = () => ({ ...b, ...Object.fromEntries(new FormData(form)) });

      // Only Save evaluates the readings. What it found is held here and
      // rendered as-is, so typing never raises or clears a message.
      let shownErrors = {};
      const entered = v => String(v ?? '').trim() !== '';

      const problems = d => {
        const out = [];
        if (entered(d.elecCurr) && Number(d.elecCurr) < Number(d.elecPrev))
          out.push(['elec', t('bill.backwardsElec', { curr: num(d.elecCurr), prev: num(d.elecPrev) })]);
        if (entered(d.waterCurr) && Number(d.waterCurr) < Number(d.waterPrev))
          out.push(['water', t('bill.backwardsWater', { curr: num(d.waterCurr), prev: num(d.waterPrev) })]);
        return out;
      };

      const refresh = () => {
        const d = read();
        const c = compute(d);
        document.getElementById('b-elecRate-label').textContent = `${money(d.elecRate)} / ${s.elecUnit}`;
        document.getElementById('b-waterRate-label').textContent = `${money(d.waterRate)} / ${s.waterUnit}`;
        document.getElementById('elec-calc').textContent = t('bill.calc', { used: num(c.elecUsed), unit: s.elecUnit, rate: money(d.elecRate) });
        document.getElementById('water-calc').textContent = t('bill.calc', { used: num(c.waterUsed), unit: s.waterUnit, rate: money(d.waterRate) });
        document.getElementById('elec-amt').textContent = money(c.elecAmount);
        document.getElementById('water-amt').textContent = money(c.waterAmount);
        document.getElementById('bill-total').textContent = money(c.total);

        for (const kind of ['elec', 'water']) {
          document.getElementById(`${kind}-err`).innerHTML = shownErrors[kind]
            ? `<div class="field-err" style="margin:0 0 12px">${esc(shownErrors[kind])}</div>` : '';
        }
      };

      form.addEventListener('input', refresh);
      refresh();

      form.addEventListener('submit', e => {
        e.preventDefault();
        const d = read();
        const found = problems(d);
        shownErrors = Object.fromEntries(found);
        refresh();
        if (found.length) {
          toast(t('bill.fixFirst'));
          document.getElementById(`${found[0][0]}-err`)
            .scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        const clash = State.data.bills.find(x =>
          x.unitId === unitId && x.month === d.month && x.id !== (existing?.id));
        if (clash && !confirm(t('bill.confirmReplace', { month: monthLabel(d.month) }))) return;
        if (clash) deleteBill(clash.id);

        const id = saveBill({
          id: existing?.id,
          unitId,
          month: d.month,
          issuedOn: b.issuedOn || new Date().toISOString().slice(0, 10),
          elecPrev: Number(d.elecPrev) || 0,
          elecCurr: Number(d.elecCurr) || 0,
          waterPrev: Number(d.waterPrev) || 0,
          waterCurr: Number(d.waterCurr) || 0,
          elecRate: Number(d.elecRate) || 0,
          waterRate: Number(d.waterRate) || 0,
          rent: Number(d.rent) || 0,
          paid: existing ? !!existing.paid : false
        });
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

  const s = State.data.settings;
  const c = compute(bill);
  const due = dueDate(bill.month);

  const line = (title, sub, amount) => `
    <div class="invoice-line">
      <span>
        <span class="t">${esc(title)}</span>
        ${sub.filter(Boolean).map(x => `<span class="s" style="display:block">${esc(x)}</span>`).join('')}
      </span>
      <span class="a">${esc(money(amount))}</span>
    </div>`;

  return {
    title: t('invoice.title'),
    sub: `${u.label} · ${monthShort(bill.month)}`,
    back: `#/unit/${bill.unitId}`,
    bar: true,
    actions: `<a class="btn sm" href="#/bill/${bill.unitId}/${bill.month}">${ICON.edit} ${esc(t('common.edit'))}</a>`,
    body: `
      <div class="card invoice-card">
        <div class="invoice-head">
          <div class="meta"><span>${esc(t('invoice.title').toUpperCase())}</span><span>${esc(invoiceNumber(u, bill.month))}</span></div>
          <div class="big">${esc(money(c.total))}</div>
          <div class="foot">
            <span class="due">${esc(t('invoice.due', { date: fmtDate(due) }))}</span>
            <span class="pill ${bill.paid ? 'done' : 'unpaid'}">${esc(bill.paid ? t('units.paid') : t('units.unpaid'))}</span>
          </div>
        </div>

        <div class="invoice-grid">
          <span>
            <span class="k" style="display:block">${esc(t('invoice.billedTo'))}</span>
            <span class="v" style="display:block">${esc(u.tenantName || t('inv.tenant'))}</span>
            <span class="s">${esc([u.label, u.address].filter(Boolean).join(', '))}</span>
          </span>
          <span>
            <span class="k" style="display:block">${esc(t('invoice.issued'))}</span>
            <span class="v" style="display:block">${esc(fmtDate(bill.issuedOn ? new Date(bill.issuedOn) : new Date()))}</span>
            <span class="s">${esc(t('invoice.forMonth', { month: monthLabel(bill.month) }))}</span>
          </span>
        </div>

        <div class="invoice-lines">
          ${line(t('inv.rent'), [monthLabel(bill.month)], c.rent)}
          ${line(t('inv.electricity'), [
            t('invoice.meter', { from: num(bill.elecPrev), to: num(bill.elecCurr) }),
            t('bill.calc', { used: num(c.elecUsed), unit: s.elecUnit, rate: money(bill.elecRate) })
          ], c.elecAmount)}
          ${line(t('inv.water'), [
            t('invoice.meter', { from: num(bill.waterPrev), to: num(bill.waterCurr) }),
            t('bill.calc', { used: num(c.waterUsed), unit: s.waterUnit, rate: money(bill.waterRate) })
          ], c.waterAmount)}
          <div class="invoice-total">
            <span class="t">${esc(t('invoice.totalDue'))}</span>
            <span class="a">${esc(money(c.total))}</span>
          </div>
        </div>

        ${s.invoiceNote ? `<div class="paybox"><span class="t">${esc(t('invoice.howToPay'))}</span>${esc(s.invoiceNote)}</div>` : ''}
      </div>

      <details style="margin-top:4px">
        <summary class="tiny" style="cursor:pointer;padding:8px 6px">${esc(t('invoice.copy'))}</summary>
        <button class="btn block" id="copy-text" style="margin-top:8px">${ICON.copy} ${esc(t('invoice.copy'))}</button>
      </details>`,
    actionbar: bill.paid
      ? `<div class="paid-banner" style="margin-bottom:10px">${ICON.check} ${esc(t('invoice.paidInFull'))}</div>
         <div class="two">
           <button class="btn" id="mark-paid">${esc(t('invoice.markUnpaid'))}</button>
           <button class="btn primary" id="share-img">${ICON.share} ${esc(t('invoice.sendShort'))}</button>
         </div>`
      : `<div class="two">
           <button class="btn" id="mark-paid">${esc(t('invoice.markPaid'))}</button>
           <button class="btn primary" id="share-img">${ICON.share} ${esc(t('invoice.sendShort'))}</button>
         </div>`,
    mount() {
      let canvas;
      try {
        canvas = renderInvoice(bill, u);
      } catch (err) {
        console.error(err);
        toast(t('invoice.drawFailed'));
      }

      document.getElementById('mark-paid').addEventListener('click', () => {
        const paid = togglePaid(bill);
        toast(paid ? t('invoice.markedPaid') : t('invoice.markedUnpaid'));
        render();
      });

      document.getElementById('share-img').addEventListener('click', async e => {
        if (!canvas) return;
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
    const owed = rows.filter(b => !b.paid).reduce((sum, b) => sum + compute(b).total, 0);
    return `
      <div class="eyebrow">${esc(monthLabel(month))}</div>
      <div class="card">
        ${rows.map(b => {
          const u = findUnit(b.unitId);
          const c = compute(b);
          return `<a class="hist-row" href="#/invoice/${b.id}" style="text-decoration:none;color:inherit">
            <span class="grow">
              <span style="font-weight:600;display:block">${esc(u ? u.label : t('history.deletedUnit'))}</span>
              <span class="tiny">${esc(t('history.rowSummary', { rent: money(c.rent), elec: money(c.elecAmount), water: money(c.waterAmount) }))}</span>
            </span>
            <span style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
              <span class="amount">${esc(money(c.total))}</span>
              <span class="pill ${b.paid ? 'done' : 'unpaid'}">${esc(b.paid ? t('units.paid') : t('units.unpaid'))}</span>
            </span>
          </a>`;
        }).join('')}
        <div class="hist-row" style="border-top:2px solid var(--line);border-bottom:0">
          <span class="grow" style="font-weight:700">${esc(t('history.monthTotal'))}</span>
          <span style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
            <span class="amount">${esc(money(total))}</span>
            ${owed > 0 ? `<span class="owing">${esc(money(owed))}</span>` : ''}
          </span>
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

const CURRENCIES = ['$', '₫', 'RM', '€', '£', '¥', '₹', 'Rp'];

function viewSettings() {
  const s = State.data.settings;
  const last = State.data.lastBackupAt ? new Date(State.data.lastBackupAt) : null;

  return {
    title: t('set.title'),
    actions: `<button class="btn sm primary" type="submit" form="set-form">${esc(t('set.save'))}</button>`,
    body: `
      <div class="eyebrow">${esc(t('set.language'))}</div>
      <div class="card rowlist">
        ${LANGUAGES.map(l => `
          <button type="button" data-lang="${l.code}" aria-pressed="${l.code === getLang()}">
            <span>${esc(l.name)}</span>
            ${l.code === getLang() ? ICON.check : ''}
          </button>`).join('')}
      </div>

      <form id="set-form">
        <div class="eyebrow">${esc(t('set.rates'))}</div>
        <div class="card">
          <div class="rate-row">
            <span class="tile sm elec">${ICON.bolt}</span>
            <label for="s-er">${esc(t('set.elecRate'))}<span>${esc(s.currency)} / ${esc(s.elecUnit)}</span></label>
            <input id="s-er" name="elecRate" type="number" inputmode="decimal" step="any" min="0" value="${esc(money0(s.elecRate))}">
          </div>
          <div class="rate-row">
            <span class="tile sm water">${ICON.drop}</span>
            <label for="s-wr">${esc(t('set.waterRate'))}<span>${esc(s.currency)} / ${esc(s.waterUnit)}</span></label>
            <input id="s-wr" name="waterRate" type="number" inputmode="decimal" step="any" min="0" value="${esc(money0(s.waterRate))}">
          </div>
          <div class="two">
            <div class="field" style="margin-bottom:0">
              <label for="s-eu">${esc(t('set.elecUnitLabel'))}</label>
              <input id="s-eu" name="elecUnit" value="${esc(s.elecUnit)}">
            </div>
            <div class="field" style="margin-bottom:0">
              <label for="s-wu">${esc(t('set.waterUnitLabel'))}</label>
              <input id="s-wu" name="waterUnit" value="${esc(s.waterUnit)}">
            </div>
          </div>
          <p class="tiny" style="margin:12px 0 0;border-top:1px solid var(--line);padding-top:12px">${esc(t('set.ratesNote'))}</p>
        </div>

        <div class="eyebrow">${esc(t('set.currency'))}</div>
        <div class="card">
          <div class="eyebrow" style="margin:0 0 10px">${esc(t('set.currencyPresets'))}</div>
          <div class="seg">
            ${CURRENCIES.map(sym => `<button type="button" data-cur="${esc(sym)}" aria-pressed="${sym === s.currency}">${esc(sym)}</button>`).join('')}
          </div>
          <div class="rate-row" style="margin:16px 0 0">
            <label for="s-cur">${esc(t('set.currencyOwn'))}</label>
            <input id="s-cur" name="currency" maxlength="4" value="${esc(s.currency)}">
          </div>
          <div class="rate-row" style="margin:16px 0 0">
            <label for="s-dec">${esc(t('set.decimals'))}</label>
            <select id="s-dec" name="decimals">
              <option value="0" ${s.decimals === 0 ? 'selected' : ''}>0</option>
              <option value="2" ${s.decimals !== 0 ? 'selected' : ''}>2</option>
            </select>
          </div>
          <div class="field switch" style="margin:14px 0 0">
            <input id="s-after" name="currencyAfter" type="checkbox" ${s.currencyAfter ? 'checked' : ''}>
            <label for="s-after" style="margin:0">${esc(t('set.symbolAfter'))}</label>
          </div>
          <div class="preview-row"><span class="muted">${esc(t('set.preview'))}</span><b id="cur-preview">${esc(money(1234.5))}</b></div>
        </div>

        <div class="eyebrow">${esc(t('set.invoice'))}</div>
        <div class="card">
          <div class="rate-row">
            <label for="s-due">${esc(t('set.dueDay'))}</label>
            <input id="s-due" name="dueDay" type="number" inputmode="numeric" min="1" max="28" value="${esc(s.dueDay)}">
          </div>
          <div class="field" style="margin-bottom:0">
            <label for="s-note">${esc(t('invoice.howToPay'))}</label>
            <textarea id="s-note" name="invoiceNote" placeholder="${esc(t('set.notePh'))}">${esc(s.invoiceNote)}</textarea>
          </div>
        </div>
      </form>

      <div class="eyebrow">${esc(t('set.data'))}</div>
      ${backupBanner()}
      <div class="card stack">
        <div>
          <div style="font-weight:700">${esc(t('set.backup'))}</div>
          <div class="muted">${esc(last ? fmtDate(last) : t('set.neverBackedUp'))}</div>
        </div>
        <p class="tiny" style="margin:0">${esc(t('set.backupHint'))}</p>
        <button class="btn primary block" id="backup">${ICON.down} ${esc(t('set.backup'))}</button>
        <button class="btn block" id="restore">${ICON.up} ${esc(t('set.restore'))}</button>
        <div class="confirm" id="restore-confirm" hidden>
          <p><strong>${esc(t('set.restoreConfirmTitle'))}</strong><br>${esc(t('set.restoreConfirmBody'))}</p>
          <div class="two">
            <button class="btn" id="restore-cancel">${esc(t('set.cancel'))}</button>
            <button class="btn danger" id="restore-go">${esc(t('set.chooseFile'))}</button>
          </div>
        </div>
        <button class="btn block" id="csv2">${esc(t('set.exportCsv'))}</button>
        <input type="file" id="restore-file" accept="application/json,.json" hidden>
      </div>

      <div class="eyebrow">${esc(t('set.app'))}</div>
      <div class="card stack">
        <div class="row between">
          <span class="muted" style="font-weight:600">${esc(t('set.version', { v: APP_VERSION }))}</span>
        </div>
        <button class="btn block" id="check-updates">${esc(t('set.checkUpdates'))}</button>
      </div>

      <div class="eyebrow">${esc(t('set.danger'))}</div>
      <div class="card">
        <button class="btn danger block" id="wipe">${esc(t('set.wipe'))}</button>
      </div>
      <p class="tiny" style="text-align:center;margin:18px 0 0">${esc(t('set.footer'))}</p>`,
    mount() {
      app.querySelectorAll('[data-lang]').forEach(btn =>
        btn.addEventListener('click', () => {
          State.data.settings.lang = btn.dataset.lang;
          State.save();
          applyLang(btn.dataset.lang);
          render();
        }));

      const form = document.getElementById('set-form');
      const curInput = document.getElementById('s-cur');

      /* The preview reads from a throwaway copy, so nothing is saved until Save. */
      const preview = () => {
        const kept = State.data.settings;
        State.data.settings = {
          ...kept,
          currency: curInput.value || '$',
          currencyAfter: document.getElementById('s-after').checked,
          decimals: Number(document.getElementById('s-dec').value) === 0 ? 0 : 2
        };
        document.getElementById('cur-preview').textContent = money(1234.5);
        State.data.settings = kept;
      };
      form.addEventListener('input', preview);
      preview();

      app.querySelectorAll('[data-cur]').forEach(btn =>
        btn.addEventListener('click', () => {
          curInput.value = btn.dataset.cur;
          app.querySelectorAll('[data-cur]').forEach(b =>
            b.setAttribute('aria-pressed', String(b === btn)));
          preview();
        }));

      form.addEventListener('submit', e => {
        e.preventDefault();
        const f = new FormData(e.target);
        Object.assign(State.data.settings, {
          elecRate: Number(f.get('elecRate')) || 0,
          waterRate: Number(f.get('waterRate')) || 0,
          elecUnit: f.get('elecUnit').trim() || 'kWh',
          waterUnit: f.get('waterUnit').trim() || 'm³',
          currency: f.get('currency') || '$',
          currencyAfter: f.get('currencyAfter') === 'on',
          decimals: Number(f.get('decimals')) === 0 ? 0 : 2,
          dueDay: Math.min(Math.max(Number(f.get('dueDay')) || 15, 1), 28),
          invoiceNote: f.get('invoiceNote').trim()
        });
        State.save();
        toast(t('set.saved'));
        render();
      });

      document.getElementById('check-updates').addEventListener('click', e => checkForUpdates(e.currentTarget));
      document.getElementById('backup').addEventListener('click', backup);
      document.getElementById('csv2').addEventListener('click', exportCsv);

      /* Restore confirms in the page, so the wording is in the app's language
         rather than the phone's. */
      const box = document.getElementById('restore-confirm');
      const picker = document.getElementById('restore-file');
      document.getElementById('restore').addEventListener('click', () => { box.hidden = false; });
      document.getElementById('restore-cancel').addEventListener('click', () => { box.hidden = true; });
      document.getElementById('restore-go').addEventListener('click', () => picker.click());

      picker.addEventListener('change', async () => {
        const file = picker.files[0];
        if (!file) return;
        try {
          const parsed = JSON.parse(await file.text());
          if (!parsed || !Array.isArray(parsed.units)) throw new Error('Not a backup file');
          State.replaceAll(parsed);
          applyLang(State.data.settings.lang);
          toast(t('set.restored'));
          nav('#/units');
        } catch (err) {
          console.error(err);
          alert(t('set.badFile'));
        } finally {
          picker.value = '';
          box.hidden = true;
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
    t('csv.total')];
  const rows = State.data.bills
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(b => {
      const u = findUnit(b.unitId);
      const c = compute(b);
      return [b.month, u?.label || '', u?.tenantName || '', c.rent,
        b.elecPrev, b.elecCurr, c.elecUsed, b.elecRate, c.elecAmount,
        b.waterPrev, b.waterCurr, c.waterUsed, b.waterRate, c.waterAmount,
        c.total].map(cell).join(',');
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
  [/^\/bill\/([^/]+)\/new$/, unitId => viewBill(unitId, monthKey(), true)],
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
  app.classList.toggle('has-bar', !!view.bar);
  document.getElementById('actionbar').innerHTML =
    view.actionbar ? `<div class="inner">${view.actionbar}</div>` : '';
  document.getElementById('actionbar').hidden = !view.actionbar;
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
/* Asks the server which version is published and compares it with the one
   running. That answer cannot be fooled by a stale worker or a stale cache,
   which is what made the earlier check report "latest" while it was not. */
async function checkForUpdates(btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('set.checking');

  const done = msg => {
    btn.disabled = false;
    btn.textContent = label;
    if (msg) toast(msg);
  };

  let published;
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    published = (await res.json()).version;
  } catch (err) {
    console.warn('update check failed', err);
    done(t('set.checkFailed'));
    return;
  }

  if (!published || published === APP_VERSION) {
    done(t('set.upToDate'));
    return;
  }

  // Something newer is published, so take it rather than asking a worker to
  // notice. Dropping the caches and the registration leaves saved data alone;
  // the reload fetches a clean copy and registers again.
  btn.textContent = t('app.updating');
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (err) {
    console.warn('could not clear the old version', err);
  }
  location.reload();
}

if ('serviceWorker' in navigator) {
  // Tracks whether a worker was already in charge, so the very first install
  // does not announce itself as an update while later ones do.
  let hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // An update found on its own waits to be tapped, so it never interrupts
    // what someone was in the middle of.
    if (hadController) updateToast(() => location.reload());
    hadController = true;
  });

  window.addEventListener('load', async () => {
    let reg;
    try {
      reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    } catch (err) {
      console.warn('SW failed', err);
      return;
    }
    // Check again whenever the app is brought back to the foreground.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
  });
}
