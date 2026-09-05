import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPayrollMonthlyCloseWorkflow,
  PAYROLL_MONTHLY_CLOSE_API,
} from '../assets/payroll-monthly-close-workflow.js';
import { isPayrollMonthlyCloseApprovedProofReady } from '../assets/payroll-monthly-close-approved-report.js';
import { approvedMonthlyCloseRun, bootstrap, flags } from './fixtures/monthly-close-approved-run.js';

class FakeElement {
  constructor(tagName = 'div') {
    Object.assign(this, {
      tagName, children: [], listeners: new Map(), attributes: new Map(), dataset: {},
      hidden: false, disabled: false, textContent: '', value: '', files: [], resetCount: 0,
    });
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  dispatch(name) { return this.listeners.get(name)?.({ target: this, preventDefault() {} }); }
  reset() { this.resetCount += 1; this.dispatch('reset'); }
}

const NODE_NAMES = [
  'status', 'role', 'scope', 'prepare-panel', 'form', 'period', 'jurisdiction',
  'refresh', 'runs', 'empty', 'detail', 'detail-title', 'detail-meta',
  'reconciliation', 'government-reconciliation', 'total-concepts', 'total-bank',
  'total-difference', 'total-state', 'sources', 'events', 'reject-field',
  'reject-reason', 'actions', 'action-status', 'approved-proof',
  'approved-proof-download', 'folder-download', 'approved-proof-status',
];

function fakeDocument() {
  const documentImpl = { createElement: (tagName) => new FakeElement(tagName) };
  const root = new FakeElement('section');
  const nodes = new Map(NODE_NAMES.map((name) => {
    const tag = ['refresh', 'approved-proof-download', 'folder-download'].includes(name)
      ? 'button' : ['jurisdiction', 'reject-reason'].includes(name)
        ? 'select' : name === 'period' ? 'input' : name === 'form' ? 'form' : 'div';
    return [name, new FakeElement(tag)];
  }));
  const files = ['grh', 'bank', 'government'].map((name) => {
    const node = new FakeElement('input');
    node.dataset.monthlyWorkflowFile = name;
    return node;
  });
  const fileStates = files.map((file) => {
    const node = new FakeElement();
    node.dataset.monthlyWorkflowFileState = file.dataset.monthlyWorkflowFile;
    return node;
  });
  root.append(...nodes.values(), ...files, ...fileStates);
  root.querySelector = (selector) => nodes.get(/^\[data-monthly-workflow-(.+)\]$/.exec(selector)?.[1]) || null;
  root.querySelectorAll = (selector) => {
    if (selector === '[data-monthly-workflow-file]') return files;
    if (selector === '[data-monthly-workflow-file-state]') return fileStates;
    if (selector === 'button, input, select') {
      const controls = [];
      const visit = (node) => {
        if (['button', 'input', 'select'].includes(node.tagName)) controls.push(node);
        node.children.forEach(visit);
      };
      visit(root);
      return controls;
    }
    throw new Error(`Selector no previsto en el harness: ${selector}`);
  };
  documentImpl.querySelector = () => null;
  return { documentImpl, root, nodes, files, fileStates };
}

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function detailResponse(run) {
  return response({ ok: true, data: { run, flags: flags(run.closeApproved) } });
}

function deferred() {
  let resolve;
  const promise = new Promise((onResolve) => { resolve = onResolve; });
  return { promise, resolve };
}

async function harness(t, { run = approvedMonthlyCloseRun(), capabilities, roleKey } = {}) {
  const dom = fakeDocument();
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: dom.documentImpl });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
  const calls = { requests: [], created: [], downloaded: [], redirects: [] };
  const faults = { create: null, download: null };
  const queue = [response(bootstrap({ run, capabilities, roleKey })), detailResponse(run)];
  const artifact = (kind, value) => {
    calls.created.push({ kind, run: value });
    if (faults.create) throw faults.create;
    return { kind, fileName: kind === 'folder' ? 'respaldo.zip' : 'copia.pdf' };
  };
  const download = (value) => {
    if (faults.download) throw faults.download;
    calls.downloaded.push(value);
    return value.fileName;
  };
  const workflow = createPayrollMonthlyCloseWorkflow(dom.root, {
    fetchImpl: async (url, init) => {
      calls.requests.push({ url, init });
      assert.ok(queue.length, `Petición inesperada: ${url}`);
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next() : next;
    },
    cryptoImpl: { randomUUID: () => '60000000-0000-4000-8000-000000000006' },
    locationImpl: {
      pathname: '/nomina-control.html', hash: '#cierre-mensual',
      replace: (href) => calls.redirects.push(href),
    },
    createApprovedPdf: (value) => artifact('pdf', value),
    downloadApprovedProof: download,
    createApprovedFolder: (value) => artifact('folder', value),
    downloadApprovedFolder: download,
  });
  for (let attempts = 0; workflow.getState().busy && attempts < 25; attempts += 1) {
    await new Promise(setImmediate);
  }
  assert.equal(workflow.getState().busy, false, 'La carga inicial no terminó');
  assert.equal(workflow.getState().detail?.id, run.id, dom.nodes.get('status').textContent);
  assert.equal(calls.requests.length, 2);
  return { ...dom, workflow, calls, faults, queue };
}

