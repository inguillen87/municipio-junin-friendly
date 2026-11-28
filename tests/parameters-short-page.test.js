// Parámetros stays short: it opens on «Valores del mes» and shows one section at a time. What belongs to another moment (changing
// the values, reviewing a version, the rarely used tools) is one click away instead of stacked below. The sections stay mounted,
// so a draft or an unconfirmed send never depends on the section in view.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const params = read('../src/islands/PayrollParameters.jsx'), master = read('../src/islands/NativeSalaryCatalog.jsx'), catalog = read('../src/islands/PayrollCatalog.jsx');

test('four sections, «Valores del mes» first; the complete view is never the default', () => {
  assert.match(params, /const VIEWS = \[\['mes', 'Valores del mes'\], \['cambiar', 'Cambiar valores'\], \['historial', 'Historial y revisión'\], \['herramientas', 'Herramientas'\]\];/);
  assert.match(params, /function firstView\(\) \{ try \{ return localStorage\.getItem\('mc\.parametros\.vista'\) === 'todo' \? 'todo' : 'mes'; \} catch \{ return 'mes'; \} \}/);
  assert.match(params, /\{!all && <nav className="pp-tabs" aria-label="Secciones de Parámetros">/);
  assert.match(params, /<NativeSalaryCatalog revoked=\{blocked\} view=\{view\} onView=\{setView\} onSummary=\{setMaster\}\/>/);
});

test('the sections of the master are hidden, not unmounted, and each part lives in one of them', () => {
  for (const id of ['mes', 'cambiar', 'herramientas', 'historial']) assert.equal(master.split(`<div data-salary-view="${id}" hidden={!show('${id}')}>`).length - 1, 1, id);
  assert.match(master, /const all=view==='todo',show=v=>all\|\|view===v,go=v=>\{if\(!all\)onView\?\.\(v\);\};/);
  const at = text => { const i = master.indexOf(text); assert.ok(i > 0, text); return i; };
  const mes = at('data-salary-view="mes"'), cambiar = at('data-salary-view="cambiar"'), herramientas = at('data-salary-view="herramientas"'), historial = at('data-salary-view="historial"');
  assert.ok(mes < at('<NativeSalaryMonthView items={boot.catalog.items}') && at('<NativeSalaryMonthView items={boot.catalog.items}') < cambiar, 'the month view opens the page');
  assert.ok(cambiar < at('>Preparar nueva versión</button>') && at('>Revisar versión completa</button>') < herramientas, 'preparing and proposing live in «Cambiar valores»');
  assert.ok(historial < at('<h3>Historia y propuestas</h3>') && historial < at('<h3>Comparación de la propuesta</h3>'), 'history and review live in «Historial y revisión»');
  assert.match(master, /\{draft&&table\}/, 'while preparing, the full table is the working grid');
  assert.match(master, /<FullTable folded=\{!draft&&!all\} count=\{rows\.length\}>/, 'when consulting, it is a folded tool');
  assert.match(master, /data-salary-owner-host hidden=\{!show\('historial'\)\|\|/);
});

test('the page takes the person where the work is: preparing, the sent version, the chosen proposal', () => {
  assert.match(master, /function prepare\(\)\{setRowAction\(null\);go\('cambiar'\);/);
  assert.match(master, /await fresh\(seq\);go\('historial'\);setNotice\(r\.status==='approved'\?/);
  assert.match(master, /useEffect\(\(\)=>\{if\(selected\)go\('historial'\);\},\[selected\?\.id\]\);/);
  assert.match(master, /useEffect\(\(\)=>\{onSummary\?\.\(\{waiting:waitingCount,draft:!!draft,pending:hasPending\}\);\},\[waitingCount,!!draft,hasPending\]\);/);
  assert.match(params, /master\.waiting === 1 \? '1 espera revisión'/);
  assert.match(master, /data-salary-waiting-note>/);
  assert.match(master, /data-salary-draft-note>/);
});

test('master history: waiting versions first, the rest below, every entry still a button; a chosen version replaces the list', () => {
  assert.match(master, /const waiting=boot\.proposals\.filter\(p=>p\.status==='pending'&&!staleBase\(p\)\),rest=boot\.proposals\.filter\(p=>!waiting\.includes\(p\)\)/);
  assert.match(master, /<details className="sc-history" open=\{!all\}><summary>Ver historia completa \(\{rest\.length\}\)<\/summary>/);
  assert.match(master, /<p>No hay versiones esperando revisión\.<\/p>/);
  assert.equal((master.match(/data-salary-proposal-id=\{p\.id\}/g) || []).length, 1, 'one item renderer for both lists');
  assert.match(master, /<div data-salary-history hidden=\{!all&&!!selected\}>/);
  assert.match(master, /\{!all&&<button type="button" className="sc-back" onClick=\{\(\)=>setSelected\(null\)\}>← Volver al historial<\/button>\}/);
});

test('each change says what changed on its own line, and the complete set is still listed', () => {
  assert.match(master, /\{changes\.map\(d=><details key=\{d\.key\}><summary>\{display\(d\.after\)\} · \{changeText\(d\)\}<\/summary>/);
  assert.match(master, /return 'Cambio'\+\(d\.before\.value!==d\.after\.value\?` · \$\{plain\(d\.before\.value,d\.before\.unit\)\} → \$\{plain\(d\.after\.value,d\.after\.unit\)\}`:''\)/);
  assert.match(master, /if\(v===null\|\|v===''\)return 'sin valor';/, 'a missing value is never written as zero');
});

test('the tools section holds the 88/90 helper (folded unless an attempt or a chosen change needs it), the period catalogue and the formula laboratory', () => {
  assert.match(params, /<div data-parameter-tools hidden=\{!all && view !== 'herramientas'\}>/);
  assert.match(params, /<details className="pp-fold" open=\{foldOpen \|\| !!pending \|\| !!selected\} onToggle=\{e => setFoldOpen\(e\.currentTarget\.open\)\}><summary>Actualizar auxiliares 88 y 90 desde la escala aprobada<\/summary>/);
  const tools = params.indexOf('<div data-parameter-tools'), fold = params.indexOf('className="pp-fold" open'), hero = params.indexOf('<header className="pp-hero">'), end = params.indexOf('</details>\n    <PayrollCatalog'), slot = params.indexOf('<div ref={toolSlot} data-parameter-tool-slot/>');
  assert.ok(tools > 0 && tools < fold && fold < hero && hero < end && end < slot, 'helper, catalogue and laboratory, in that order, inside the tools section');
  assert.match(params, /useEffect\(\(\) => \{ if \(tools && toolSlot\.current\) toolSlot\.current\.append\(tools\); \}, \[tools\]\);/);
  assert.match(params, /id === 'herramientas' && pending \? 'intento sin confirmar'/, 'an unconfirmed attempt of the helper is announced on its tab');
  const entry = read('../src/islands/payroll-parameters-entry.jsx'), loader = read('../assets/payroll-parameters-loader.js'), navigation = read('../assets/payroll-navigation.js');
  assert.equal(entry.split('if (tools) host.after(tools); root.unmount();').length - 1, 2, 'the laboratory returns to the page before Parámetros is unmounted');
  assert.match(loader, /module\.mountPayrollParameters\(host, \{ tools \}\); ready = true;/);
  assert.match(navigation, /mountParameterTask\(parameters,\{tools:advancedFormula\}\);/);
  assert.match(navigation, /nodes:\[parameters,advancedFormula\]/, 'until Parámetros opens, the laboratory stays where it was');
});

test('returning to the page checks the catalogue access by itself; a denial, a revocation or a logout never do', () => {
  assert.match(catalog, /const hide=\(\)=>\{if\(document\.hidden\)\{if\(!withdrawn\.current\)away\.current=true;withdraw\(\);\}else\{due\.current=true;returning\(\);\}\};/);
  assert.match(catalog, /function returning\(\)\{if\(!due\.current\|\|!away\.current\|\|lock\.current\|\|!live\.current\|\|document\.hidden\|\|revokedNow\.current\)return;due\.current=false;recheck\.current\?\.\(true\);\}/, 'once per return, when nothing else is running');
  assert.match(catalog, /\}finally\{lock\.current=false;if\(live\.current\)setBusy\(false\);returning\(\);\}\}/, 'an operation that was still running when the person came back does not swallow the check');
  assert.match(catalog, /const logout=\(\)=>\{away\.current=false;withdraw\(\);live\.current=false;\};/);
  assert.match(catalog, /useEffect\(\(\)=>\{if\(revoked\)\{away\.current=false;withdraw\(\);\}\},\[revoked\]\);/);
  assert.match(catalog, /if\(\[401,403\]\.includes\(e\.status\)\)\{away\.current=false;withdraw\(\);deny\.current\?\.\(e\);\}/);
  assert.match(catalog, /await authority\(g,attemptRef\.current\?\.scopeKey\);insist\(g\);away\.current=false;withdrawn\.current=false;setDenied\(false\);/, 'the same check as the button: the original attempt keeps its scope');
  assert.doesNotMatch(catalog.slice(catalog.indexOf('const hide='), catalog.indexOf('const pagehide=')), /recover|resend|send\(/, 'coming back never resends or recovers by itself');
});

test('the bulk tool loads with the draft, outside the initial budget', () => {
  assert.doesNotMatch(master, /import NativeSalaryBulk from/);
  assert.match(master, /await import\('\.\/NativeSalaryBulk\.jsx'\)/);
});
