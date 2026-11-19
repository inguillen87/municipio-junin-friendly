// Ficha · historial de liquidaciones: evolución del neto con los períodos ya recibidos (sin pedidos extra).
import { chartSlot, drawChart } from './mc-chart-loader.js';

const amount = value => { const n = Number(value); return Number.isFinite(n) ? n : null; };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Points [label, net] in chronological order; one point per period and payroll type, monthly first. */
export function payrollTrendPoints(items) {
  const rows = (Array.isArray(items) ? items : []).map(item => ({ date: String(item?.payrollDate || '').slice(0, 10), type: String(item?.canonicalPayrollType || item?.payrollType || ''), net: amount(item?.netPayable) }))
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.net !== null);
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  return rows.map(row => {
    const [y, m] = row.date.split('-');
    const kind = /^(M|monthly|mensual)$/i.test(row.type) || !row.type ? '' : ' · ' + (/^(V|vacation)/i.test(row.type) ? 'vac.' : /^(O|F|sac|aguinaldo)/i.test(row.type) ? 'SAC' : row.type);
    return [MONTHS[Number(m) - 1] + ' ' + y.slice(2) + kind, row.net];
  });
}

export function drawPayrollTrend(host, items, anchor = null) {
  if (!host || typeof document === 'undefined') return;
  const points = payrollTrendPoints(items);
  let slot = host.__payrollTrend;
  if (!slot) {
    slot = chartSlot('Evolución del neto a pagar', { subtitle: 'Períodos recibidos en esta ficha, en orden cronológico', size: 'lg', key: 'employee-payroll-trend' });
    host.__payrollTrend = slot; (anchor || host.firstChild) ? host.insertBefore(slot.figure, anchor || host.firstChild) : host.append(slot.figure);
  }
  slot.figure.hidden = points.length < 2;
  if (points.length < 2) return;
  drawChart(slot.host, m => m.trendOption({ points, name: 'Neto', format: m.formatCompactMoney }), { ariaLabel: 'Evolución del neto a pagar por período' });
}