const EXPORTS = [
  { kind: 'folder', method: 'downloadApprovedFolder' },
  { kind: 'pdf', method: 'downloadApprovedReport' },
];

function fillPreservedInputs(h) {
  h.nodes.get('period').value = '2026-09';
  h.nodes.get('jurisdiction').value = '55';
  h.nodes.get('reject-reason').value = 'evidence_incomplete';
  h.files.forEach((file, index) => {
    file.files = [{ size: 10 + index, marker: `selected-${index}` }];
    file.dispatch('change');
  });
  return {
    detail: h.workflow.getState().detail,
    files: h.files.map((file) => file.files),
    fileStates: h.fileStates.map((node) => node.textContent),
  };
}

function assertPreservedInputs(h, saved) {
  assert.equal(h.workflow.getState().detail, saved.detail);
  assert.equal(h.nodes.get('detail').hidden, false);
  assert.equal(h.nodes.get('period').value, '2026-09');
  assert.equal(h.nodes.get('jurisdiction').value, '55');
  assert.equal(h.nodes.get('reject-reason').value, 'evidence_incomplete');
  h.files.forEach((file, index) => assert.equal(file.files, saved.files[index]));
  assert.deepEqual(h.fileStates.map((node) => node.textContent), saved.fileStates);
  assert.equal(h.nodes.get('form').resetCount, 0);
}

test('ZIP y PDF revalidan el detalle autorizado sin caché antes de construir o descargar', async (t) => {
  for (const item of EXPORTS) await t.test(item.kind, async (t) => {
    const h = await harness(t);
    const freshRun = approvedMonthlyCloseRun();
    freshRun.sources[0].recordCount += 1;
    const pending = deferred();
    h.queue.push(() => pending.promise);
    const downloading = h.workflow[item.method]();
    assert.equal(h.calls.requests.length, 3);
    assert.equal(h.calls.requests[2].url, `${PAYROLL_MONTHLY_CLOSE_API}?resource=detail&id=${freshRun.id}`);
    assert.equal(h.calls.requests[2].init.credentials, 'same-origin');
    assert.equal(h.calls.requests[2].init.cache, 'no-store');
    assert.equal(h.calls.requests[2].init.method || 'GET', 'GET');
    assert.equal(h.calls.requests[2].init.headers.Accept, 'application/json');
    assert.equal(h.calls.created.length, 0);
    assert.equal(h.calls.downloaded.length, 0);
    assert.equal(h.nodes.get('folder-download').disabled, true);
    assert.equal(h.nodes.get('approved-proof-download').disabled, true);
    assert.equal(h.nodes.get('refresh').disabled, true);
    pending.resolve(detailResponse(freshRun));
    await downloading;
    assert.deepEqual(h.calls.created, [{ kind: item.kind, run: freshRun }]);
    assert.equal(h.calls.downloaded.length, 1);
    assert.equal(h.nodes.get('approved-proof-status').dataset.state, 'ok');
    assert.equal(h.nodes.get('folder-download').disabled, false);
    assert.equal(h.nodes.get('approved-proof-download').disabled, false);
    assert.equal(h.workflow.getState().busy, false);
    assert.equal(h.root.attributes.get('aria-busy'), 'false');
    assert.ok(h.calls.requests.every(({ init }) => (init.method || 'GET') === 'GET'));
  });
});

