/* Renders an invoice as a PNG on a canvas, then hands it to the phone's
   native share sheet. No libraries, so it works offline. */

import { State, compute, money, num, monthLabel, dueDate, fmtDate, invoiceNumber } from './store.js';
import { t } from './i18n.js';

const W = 1080;
const PAD = 72;
const INK = '#0F172A';
const MUTED = '#64748B';
const LINE = '#E2E8F0';
const BRAND = '#4F46E5';
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

  // Draw tall, measure where we finished, then crop to fit.
  const scratch = document.createElement('canvas');
  scratch.width = W;
  scratch.height = 2600;
  const ctx = scratch.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, scratch.height);

  /* ---- header band ---- */
  const headerH = 172;
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, W, headerH);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = font(700, 46);
  ctx.fillText(t('invoice.title'), PAD, 100);

  ctx.font = font(500, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText(monthLabel(bill.month), PAD, 140);

  ctx.textAlign = 'right';
  ctx.font = font(600, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(invoiceNumber(unit, bill.month), W - PAD, 100);
  ctx.textAlign = 'left';

  let y = headerH + 62;

  /* ---- dates + billed-to ---- */
  const colR = W / 2 + 40;

  ctx.fillStyle = MUTED;
  ctx.font = font(600, 22);
  ctx.fillText(t('inv.billedTo'), PAD, y);
  ctx.fillText(t('inv.issued'), colR, y);

  y += 38;
  ctx.fillStyle = INK;
  ctx.font = font(700, 32);
  ctx.fillText(unit.tenantName || t('inv.tenant'), PAD, y);
  ctx.font = font(500, 28);
  ctx.fillText(fmtDate(bill.issuedOn ? new Date(bill.issuedOn) : new Date()), colR, y);

  y += 36;
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 26);
  ctx.fillText(t('inv.unit', { label: unit.label }), PAD, y);
  ctx.font = font(600, 22);
  ctx.fillText(t('inv.due'), colR, y + 14);

  y += 34;
  if (unit.phone) {
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 26);
    ctx.fillText(unit.phone, PAD, y);
  }
  ctx.fillStyle = INK;
  ctx.font = font(500, 28);
  ctx.fillText(fmtDate(dueDate(bill.month)), colR, y + 18);

  y += 76;

  /* ---- line items ---- */
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += 44;

  const row = (label, detail, amount) => {
    ctx.fillStyle = INK;
    ctx.font = font(600, 29);
    ctx.fillText(label, PAD, y);

    ctx.textAlign = 'right';
    ctx.font = font(600, 29);
    ctx.fillText(money(amount), W - PAD, y);
    ctx.textAlign = 'left';

    if (detail) {
      y += 32;
      ctx.fillStyle = MUTED;
      ctx.font = font(400, 24);
      ctx.fillText(detail, PAD, y);
    }
    y += 46;
  };

  row(t('inv.rent'), monthLabel(bill.month), c.rent);
  row(
    t('inv.electricity'),
    `${num(bill.elecPrev)} → ${num(bill.elecCurr)}  ·  ${num(c.elecUsed)} ${s.elecUnit} × ${money(bill.elecRate)}`,
    c.elecAmount
  );
  row(
    t('inv.water'),
    `${num(bill.waterPrev)} → ${num(bill.waterCurr)}  ·  ${num(c.waterUsed)} ${s.waterUnit} × ${money(bill.waterRate)}`,
    c.waterAmount
  );

  /* ---- total ---- */
  y += 6;
  const boxH = 108;
  ctx.fillStyle = '#EEF2FF';
  roundRect(ctx, PAD, y, W - PAD * 2, boxH, 20);
  ctx.fill();

  ctx.fillStyle = BRAND;
  ctx.font = font(700, 30);
  ctx.fillText(t('inv.totalDue'), PAD + 36, y + 66);

  ctx.textAlign = 'right';
  ctx.font = font(700, 46);
  ctx.fillText(money(c.total), W - PAD - 36, y + 70);
  ctx.textAlign = 'left';

  y += boxH + 64;

  /* ---- note ---- */
  if (s.invoiceNote) {
    ctx.fillStyle = MUTED;
    ctx.font = font(400, 24);
    for (const line of wrap(ctx, s.invoiceNote, W - PAD * 2)) {
      ctx.fillText(line, PAD, y);
      y += 34;
    }
    y += 18;
  }

  y += 24;

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
    `${t('inv.rent')}: ${money(c.rent)}`,
    `${t('inv.electricity')}: ${num(c.elecUsed)} ${s.elecUnit} × ${money(bill.elecRate)} = ${money(c.elecAmount)}`,
    `${t('inv.water')}: ${num(c.waterUsed)} ${s.waterUnit} × ${money(bill.waterRate)} = ${money(c.waterAmount)}`
  ];
  lines.push('', `${t('inv.totalDueCaps')}: ${money(c.total)}`, t('invoice.due', { date: fmtDate(dueDate(bill.month)) }));
  if (s.invoiceNote) lines.push('', s.invoiceNote);
  return lines.join('\n');
}
