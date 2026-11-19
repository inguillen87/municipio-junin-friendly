// Mount the actual panel. The in-memory DOM serves only its named controls; HTTP and identities are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountEntityExport } from '../assets/payroll-entity-export-panel.js';

const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const meta = { version: 'payroll-entity-export.v1', found: true, datasetId: id, date: '2026-10-31', period: 2026, month: 10, type: 'M' };
const row = (legajo, amount, extra) => ({ legajo, amount, sector: '1', jurisdiction: '42', contractMatches: 1, dni: '12345678', name: 'MUÑOZ, DEMO', ...extra });
const summary = (lines, people, total, code = '638') => ({ code, lines, people, total, description: 'Concepto de prueba' });
const list = (...concepts) => ({ ...meta, concept: null, concepts, rows: [] });
const detail = (rows, overrides) => ({ ...meta, concept: '638', concepts: [], rows, ...overrides });
const defer = () => { let complete; const pending = new Promise(resolve => { complete = resolve; }); return { pending, complete }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

class Control {
  children = []; events = new Map(); textContent = ''; value = ''; hidden = false; disabled = false;
  replaceChildren(...children) { this.children = children; this.value = ''; }
  get firstChild() { return this.children[0]; }
  removeAttribute(name) { delete this[name]; }
  addEventListener(event, fn) { this.events.set(event, fn); }
  fire(event) { if (!this.disabled) return this.events.get(event)?.(); }
}
function setup(t) {
  const nodes = new Map(), lookup = key => nodes.get(key), requests = [], queue = [], blobs = [], urls = [], revoked = [];
  const doc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new Control() } });
  t.after(() => { if (doc) Object.defineProperty(globalThis, 'document', doc); else delete globalThis.document; });
  const OriginalBlob = globalThis.Blob;
  t.mock.method(globalThis, 'Blob', class extends OriginalBlob { constructor(...parts) { super(...parts); blobs.push(this); } });
  t.mock.method(URL, 'createObjectURL', blob => { urls.push(blob); return 'blob:synthetic-' + urls.length; });
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(new URL(url, 'https://demo.invalid').searchParams);
    const data = await queue.shift();
    if (!data) throw Error('Unexpected request');
    return { ok: true, json: async () => ({ ok: true, data }) };
  });
  const host = { classList: { add() {} },
    set innerHTML(html) {
      for (const m of html.matchAll(/<[\w-]+\b([^>]*\bdata-ee-([\w-]+)\b[^>]*)>/g)) {
        const n = new Control(); n.hidden = /\bhidden\b/.test(m[1]); n.disabled = /\bdisabled\b/.test(m[1]); nodes.set(m[2], n);
      }
    },
    querySelector(selector) { return lookup(selector.slice(9, -1)); },
  };
  const panel = mountEntityExport(host);
  const select = code => { const n = lookup('concept'); assert.ok(n.children.some(c => c.value === code)); n.value = code; return n.fire('change'); };
  const set = async (listing, closureStatus = 'unknown') => {
    queue.push(listing);
    const datasetId = listing.datasetId;
    await panel.setDataset(datasetId, { datasetId, sourceLabel: 'Origen sintético', date: meta.date, closureStatus });
    await tick();
  };
  const generate = response => { queue.push(response); return lookup('build').fire('click'); };
  const refresh = async listing => { queue.push(listing); await lookup('refresh').fire('click'); await tick(); };
  const noDownload = () => { assert.equal(lookup('download').hidden, true); assert.equal(lookup('download').href, undefined); assert.equal(lookup('preview').textContent, ''); };
  return { lookup, set, select, generate, refresh, noDownload, requests, blobs, urls, revoked };
}

test('a matching monetary control cannot release a mixed file, including an excluded zero-value row', async t => {
  const p = setup(t);
  await p.set(list(summary(2, 2, '5.00'))); p.select('638');
  await p.generate(detail([row('10', '5.00'), row('11', '0.00', { contractMatches: 2, dni: null, name: null })]));
  assert.equal(p.blobs.length, 0, 'a mixed detail must not allocate even one Blob'); assert.equal(p.urls.length, 0); p.noDownload();
  assert.equal(p.lookup('review-count').textContent, '1'); assert.equal(p.lookup('review').hidden, false);
  assert.match(p.lookup('review-list').children[0].textContent, /Legajo 11.*más de una persona/);
  assert.match(p.lookup('status').textContent, /No se generó.*corregí los datos en la fuente/);
});

