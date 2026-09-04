import {
  createPayrollReceiptPdfArtifact,
  createPayrollReceiptSummary,
  downloadPayrollReceiptPdf,
} from './payroll-receipt-preview.js';
import { payrollTypePresentation } from './payroll-type-presentation.js';

const AUTH_URL = '/api/internal-auth';
const DATA_URL = '/api/internal-data';
const LOGIN_URL = 'login.html?next=recibos-sueldo.html';
const REQUIRED = ['workforce.employee.read', 'payroll.read'];
const INITIAL_PERIODS = 6;
const PERIOD_PAGE_LIMIT = 24;
const byId = (id) => document.getElementById(id);
const integerFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
let session = null;
let selectedEmployee = null;
let payrollItems = [];
let selectedSummary = null;
let redirecting = false;
let visiblePeriodCount = INITIAL_PERIODS;
let payrollPagination = { page: 1, pages: 1, total: 0 };
let loadedPayrollPages = 1;
const busyButtonStates = new Map();

function text(value) { return String(value ?? '').trim(); }

function tenantLabel(slug) {
  const value = text(slug).toLowerCase();
  if (!value) return 'Ámbito municipal';
  return value.split('-').filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function create(tag, className = '', value = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== '') node.textContent = String(value);
  return node;
}

function exactMoney(value) {
  const match = /^(-?)(0|[1-9]\d*)\.([0-9]{2})$/.exec(text(value));
  if (!match) return '—';
  return `$ ${match[1] || ''}${integerFormatter.format(BigInt(match[2]))},${match[3]}`;
}

function monthLabel(value) {
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(text(value))) return 'Período no informado';
  return monthFormatter.format(new Date(`${value}T00:00:00Z`));
}

function stateInfo(value) {
  return ({
    closed_reconciled: ['Lista para control', 'ok', 'Los importes cierran dentro de la tolerancia de un centavo.'],
    closed_mismatch: ['Revisar diferencia', 'warning', 'La liquidación está cerrada pero sus totales no concilian.'],
    closed_not_reconciled: ['Falta conciliación', 'warning', 'No hay importes suficientes para reproducir el control.'],
    open: ['Todavía abierta', 'neutral', 'Es una preliquidación y no puede descargarse como cierre.'],
    uncertified: ['Estado no certificado', 'neutral', 'GRH no informó un cierre utilizable para este período.'],
  })[text(value)] || ['Estado no disponible', 'neutral', 'No hay evidencia suficiente para habilitar la descarga.'];
}

function showMessage(kind, title, detail = '') {
  const host = byId('messageHost');
  host.hidden = false;
  host.dataset.kind = kind;
  host.replaceChildren(create('strong', '', title));
  if (detail) host.appendChild(create('p', '', detail));
}

function clearMessage() {
  byId('messageHost').hidden = true;
  byId('messageHost').replaceChildren();
}