test('no sustituye la corrida vista por otra identidad, versión, período, jurisdicción o conjunto', async (t) => {
  const changes = [
    ['id', (run) => { run.id = '90000000-0000-4000-8000-000000000009'; }],
    ['version', (run) => {
      run.version = 4;
      run.timeline.at(-1).expectedVersion = 3;
      run.timeline.at(-1).resultingVersion = 4;
    }],
    ['period', (run) => { run.period = '2026-09'; }],
    ['jurisdiction', (run) => { run.jurisdiction = '55'; }],
    ['sourceSetSha256', (run) => { run.sourceSetSha256 = 'b'.repeat(64); }],
  ];
  for (const [label, change] of changes) await t.test(label, async (t) => {
    const h = await harness(t);
    const saved = fillPreservedInputs(h);
    const changedRun = approvedMonthlyCloseRun();
    change(changedRun);
    assert.equal(isPayrollMonthlyCloseApprovedProofReady(changedRun), true);
    h.queue.push(detailResponse(changedRun));
    await h.workflow.downloadApprovedFolder();
    assert.equal(h.calls.created.length, 0);
    assert.equal(h.calls.downloaded.length, 0);
    assertPreservedInputs(h, saved);
    assert.equal(h.nodes.get('approved-proof-status').dataset.state, 'error');
    assert.match(h.nodes.get('approved-proof-status').textContent, /actualiz|cambi|coincid/i);
    assert.equal(h.nodes.get('folder-download').disabled, false);
  });
});

test('fallos de revalidación conservan datos y sesión visual; cada reintento consulta nuevamente', async (t) => {
  const failures = [
    ['red', () => new TypeError('network unavailable')],
    ['401', () => response({ ok: false, code: 'SESSION_REQUIRED' }, 401)],
    ['403', () => response({ ok: false, code: 'PAYROLL_MONTHLY_CLOSE_CAPABILITY_REQUIRED' }, 403)],
    ['404', () => response({ ok: false, code: 'PAYROLL_MONTHLY_CLOSE_NOT_FOUND' }, 404)],
    ['500', () => response({ ok: false }, 500)],
    ['contrato', () => response({ ok: true, data: { run: approvedMonthlyCloseRun(), flags: flags(false) } })],
  ];
  for (const item of EXPORTS) for (const [label, failure] of failures) {
    await t.test(`${item.kind}: ${label}`, async (t) => {
      const h = await harness(t);
      const saved = fillPreservedInputs(h);
      h.queue.push(failure());
      await h.workflow[item.method]();
      assert.equal(h.calls.created.length, 0);
      assert.equal(h.calls.downloaded.length, 0);
      assertPreservedInputs(h, saved);
      assert.deepEqual(h.calls.redirects, []);
      assert.equal(h.nodes.get('approved-proof-status').dataset.state, 'error');
      assert.match(h.nodes.get('approved-proof-status').textContent, /reintent|volver|actualiz|sesión/i);
      assert.equal(h.nodes.get('folder-download').disabled, false);
      assert.equal(h.nodes.get('approved-proof-download').disabled, false);
      assert.equal(h.workflow.getState().busy, false);
      h.queue.push(detailResponse(approvedMonthlyCloseRun()));
      await h.workflow[item.method]();
      assert.equal(h.calls.requests.length, 4);
      assert.equal(h.calls.created.length, 1);
      assert.equal(h.calls.downloaded.length, 1);
      assert.equal(h.nodes.get('approved-proof-status').dataset.state, 'ok');
    });
  }
});

test('elegibilidad revocada o evidencia incompleta en el detalle fresco no usa la aprobación anterior', async (t) => {
  const changes = [
    ['no aprobado', (run) => { run.status = 'submitted'; run.closeApproved = false; }],
    ['diferencia', (run) => { run.mismatchCount = 1; run.totals.differenceCents = '1'; }],
    ['bloqueo', (run) => { run.blockingIssueCount = 1; run.blockingIssues = ['evidence_missing']; }],
    ['sin auditoría', (run) => { run.timeline = []; }],
    ['fuente incompleta', (run) => { run.sources[0].manifestSha256 = null; }],
  ];
  for (const [label, change] of changes) await t.test(label, async (t) => {
    const h = await harness(t);
    const saved = fillPreservedInputs(h);
    const freshRun = approvedMonthlyCloseRun();
    change(freshRun);
    assert.equal(isPayrollMonthlyCloseApprovedProofReady(freshRun), false);
    h.queue.push(detailResponse(freshRun));
    await h.workflow.downloadApprovedFolder();
    assert.equal(h.calls.created.length, 0);
    assert.equal(h.calls.downloaded.length, 0);
    assertPreservedInputs(h, saved);
    assert.equal(h.nodes.get('approved-proof-status').dataset.state, 'error');
    assert.equal(h.workflow.getState().busy, false);
  });
});

