/* Data layer: everything lives in this device's localStorage. No network, no accounts. */

import { locale } from './i18n.js';

const STORAGE_KEY = 'rmu.v1';

const DEFAULT_SETTINGS = {
  lang: '',
  propertyName: '',
  landlordName: '',
  currency: '$',
  currencyAfter: false,
  elecRate: 0,
  waterRate: 0,
  elecUnit: 'kWh',
  waterUnit: 'm³',
  dueDay: 15,
  decimals: 2,
  invoiceNote: ''
};

const blank = () => ({ version: 1, settings: { ...DEFAULT_SETTINGS }, units: [], bills: [], lastBackupAt: null });

export const State = {
  data: blank(),

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.data = this.migrate(JSON.parse(raw));
    } catch (err) {
      console.error('Could not read saved data', err);
    }
    return this.data;
  },

  /* Tolerate data written by an older build rather than throwing it away. */
  migrate(d) {
    const base = blank();
    return {
      version: 1,
      settings: { ...base.settings, ...(d.settings || {}) },
      units: (Array.isArray(d.units) ? d.units : []).map(migrateUnit),
      bills: Array.isArray(d.bills) ? d.bills : [],
      lastBackupAt: d.lastBackupAt || null
    };
  },

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      return true;
    } catch (err) {
      console.error('Could not save', err);
      alert('Could not save — your device storage may be full or private browsing is on.');
      return false;
    }
  },

  replaceAll(d) {
    this.data = this.migrate(d);
    this.save();
  }
};

/* Units used to carry a dated list of rent changes. Collapse any such list to
   the latest amount; saved bills keep their own snapshot either way. */
function migrateUnit(u) {
  if (!Array.isArray(u.rents)) return u;
  const { rents, ...rest } = u;
  const latest = rents.slice().sort((a, b) => a.from.localeCompare(b.from)).pop();
  return { ...rest, rent: Number(rest.rent ?? latest?.amount) || 0 };
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- months ---------- */

export const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export function monthLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
}

export function monthShort(key) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'short', year: 'numeric' });
}

/* Month names in the app's language, for the in-app month picker.
   A native <input type="month"> follows the phone's language, not ours. */
export const monthNames = () =>
  Array.from({ length: 12 }, (_, i) =>
    new Date(2000, i, 1).toLocaleDateString(locale(), { month: 'long' }));

export const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
};

/* ---------- units ---------- */

export const units = () => State.data.units;
export const activeUnits = () => State.data.units.filter(u => !u.archived);
export const findUnit = id => State.data.units.find(u => u.id === id);

export function addUnit({ label, tenantName, phone, rent }) {
  const unit = {
    id: uid(),
    label: label.trim(),
    tenantName: (tenantName || '').trim(),
    phone: (phone || '').trim(),
    rent: Number(rent) || 0,
    archived: false,
    createdAt: new Date().toISOString()
  };
  State.data.units.push(unit);
  State.save();
  return unit;
}

export const rentOf = unit => Number(unit?.rent) || 0;

/* ---------- bills ---------- */

export const billsFor = unitId =>
  State.data.bills.filter(b => b.unitId === unitId).sort((a, b) => b.month.localeCompare(a.month));

export const findBill = id => State.data.bills.find(b => b.id === id);
export const billForMonth = (unitId, month) =>
  State.data.bills.find(b => b.unitId === unitId && b.month === month);

/* The newest bill before `month` supplies this month's opening readings. */
export function previousBill(unitId, month) {
  const earlier = State.data.bills
    .filter(b => b.unitId === unitId && b.month < month)
    .sort((a, b) => a.month.localeCompare(b.month));
  return earlier.length ? earlier[earlier.length - 1] : null;
}

export function openingReadings(unitId, month) {
  const prev = previousBill(unitId, month);
  return {
    elecPrev: prev ? prev.elecCurr : 0,
    waterPrev: prev ? prev.waterCurr : 0,
    fromMonth: prev ? prev.month : null
  };
}

export function saveBill(bill) {
  const existing = bill.id ? findBill(bill.id) : null;
  if (existing) {
    Object.assign(existing, bill, { updatedAt: new Date().toISOString() });
  } else {
    bill.id = uid();
    bill.createdAt = new Date().toISOString();
    State.data.bills.push(bill);
  }
  State.save();
  return bill.id || existing.id;
}

export function deleteBill(id) {
  State.data.bills = State.data.bills.filter(b => b.id !== id);
  State.save();
}

/* Rates and rent are snapshotted onto each bill, so changing them later
   never rewrites history. */
export function compute(bill) {
  const elecUsed = Math.max(0, (Number(bill.elecCurr) || 0) - (Number(bill.elecPrev) || 0));
  const waterUsed = Math.max(0, (Number(bill.waterCurr) || 0) - (Number(bill.waterPrev) || 0));
  const elecAmount = round2(elecUsed * (Number(bill.elecRate) || 0));
  const waterAmount = round2(waterUsed * (Number(bill.waterRate) || 0));
  const rent = round2(Number(bill.rent) || 0);
  const adjustment = round2(Number(bill.adjustment) || 0);
  return {
    elecUsed, waterUsed, elecAmount, waterAmount, rent, adjustment,
    utilities: round2(elecAmount + waterAmount),
    total: round2(rent + elecAmount + waterAmount + adjustment)
  };
}

export const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

/* ---------- formatting ---------- */

export function money(n) {
  const s = State.data.settings;
  const d = Number.isInteger(s.decimals) ? s.decimals : 2;
  const v = Math.abs(round2(n)).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
  const sign = n < 0 ? '-' : '';
  // A trailing symbol reads better with a space: "1.200.000 ₫".
  return s.currencyAfter ? `${sign}${v} ${s.currency}` : `${sign}${s.currency}${v}`;
}

export const num = n =>
  (Number(n) || 0).toLocaleString(locale(), { maximumFractionDigits: 2 });

export function dueDate(month) {
  const s = State.data.settings;
  const [y, m] = month.split('-').map(Number);
  const day = Math.min(Math.max(Number(s.dueDay) || 15, 1), 28);
  return new Date(y, m - 1, day);
}

export const fmtDate = d => d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });

export const invoiceNumber = (unit, month) =>
  `${(unit.label || 'UNIT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'UNIT'}-${month.replace('-', '')}`;