function setBusy(value, label = 'Consultando…') {
  document.body.dataset.busy = value ? 'true' : 'false';
  byId('busyStatus').hidden = !value;
  byId('busyStatus').textContent = label;
  if (value) {
    for (const button of document.querySelectorAll('button')) {
      busyButtonStates.set(button, button.disabled);
      button.disabled = true;
    }
  } else {
    for (const [button, wasDisabled] of busyButtonStates) {
      if (button.isConnected) button.disabled = wasDisabled;
    }
    busyButtonStates.clear();
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { Accept: 'application/json', 'Cache-Control': 'no-store', ...(options.headers || {}) } });
  if (response.status === 401) {
    if (!redirecting) { redirecting = true; location.replace(LOGIN_URL); }
    throw new Error('La sesión venció.');
  }
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok || payload?.ok !== true) {
    const error = new Error(payload?.error || `La consulta respondió ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function employeeResult(employee) {
  const item = create('li', 'employee-result');
  const button = create('button', 'employee-result-button');
  button.type = 'button';
  const main = create('span', 'employee-result-main');
  main.append(create('strong', '', text(employee.nombre) || 'Persona sin nombre'), create('span', '', `Legajo ${text(employee.legajo) || 'no informado'}`));
  const context = create('span', 'employee-result-context', [text(employee.organizacion), text(employee.sector), text(employee.convenio)].filter(Boolean).join(' · ') || 'Contexto laboral no informado');
  button.append(main, context, create('span', 'employee-result-action', 'Ver liquidaciones'));
  button.addEventListener('click', () => selectEmployee(employee));
  item.appendChild(button);
  return item;
}

async function searchEmployees(event) {
  event?.preventDefault();
  const query = text(byId('employeeSearch').value);
  if (query.length < 2) {
    showMessage('warning', 'Ingresá al menos dos caracteres', 'Podés buscar por apellido, legajo, DNI o CUIL.');
    byId('employeeSearch').focus();
    return;
  }
  clearMessage();
  setBusy(true, 'Buscando la persona…');
  byId('employeeResults').hidden = false;
  byId('employeeResults').replaceChildren();
  byId('resultsStatus').textContent = 'Buscando…';
  try {
    const payload = await api(DATA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource: 'employees', search: query, page: 1, limit: 12 }),
    });
    const items = Array.isArray(payload.data) ? payload.data : [];
    items.forEach((employee) => byId('employeeResults').appendChild(employeeResult(employee)));
    byId('resultsStatus').textContent = items.length
      ? `${items.length} resultado${items.length === 1 ? '' : 's'}. Elegí la ficha correcta.`
      : 'No encontramos coincidencias. Probá con el número de legajo o el apellido completo.';
  } catch (error) {
    byId('resultsStatus').textContent = 'No se pudo completar la búsqueda.';
    showMessage('error', 'No pudimos buscar personas', error.message);
  } finally { setBusy(false); }
}

function amount(label, value, emphasized = false) {
  const node = create('div', emphasized ? 'amount emphasized' : 'amount');
  node.append(create('span', '', label), create('strong', '', exactMoney(value)));
  return node;
}

function payrollCard(item, index) {
  const article = create('article', 'period-card');
  const [label, kind, explanation] = stateInfo(item.presentationStatus);
  const payrollType = payrollTypePresentation(item.canonicalPayrollType, item.payrollType);
  article.dataset.state = kind;
  const heading = create('div', 'period-card-heading');
  const title = create('div');
  title.append(
    create('h3', '', monthLabel(item.payrollDate)),
    create('p', '', payrollType.label),
    create('small', 'period-type-source', payrollType.detail),
  );
  heading.append(title, create('span', `status ${kind}`, label));
  const amounts = create('div', 'period-amounts');
  amounts.append(amount('Total de haberes', addMoney(item.subjectEarnings, item.nonSubjectEarnings, item.familyAllowance)), amount('Retenciones', item.employeeWithholdings), amount('Neto a pagar', item.netPayable, true));
  const note = create('p', 'period-note', explanation);
  const actions = create('div', 'period-actions');
  const source = create('small', '', `Fuente GRH · ${item.sourceCutoff ? `corte ${text(item.sourceCutoff).slice(0, 10)}` : 'corte no informado'}`);
  const preview = create('button', 'button primary', 'Revisar y descargar');
  preview.type = 'button';
  preview.disabled = item.presentationStatus !== 'closed_reconciled';
  if (preview.disabled) preview.title = explanation;
  preview.addEventListener('click', () => openPreview(index));
  actions.append(source, preview);
  article.append(heading, amounts, note, actions);
  return article;
}

function addMoney(...values) {
  let total = 0n;
  for (const value of values) {
    const match = /^(-?)(0|[1-9]\d*)\.([0-9]{2})$/.exec(text(value));
    if (!match) return null;
    const item = (BigInt(match[2]) * 100n) + BigInt(match[3]);
    total += match[1] ? -item : item;
  }
  const negative = total < 0n;
  const absolute = negative ? -total : total;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

async function selectEmployee(employee) {
  selectedEmployee = employee;
  selectedSummary = null;
  payrollItems = [];
  visiblePeriodCount = INITIAL_PERIODS;
  payrollPagination = { page: 1, pages: 1, total: 0 };
  loadedPayrollPages = 1;
  clearMessage();
  setBusy(true, 'Consultando liquidaciones reales…');
  byId('selectedEmployee').hidden = false;
  byId('selectedName').textContent = text(employee.nombre) || 'Persona sin nombre informado';
  byId('selectedMeta').textContent = `Legajo ${text(employee.legajo) || 'no informado'} · ${text(employee.sector) || 'Sector no informado'} · ${text(employee.convenio) || 'Convenio no informado'}`;
  byId('employeeResults').hidden = true;
  byId('resultsStatus').textContent = 'Persona seleccionada. Usá “Cambiar persona” para volver a los resultados.';
  byId('periodList').replaceChildren();
  byId('periodStatus').textContent = 'Consultando períodos…';
  byId('periodSection').hidden = false;
  byId('previewSection').hidden = true;
  try {
    const params = payrollParams(employee.contractId, 1);
    const payload = await api(`${DATA_URL}?${params}`);
    payrollItems = Array.isArray(payload.data?.items) ? payload.data.items : [];
    payrollPagination = paginationFrom(payload.meta?.pagination, payrollItems.length);
    renderPayrollItems();
    byId('periodTitle').focus({ preventScroll: true });
    byId('periodSection').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch (error) {
    byId('periodStatus').textContent = 'No se pudieron consultar las liquidaciones.';
    showMessage('error', 'No pudimos abrir el historial', error.message);
  } finally { setBusy(false); }
}

function payrollParams(contractId, page) {
  return new URLSearchParams({ resource: 'employeepayroll', contractId: text(contractId), page: String(page), limit: String(PERIOD_PAGE_LIMIT) });
}

function paginationFrom(value, loaded) {
  const total = Number(value?.total);
  const pages = Number(value?.pages);
  return {
    page: 1,
    pages: Number.isSafeInteger(pages) && pages > 0 ? pages : 1,
    total: Number.isSafeInteger(total) && total >= loaded ? total : loaded,
  };
}

function renderPayrollItems() {
  const visibleItems = payrollItems.slice(0, visiblePeriodCount);
  byId('periodList').replaceChildren();
  visibleItems.forEach((item, index) => byId('periodList').appendChild(payrollCard(item, index)));
  const total = Math.max(payrollPagination.total, payrollItems.length);
  const remaining = Math.max(0, total - visibleItems.length);
  const expanded = visibleItems.length > INITIAL_PERIODS;
  const toggle = byId('togglePeriods');
  const nextCount = Math.min(remaining, expanded ? PERIOD_PAGE_LIMIT : Math.max(0, PERIOD_PAGE_LIMIT - visibleItems.length));
  toggle.hidden = remaining === 0;
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.textContent = `Ver ${nextCount} período${nextCount === 1 ? '' : 's'} más`;
  byId('collapsePeriods').hidden = !expanded;
  byId('periodStatus').textContent = payrollItems.length
    ? `Mostrando ${visibleItems.length} de ${total} períodos informados por GRH.`
    : 'GRH no informó liquidaciones mensuales para esta ficha.';
}

function focusPeriodNavigation() {
  const focusTarget = byId('togglePeriods').hidden ? byId('collapsePeriods') : byId('togglePeriods');
  focusTarget.focus({ preventScroll: true });
}

async function showMorePeriods() {
  const total = Math.max(payrollPagination.total, payrollItems.length);
  const targetCount = Math.min(total, visiblePeriodCount === INITIAL_PERIODS
    ? PERIOD_PAGE_LIMIT
    : visiblePeriodCount + PERIOD_PAGE_LIMIT);
  if (payrollItems.length >= targetCount) {
    visiblePeriodCount = targetCount;
    renderPayrollItems();
    focusPeriodNavigation();
    return;
  }
  clearMessage();
  setBusy(true, 'Cargando más períodos…');
  try {
    for (let page = loadedPayrollPages + 1; page <= payrollPagination.pages && payrollItems.length < targetCount; page += 1) {
      const payload = await api(`${DATA_URL}?${payrollParams(selectedEmployee.contractId, page)}`);
      const items = Array.isArray(payload.data?.items) ? payload.data.items : [];
      payrollItems.push(...items);
      loadedPayrollPages = page;
    }
    visiblePeriodCount = Math.min(targetCount, payrollItems.length);
    renderPayrollItems();
  } catch (error) {
    showMessage('error', 'No pudimos cargar más períodos', `${error.message} Los períodos ya visibles siguen disponibles.`);
  } finally {
    setBusy(false);
    focusPeriodNavigation();
  }
}

function collapsePeriods() {
  visiblePeriodCount = INITIAL_PERIODS;
  renderPayrollItems();
  focusPeriodNavigation();
}

function previewRow(label, value, emphasized = false) {
  const row = create('div', emphasized ? 'preview-row emphasized' : 'preview-row');
  row.append(create('span', '', label), create('strong', '', value));
  return row;
}

function openPreview(index) {
  const item = payrollItems[index];
  try {
    selectedSummary = createPayrollReceiptSummary(selectedEmployee, item, { tenant: session.access?.tenant });
    const summary = selectedSummary;
    byId('previewTitle').textContent = `${monthLabel(summary.payroll.payrollDate)} · ${summary.payroll.payrollTypeLabel}`;
    byId('previewEmployee').textContent = `${summary.employee.name} · legajo ${summary.employee.legajo}`;
    byId('previewAmounts').replaceChildren(
      previewRow('Haberes remunerativos', exactMoney(summary.payroll.subjectEarnings)),
      previewRow('Haberes no remunerativos', exactMoney(summary.payroll.nonSubjectEarnings)),
      previewRow('Asignaciones familiares', exactMoney(summary.payroll.familyAllowance)),
      previewRow('Total de haberes', exactMoney(summary.payroll.grossEarnings)),
      previewRow('Retenciones', exactMoney(summary.payroll.employeeWithholdings)),
      previewRow('Neto a pagar', exactMoney(summary.payroll.netPayable), true),
    );
    byId('previewTrace').textContent = `Fuente GRH · ${summary.payroll.sourceCutoff ? `corte ${summary.payroll.sourceCutoff.slice(0, 10)}` : 'corte no informado'} · control aritmético ${exactMoney(summary.payroll.reconciliationDifference)}`;
    byId('previewSection').hidden = false;
    byId('previewSection').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch (error) { showMessage('error', 'Este período no puede descargarse', error.message); }
}

function downloadSelected() {
  if (!selectedSummary) return;
  try {
    const artifact = createPayrollReceiptPdfArtifact(selectedSummary);
    const fileName = downloadPayrollReceiptPdf(artifact);
    showMessage('success', 'PDF de control descargado', `${fileName}. Contiene datos personales y debe administrarse como documentación interna.`);
  } catch (error) { showMessage('error', 'No se pudo generar el PDF', error.message); }
}

async function logout() {
  try { await fetch(AUTH_URL, { method: 'DELETE', credentials: 'same-origin' }); }
  finally { sessionStorage.removeItem('mjunin_user'); location.replace('login.html'); }
}

async function initialize() {
  byId('employeeSearchForm').addEventListener('submit', searchEmployees);
  byId('downloadButton').addEventListener('click', downloadSelected);
  byId('togglePeriods').addEventListener('click', showMorePeriods);
  byId('collapsePeriods').addEventListener('click', collapsePeriods);
  byId('changeEmployee').addEventListener('click', () => { byId('employeeResults').hidden = false; byId('resultsStatus').textContent = 'Elegí otra ficha o realizá una nueva búsqueda.'; byId('employeeSearch').focus(); window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
  byId('logoutButton').addEventListener('click', logout);
  try {
    session = await api(AUTH_URL);
    const capabilities = new Set(Array.isArray(session.access?.tenantCapabilities) ? session.access.tenantCapabilities : []);
    if (!REQUIRED.every((capability) => capabilities.has(capability))) {
      throw new Error('Tu perfil necesita acceso a Personas y Nómina para usar este recorrido.');
    }
    byId('userName').textContent = text(session.user?.name) || 'Usuario interno';
    byId('userRole').textContent = text(session.user?.role).replaceAll('_', ' ') || 'Acceso municipal';
    byId('tenantBrand').textContent = tenantLabel(session.access?.tenant?.slug);
    byId('appShell').hidden = false;
    byId('authGate').hidden = true;
    byId('employeeSearch').focus();
  } catch (error) {
    if (!redirecting) {
      byId('authLoader').hidden = true;
      byId('authTitle').textContent = 'No pudimos abrir Recibos';
      byId('authMessage').textContent = error.message || 'Volvé a ingresar al portal interno.';
      byId('authLink').hidden = false;
    }
  }
}

initialize();