test('each independent summary control blocks a fully representable detail, even one cent or one repeated legajo', async t => {
  const p = setup(t);
  const rows = [row('10', '0.10'), row('10', '0.20')];
  for (const [expected, reason] of [
    [summary(3, 1, '0.30'), 'renglones'], [summary(2, 2, '0.30'), 'legajos distintos'], [summary(2, 1, '0.31'), 'importe total'],
  ]) {
    await p.set(list(expected)); p.select('638'); await p.generate(detail(rows));
    p.noDownload(); assert.equal(p.blobs.length, 0); assert.equal(p.urls.length, 0);
    assert.ok(p.lookup('status').textContent.includes('difiere del resumen en: ' + reason + '.'));
    assert.match(p.lookup('control').textContent, /Detalle recibido: 2 renglones, 1 legajo, \$ 0,30/);
  }
});

test('fresh matching summary and all valid rows release the exact CP1252/CRLF reference file', async t => {
  const p = setup(t);
  await p.set(list(summary(3, 2, '0.33')), 'open'); p.select('638');
  const rows = [row('1', '0.10'), row('1', '0.20'), row('2', '0.03')];
  await p.generate(detail(rows));
  assert.equal(p.blobs.length, 1); assert.deepEqual(p.urls, p.blobs);
  assert.equal(p.lookup('download').hidden, false); assert.equal(p.lookup('download').download, '638 102026.txt');
  const bytes = Buffer.from(await p.blobs[0].arrayBuffer());
  const line = c => Buffer.from('42' + '1000' + '000012345678' + 'MUÑOZ, DEMO'.padEnd(23) + ' ' + c.padStart(10, '0') + '638'.padStart(18, '0') + '202610\r\n', 'latin1');
  assert.deepEqual(bytes, Buffer.concat([line('10'), line('20'), line('3')])); assert.equal(bytes.length, 3 * 78);
  assert.match(p.lookup('source').textContent, /Abierta \/ preliquidación.*Archivo de referencia/);
  assert.match(p.lookup('status').textContent, /TXT de referencia completo/);
});

test('refresh replaces a stale summary; a later request or selection cannot revive the previous URL or a late response', async t => {
  const p = setup(t), rows = [row('17', '1.00')], delayed = defer();
  const current = list(summary(1, 1, '1.00'), summary(1, 1, '2.00', '639'));
  await p.set(list(summary(2, 1, '1.00'))); p.select('638'); await p.generate(detail(rows)); p.noDownload();
  await p.refresh(current); p.select('638'); await p.generate(detail(rows));
  assert.equal(p.urls.length, 1);
  const pending = p.generate(delayed.pending);
  p.noDownload(); assert.deepEqual(p.revoked, ['blob:synthetic-1']);
  p.select('639'); await p.generate(detail([row('18', '2.00')], { concept: '639' }));
  delayed.complete(detail(rows)); await pending;
  assert.equal(p.blobs.length, 2); assert.equal(p.urls.length, 2); assert.equal(p.lookup('download').download, '639 102026.txt');
  assert.equal(p.lookup('download').href, 'blob:synthetic-2');
  assert.match(p.lookup('source').textContent, /Cierre no informado.*Archivo de referencia/);
  const later = defer(), another = p.generate(later.pending);
  await p.set({ ...current, datasetId: other }); later.complete(detail([row('18', '2.00')], { concept: '639' })); await another;
  p.noDownload(); assert.equal(p.blobs.length, 2); assert.deepEqual(p.revoked, ['blob:synthetic-1', 'blob:synthetic-2']);
  assert.deepEqual(p.requests.map(q => q.get('concept')), [null, '638', null, '638', '638', '639', '639', null]);
});

test('empty detail, mismatched period and duplicate concept summary never reach byte creation', async t => {
  const p = setup(t);
  await p.set(list(summary(0, 0, '0.00'))); p.select('638'); await p.generate(detail([])); p.noDownload();
  assert.match(p.lookup('status').textContent, /no tiene renglones/);
  await p.set(list(summary(1, 1, '2.00'))); p.select('638'); await p.generate(detail([row('1', '2.00')], { month: 9 })); p.noDownload();
  assert.match(p.lookup('status').textContent, /no coincide con la liquidación/);
  await p.set(list(summary(1, 1, '1.00'), summary(2, 2, '2.00'))); p.noDownload();
  assert.match(p.lookup('status').textContent, /repite códigos/); assert.equal(p.lookup('concept').disabled, true);
  assert.equal(p.blobs.length, 0); assert.equal(p.urls.length, 0);
});
