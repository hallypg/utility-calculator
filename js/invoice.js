/* Renders an invoice as a PNG on a canvas, then hands it to the phone's
   native share sheet. No libraries, so it works offline. */

import { State, compute, money, num, monthLabel, dueDate, fmtDate, invoiceNumber, rentMonth } from './store.js';
import { t } from './i18n.js';

const W = 1080;
const PAD = 72;
const INK = '#0F172A';
const MUTED = '#64748B';
const LINE = '#E2E8F0';
const BRAND = '#4F46E5';
const SURFACE2 = '#F1F5F9';
const OK = '#047857';
const DANGER = '#B91C1C';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

const font = (weight, size) => `${weight} ${size}px ${FONT}`;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function renderInvoice(bill, unit) {
  const s = State.data.settings;
  const c = compute(bill);
  const paid = !!bill.paid;

  // Draw tall, measure where we finished, then crop to fit.
  const scratch = document.createElement('canvas');
  scratch.width = W;
  scratch.height = 2600;
  const ctx = scratch.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, scratch.height);

  /* ---- header band: the amount owed, as on the invoice screen ---- */
  const headerH = 300;
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, W, headerH);

  ctx.fillStyle = 'rgba(255,255,255,0.80)';
  ctx.font = font(700, 23);
  const heading = t('invoice.title').toUpperCase();
  ctx.save();
  ctx.letterSpacing = '2px';
  ctx.fillText(heading, PAD, 86);
  ctx.textAlign = 'right';
  ctx.fillText(invoiceNumber(unit, bill.month), W - PAD, 86);
  ctx.restore();
  ctx.textAlign = 'left';

  ctx.fillStyle = '#FFFFFF';
  ctx.font = font(800, 68);
  ctx.fillText(money(c.total), PAD, 184);

  ctx.font = font(500, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.80)';
  ctx.fillText(t('invoice.due', { date: fmtDate(dueDate(bill)) }), PAD, 240);

  // Status pill, matching the one on screen.
  const pillText = paid ? t('units.paid') : t('units.unpaid');
  ctx.font = font(700, 24);
  const pillW = ctx.measureText(pillText).width + 44;
  const pillH = 48;
  const pillX = W - PAD - pillW;
  const pillY = 240 - 34;
  ctx.fillStyle = paid ? '#E3F3EC' : '#FEF2F2';
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = paid ? OK : DANGER;
  ctx.textAlign = 'center';
  ctx.fillText(pillText, pillX + pillW / 2, pillY + 33);
  ctx.textAlign = 'left';

  /* ---- who and when ---- */
  let y = headerH + 62;
  const colR = W / 2 + 10;

  const pair = (x, label, value, sub) => {
    ctx.fillStyle = MUTED;
    ctx.font = font(600, 24);
    ctx.fillText(label, x, y);
    ctx.fillStyle = INK;
    ctx.font = font(700, 31);
    ctx.fillText(value, x, y + 42);
    if (sub) {
      ctx.fillStyle = MUTED;
      ctx.font = font(400, 26);
      ctx.fillText(sub, x, y + 80);
    }
  };

  pair(PAD, t('invoice.billedTo'), unit.tenantName || t('inv.tenant'),
    [unit.label, unit.address].filter(Boolean).join(', '));
  pair(colR, t('invoice.issued'),
    fmtDate(bill.issuedOn ? new Date(bill.issuedOn.replace(/-/g, '/')) : new Date()),
    t('invoice.forMonth', { month: monthLabel(bill.month) }));

  y += 122;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  /* ---- line items ---- */
  const item = (title, subs, amount) => {
    y += 38;
    ctx.fillStyle = INK;
    ctx.font = font(700, 31);
    ctx.fillText(title, PAD, y);
    ctx.textAlign = 'right';
    ctx.fillText(money(amount), W - PAD, y);
    ctx.textAlign = 'left';

    ctx.fillStyle = MUTED;
    ctx.font = font(400, 26);
    for (const sub of subs.filter(Boolean)) {
      y += 36;
      ctx.fillText(sub, PAD, y);
    }

    y += 30;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
  };

  item(t('inv.rent'), [monthLabel(rentMonth(bill))], c.rent);
  item(t('inv.electricity'), [
    t('invoice.meter', { from: num(bill.elecPrev), to: num(bill.elecCurr) }),
    t('bill.calc', { used: num(c.elecUsed), unit: s.elecUnit, rate: money(bill.elecRate) })
  ], c.elecAmount);
  item(t('inv.water'), [
    t('invoice.meter', { from: num(bill.waterPrev), to: num(bill.waterCurr) }),
    t('bill.calc', { used: num(c.waterUsed), unit: s.waterUnit, rate: money(bill.waterRate) })
  ], c.waterAmount);

  /* ---- total ---- */
  y += 52;
  ctx.fillStyle = INK;
  ctx.font = font(800, 34);
  ctx.fillText(t('invoice.totalDue'), PAD, y);
  ctx.textAlign = 'right';
  ctx.font = font(800, 44);
  ctx.fillText(money(c.total), W - PAD, y);
  ctx.textAlign = 'left';
  y += 40;

  /* ---- how to pay ---- */
  if (s.invoiceNote) {
    y += 40;
    ctx.font = font(400, 26);
    const lines = s.invoiceNote.split('\n').flatMap(l => wrap(ctx, l, W - PAD * 2 - 72));
    const boxH = 40 + 38 + lines.length * 36 + 32;
    ctx.fillStyle = SURFACE2;
    roundRect(ctx, PAD, y, W - PAD * 2, boxH, 22);
    ctx.fill();

    ctx.fillStyle = INK;
    ctx.font = font(700, 26);
    ctx.fillText(t('invoice.howToPay'), PAD + 36, y + 58);

    ctx.fillStyle = MUTED;
    ctx.font = font(400, 26);
    let ly = y + 96;
    for (const line of lines) {
      ctx.fillText(line, PAD + 36, ly);
      ly += 36;
    }
    y += boxH;
  }

  y += 56;

  /* ---- crop to content ---- */
  const out = document.createElement('canvas');
  out.width = W;
  out.height = Math.ceil(y);
  const octx = out.getContext('2d');
  octx.fillStyle = '#FFFFFF';
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(scratch, 0, 0);
  return out;
}

export function invoiceFilename(bill, unit) {
  const safe = (unit.label || 'unit').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return `invoice-${safe}-${bill.month}.png`;
}

/* Share sheet where supported (so it goes straight into a chat thread),
   otherwise fall back to a plain download. */
export async function shareInvoice(canvas, filename) {
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create the image');

  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
      // Fall through to download if the share sheet refused.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

export function invoiceText(bill, unit) {
  const s = State.data.settings;
  const c = compute(bill);
  const lines = [
    `${t('invoice.title')} — ${monthLabel(bill.month)}`,
    `${t('inv.unit', { label: unit.label })}${unit.tenantName ? ` · ${unit.tenantName}` : ''}`,
    '',
    `${t('inv.rent')} (${monthLabel(rentMonth(bill))}): ${money(c.rent)}`,
    `${t('inv.electricity')}: ${num(c.elecUsed)} ${s.elecUnit} × ${money(bill.elecRate)} = ${money(c.elecAmount)}`,
    `${t('inv.water')}: ${num(c.waterUsed)} ${s.waterUnit} × ${money(bill.waterRate)} = ${money(c.waterAmount)}`
  ];
  lines.push('', `${t('inv.totalDueCaps')}: ${money(c.total)}`, t('invoice.due', { date: fmtDate(dueDate(bill)) }));
  if (s.invoiceNote) lines.push('', s.invoiceNote);
  return lines.join('\n');
}