test('fallo local de generación o descarga conserva entradas y reintenta desde el servidor', async (t) => {
  for (const item of EXPORTS) for (const phase of ['create', 'download']) {
    await t.test(`${item.kind}: ${phase}`, async (t) => {
      const h = await harness(t);
      const saved = fillPreservedInputs(h);
      h.faults[phase] = new Error('Fallo local simulado');
      h.queue.push(detailResponse(approvedMonthlyCloseRun()));
      await h.workflow[item.method]();
      assert.equal(h.calls.downloaded.length, 0);
      assertPreservedInputs(h, saved);
      assert.equal(h.nodes.get('approved-proof-status').dataset.state, 'error');
      assert.equal(h.nodes.get('folder-download').disabled, false);
      assert.equal(h.nodes.get('approved-proof-download').disabled, false);
      h.faults[phase] = null;
      h.queue.push(detailResponse(approvedMonthlyCloseRun()));
      await h.workflow[item.method]();
      assert.equal(h.calls.requests.length, 4);
      assert.equal(h.calls.downloaded.length, 1);
    });
  }
});

test('doble clic y pedido PDF simultáneo no duplican descarga ni consulta autorizada', async (t) => {
  const h = await harness(t);
  const pending = deferred();
  h.queue.push(() => pending.promise);
  const first = h.nodes.get('folder-download').dispatch('click');
  await h.workflow.downloadApprovedFolder();
  await h.workflow.downloadApprovedReport();
  assert.equal(h.calls.requests.length, 3);
  assert.equal(h.calls.created.length, 0);
  assert.equal(h.nodes.get('period').disabled, true);
  assert.equal(h.nodes.get('jurisdiction').disabled, true);
  const openRunButton = h.nodes.get('runs').children[0].children.at(-1).children[0];
  assert.equal(openRunButton.disabled, true);
  pending.resolve(detailResponse(approvedMonthlyCloseRun()));
  await first;
  assert.equal(h.calls.created.length, 1);
  assert.equal(h.calls.downloaded.length, 1);
  assert.equal(h.nodes.get('refresh').disabled, false);
});

test('preparar, aprobar y consultar conservan capacidades y elegibilidad de evidencia', async (t) => {
  const profiles = [
    {
      name: 'preparar', roleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL', canPrepare: true, canExport: true,
      capabilities: ['payroll.monthly_close.read', 'payroll.monthly_close.prepare', 'payroll.monthly_close.audit.read'],
    },
    {
      name: 'aprobar', roleKey: 'HUGO_APROBADOR_INTEGRAL', canPrepare: false, canExport: true,
      capabilities: ['payroll.monthly_close.read', 'payroll.monthly_close.approve', 'payroll.monthly_close.audit.read'],
    },
    {
      name: 'consultar', roleKey: 'CONSULTA_INTEGRAL', canPrepare: false, canExport: false,
      capabilities: ['payroll.monthly_close.read'],
    },
  ];
  for (const profile of profiles) await t.test(profile.name, async (t) => {
    const run = approvedMonthlyCloseRun(profile.canExport ? {} : { timeline: [] });
    const h = await harness(t, { ...profile, run });
    assert.equal(h.nodes.get('prepare-panel').hidden, !profile.canPrepare);
    assert.equal(h.nodes.get('actions').children.length, 0);
    assert.equal(h.nodes.get('approved-proof').hidden, !profile.canExport);
    assert.equal(h.nodes.get('folder-download').disabled, !profile.canExport);
    assert.equal(h.nodes.get('approved-proof-download').disabled, !profile.canExport);
    assert.deepEqual(h.workflow.getState().bootstrap.principal.capabilities, profile.capabilities);
    if (profile.canExport) {
      h.queue.push(detailResponse(approvedMonthlyCloseRun()));
      await h.workflow.downloadApprovedFolder();
      assert.equal(h.calls.downloaded.length, 1);
    } else {
      // A direct invocation must not turn incomplete read-only evidence into an export.
      h.queue.push(detailResponse(approvedMonthlyCloseRun({ timeline: [] })));
      await h.workflow.downloadApprovedFolder();
      assert.equal(h.calls.created.length, 0);
      assert.equal(h.calls.downloaded.length, 0);
      assert.equal(h.nodes.get('folder-download').disabled, true);
      assert.equal(h.nodes.get('approved-proof-download').disabled, true);
    }
    assert.equal(h.nodes.get('actions').children.length, 0);
    assert.ok(h.calls.requests.every(({ init }) => (init.method || 'GET') === 'GET'));
  });
});
