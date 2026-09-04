import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Recibos ofrece una tarea breve, accesible y sin aparentar un documento oficial', () => {
  const html = read('recibos-sueldo.html');
  assert.match(html, /Todo el recorrido ocurre en dos pasos/);
  assert.match(html, /Por apellido, legajo, DNI o CUIL/);
  assert.match(html, /Descargar PDF de control/);
  assert.match(html, /no como recibo oficial/i);
  assert.match(html, /id="employeeSearchForm"/);
  assert.match(html, /id="periodSection"[^>]*hidden/);
  assert.match(html, /id="previewSection"[^>]*hidden/);
  assert.match(html, /id="periodTitle" tabindex="-1"/);
  assert.match(html, /id="collapsePeriods"[^>]*aria-controls="periodList"[^>]*hidden/);
  assert.match(html, /id="togglePeriods"[^>]*aria-expanded="false"[^>]*aria-controls="periodList"[^>]*hidden/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /id="tenantBrand">Ámbito municipal/);
  assert.doesNotMatch(html, /Friendly · Junín/);
  assert.doesNotMatch(html, /localStorage/i);
});

test('el recorrido consulta endpoints gobernados, envía la búsqueda por POST y bloquea períodos no conciliados', () => {
  const source = read('assets/payroll-receipt-center.js');
  assert.match(source, /resource: 'employees'/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /body: JSON\.stringify\(\{ resource: 'employees', search: query, page: 1, limit: 12 \}\)/);
  assert.doesNotMatch(source, /URLSearchParams\(\{ resource: 'employees'/);
  assert.match(source, /resource: 'employeepayroll'/);
  assert.match(source, /REQUIRED = \['workforce\.employee\.read', 'payroll\.read'\]/);
  assert.match(source, /item\.presentationStatus !== 'closed_reconciled'/);
  assert.match(source, /INITIAL_PERIODS = 6/);
  assert.match(source, /PERIOD_PAGE_LIMIT = 24/);
  assert.match(source, /payrollItems\.slice\(0, visiblePeriodCount\)/);
  assert.match(source, /employeeResults'\)\.hidden = true/);
  assert.match(source, /payload\.meta\?\.pagination/);
  assert.match(source, /loadedPayrollPages \+ 1/);
  assert.match(source, /page <= payrollPagination\.pages/);
  assert.match(source, /payrollItems\.length < targetCount/);
  assert.match(source, /aria-expanded', String\(expanded\)/);
  assert.match(source, /collapsePeriods/);
  assert.match(source, /togglePeriods'\)\.hidden \? byId\('collapsePeriods'/);
  assert.match(source, /periodTitle'\)\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /Código GRH \$\{raw\} · sin homologar/);
  assert.match(source, /credentials: 'same-origin'/);
  assert.match(source, /cache: 'no-store'/);
  assert.match(source, /method: 'DELETE'/);
  assert.match(source, /tenant: session\.access\?\.tenant/);
  assert.doesNotMatch(source, /localStorage/i);
});

test('Nómina enlaza el centro como tarea principal y la ayuda conoce el recorrido', () => {
  const payroll = read('nomina-control.html');
  const guidance = read('assets/product-guidance.js');
  const guide = read('assets/internal-guide.js');
  const vercelIgnore = read('.vercelignore');
  assert.match(payroll, /href="recibos-sueldo\.html"/);
  assert.match(payroll, /Recibos y liquidaciones/);
  assert.match(guidance, /id: 'recibos'/);
  assert.match(guidance, /id: 'consultar_recibo'/);
  assert.match(guide, /'payroll-receipts'/);
  assert.match(vercelIgnore, /^!recibos-sueldo\.html$/m);
});
