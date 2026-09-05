import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('login.html');
const css = read('assets/access.css');
const build = read('scripts/build-friendly.mjs');

// These are source contracts, not a DOM/CSS cascade or end-to-end login test.
// Ignore scripts and comments so an ID or tag in code cannot satisfy markup checks.
function markup(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
}

function elements(source) {
  return [...markup(source).matchAll(/<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)].map((match) => {
    const attributes = Object.fromEntries([...match[2].matchAll(/([^\s=/'"<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
      .map((attribute) => [attribute[1].toLowerCase(), attribute[2] ?? attribute[3] ?? attribute[4] ?? '']));
    return { tag: match[1].toLowerCase(), attributes };
  });
}

const nodes = elements(html);
function byId(id) {
  const matches = nodes.filter((node) => node.attributes.id === id);
  assert.equal(matches.length, 1, `${id} debe existir una sola vez en el HTML`);
  return matches[0];
}

function expectAttributes(id, expected) {
  const node = byId(id);
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(node.attributes[name], value, `${id}: conservar ${name}=${JSON.stringify(value)}`);
  }
  return node;
}

function hasToken(value, token) {
  return (value || '').split(/\s+/).includes(token);
}

function block(source, header) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const match = header.exec(clean);
  assert.ok(match, `falta bloque ${header}`);
  const start = clean.indexOf('{', match.index);
  let depth = 1;
  for (let index = start + 1; index < clean.length; index += 1) {
    if (clean[index] === '{') depth += 1;
    if (clean[index] === '}') depth -= 1;
    if (!depth) return clean.slice(start + 1, index);
  }
  assert.fail(`bloque sin cierre: ${header}`);
}

function buildFileList(name) {
  const match = build.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;`));
  assert.ok(match, `falta lista de compilación ${name}`);
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((entry) => entry[1]);
}

test('el diseño externo se carga solo en acceso y se copia al artefacto estático', () => {
  const styles = nodes.filter((node) => node.tag === 'link' && hasToken(node.attributes.rel, 'stylesheet'));
  const hrefs = styles.map((node) => node.attributes.href.replace(/^\//, ''));
  assert.equal(hrefs.filter((href) => href === 'assets/access.css').length, 1);
  assert.ok(hrefs.indexOf('assets/access.css') > hrefs.indexOf('assets/municontrol-enterprise.css'));
  assert.ok(hrefs.indexOf('assets/access.css') > hrefs.indexOf('assets/install-share.css'));
  assert.ok(hasToken(nodes.find((node) => node.tag === 'body')?.attributes.class, 'access-page'));
  assert.equal(nodes.filter((node) => node.tag === 'style').length, 0, 'el diseño de acceso no debe volver a un bloque inline');
  for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.html') && name !== 'login.html')) {
    const accessStyles = elements(read(file)).filter((node) => node.tag === 'link'
      && /(?:^|\/)assets\/access\.css(?:[?#]|$)/.test(node.attributes.href || ''));
    assert.equal(accessStyles.length, 0, `${file} no forma parte de esta migración visual`);
  }
  const shellFiles = buildFileList('shellFiles');
  assert.equal(shellFiles.filter((file) => file === 'assets/access.css').length, 1);
  assert.ok(shellFiles.includes('login.html'));
  assert.match(build, /for\s*\(const\s+file\s+of\s*\[\s*\.\.\.shellFiles\s*,\s*\.\.\.pwaFiles\s*\]\s*\)/);
  assert.match(build, /fs\.copyFileSync\(\s*path\.join\(root,\s*file\),\s*destination\s*\)/);
});

test('los identificadores existentes y las referencias del controlador siguen resolviendo', () => {
  const requiredIds = [
    'mc-install-share-root', 'page-title', 'access-panel', 'login-title', 'loginForm', 'errorMsg',
    'credentialStep', 'emailInput', 'passInput', 'togglePassBtn', 'internal-help', 'btnLogin',
    'contextStep', 'contextHelp', 'contextOptions', 'cancelContextButton', 'continueContextButton',
    'loginEnrollmentStep', 'loginManualMfaKey', 'loginEnrollmentTotp', 'cancelEnrollmentButton',
    'completeEnrollmentButton', 'loginRecoveryStep', 'loginRecoveryCodes', 'loginRecoveryConfirmed',
    'finishLoginEnrollmentButton', 'mfaStep', 'requestEmailMfaButton', 'emailMfaStatus', 'mfaHelp',
    'mfaInputLabel', 'mfaInput', 'cancelMfaButton', 'verifyMfaButton', 'useAuthenticatorButton',
    'toggleRecoveryButton', 'accessStatus', 'publicAccessBtn',
  ];
  for (const id of requiredIds) byId(id);
  const ids = nodes.filter((node) => node.attributes.id).map((node) => node.attributes.id);
  assert.equal(new Set(ids).size, ids.length, 'no debe haber IDs duplicados, tampoco en elementos nuevos');
  for (const match of html.matchAll(/document\.getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) byId(match[1]);
  for (const node of nodes) {
    for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for']) {
      for (const id of (node.attributes[attribute] || '').split(/\s+/).filter(Boolean)) byId(id);
    }
  }
});

test('el formulario conserva autocompletado, etiquetas y acciones explícitas', () => {
  assert.equal(expectAttributes('loginForm', {
    onsubmit: 'doLogin(event)', autocomplete: 'on', novalidate: '', 'aria-describedby': 'internal-help',
  }).tag, 'form');
  assert.equal(expectAttributes('emailInput', {
    name: 'email', type: 'email', inputmode: 'email', autocomplete: 'username', required: '',
  }).tag, 'input');
  assert.equal(expectAttributes('passInput', {
    name: 'password', type: 'password', autocomplete: 'current-password', required: '',
  }).tag, 'input');
  expectAttributes('togglePassBtn', { type: 'button', onclick: 'togglePass()', 'aria-controls': 'passInput', 'aria-pressed': 'false' });
  for (const id of ['emailInput', 'passInput', 'loginEnrollmentTotp', 'mfaInput']) {
    assert.ok(nodes.some((node) => node.tag === 'label' && node.attributes.for === id), `falta etiqueta de ${id}`);
  }
  for (const id of ['btnLogin', 'continueContextButton', 'completeEnrollmentButton', 'verifyMfaButton']) {
    assert.equal(expectAttributes(id, { type: 'submit' }).tag, 'button');
  }
  for (const id of ['cancelContextButton', 'cancelEnrollmentButton', 'finishLoginEnrollmentButton',
    'requestEmailMfaButton', 'cancelMfaButton', 'useAuthenticatorButton', 'toggleRecoveryButton', 'publicAccessBtn']) {
    assert.equal(expectAttributes(id, { type: 'button' }).tag, 'button');
  }
  const submitButton = markup(html).match(/<button\b[^>]*\bid=["']btnLogin["'][^>]*>([\s\S]*?)<\/button\s*>/i);
  assert.ok(submitButton, 'falta botón de envío');
  assert.ok(elements(submitButton[1]).some((node) => hasToken(node.attributes.class, 'button-label')),
    'el controlador actualiza el descendiente .button-label');
  expectAttributes('publicAccessBtn', { onclick: 'openPublicView()' });
  assert.match(html, /function\s+openPublicView\s*\(\s*\)\s*\{[^}]*window\.location\.href\s*=\s*['"]\/['"]/);
});

test('los pasos secundarios comienzan ocultos y mantienen estados accesibles', () => {
  assert.ok(!Object.hasOwn(byId('credentialStep').attributes, 'hidden'));
  for (const id of ['contextStep', 'loginEnrollmentStep', 'loginRecoveryStep', 'mfaStep', 'useAuthenticatorButton', 'errorMsg']) {
    expectAttributes(id, { hidden: '' });
  }
  for (const id of ['continueContextButton', 'finishLoginEnrollmentButton']) expectAttributes(id, { disabled: '' });
  expectAttributes('contextOptions', { role: 'radiogroup' });
  expectAttributes('loginRecoveryConfirmed', { type: 'checkbox' });
  assert.ok(!Object.hasOwn(byId('loginRecoveryConfirmed').attributes, 'checked'));
  expectAttributes('errorMsg', { role: 'alert', 'aria-live': 'assertive' });
  expectAttributes('accessStatus', { role: 'status', 'aria-live': 'polite' });
  expectAttributes('emailMfaStatus', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  expectAttributes('requestEmailMfaButton', { 'aria-describedby': 'emailMfaStatus' });
  for (const id of ['loginEnrollmentTotp', 'mfaInput']) {
    expectAttributes(id, { type: 'text', inputmode: 'numeric', pattern: '[0-9]{6}', minlength: '6', maxlength: '6', autocomplete: 'one-time-code' });
  }
  for (const id of ['mfaHelp', 'emailMfaStatus']) assert.ok(hasToken(byId('mfaInput').attributes['aria-describedby'], id));
  assert.match(block(css, /\[hidden\]\s*\{/), /\bdisplay\s*:\s*none\s*!important\s*(?:;|$)/i,
    'las nuevas reglas flex/grid no deben revelar pasos ocultos');
});

test('abrir MFA oculta la selección anterior y evita mostrar dos pasos simultáneos', () => {
  const transition = html.match(/function openMfaStep\([\s\S]*?\n\s*function openLoginEnrollment/);
  assert.ok(transition, 'falta la transición al segundo factor');
  assert.match(transition[0], /getElementById\('contextStep'\)\.hidden\s*=\s*true/);
  assert.match(transition[0], /getElementById\('credentialStep'\)\.hidden\s*=\s*true/);
  assert.match(transition[0], /getElementById\('mfaStep'\)\.hidden\s*=\s*false/);
});

test('el salto al formulario tiene destino enfocable y el foco de teclado permanece visible', () => {
  const skips = nodes.filter((node) => node.tag === 'a' && hasToken(node.attributes.class, 'skip-link'));
  assert.equal(skips.length, 1);
  const target = skips[0].attributes.href;
  assert.match(target, /^#[\w-]+$/);
  expectAttributes(target.slice(1), { tabindex: '-1', 'aria-labelledby': 'login-title' });
  assert.equal(byId('login-title').tag, 'h1');
  assert.match(block(css, /\.skip-link:focus(?:-visible)?\s*\{/), /\btransform\s*:\s*translateY\(\s*0\s*\)/);
  assert.match(css, /:focus-visible\s*\{[^}]*\boutline\s*:\s*[1-9][\d.]*px\s+solid\s+var\(--access-focus\)/);
});

test('la entrada no presenta cifras estáticas de cobertura como indicadores vigentes', () => {
  const body = markup(html).match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1];
  assert.ok(body);
  const visibleText = body.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160|#xA0);/gi, ' ').replace(/\s+/g, ' ');
  assert.doesNotMatch(visibleText, /\b\d[\d.,]*\s*(?:%|(?:legajos|agentes|empleados|personas|registros)\b)/i,
    'las cifras operativas requieren fecha y fuente en la vista de indicadores, no en el login estático');
  assert.ok(!nodes.some((node) => hasToken(node.attributes.class, 'fact-value')), 'no restaurar tarjetas de cobertura congeladas');
  assert.match(html, /<!--\s*MC_REACT_ISLANDS\s*-->/);
  assert.ok(nodes.some((node) => node.tag === 'details' && hasToken(node.attributes.class, 'mc-install-share')),
    'la ayuda de instalación debe conservar una alternativa HTML sin JavaScript');
});

test('la paleta y el logo respetan la identidad compartida sobre un encabezado claro', () => {
  const tokens = block(css, /:root\s*\{/);
  const sharedTokens = block(read('assets/municontrol-enterprise.css'), /:root\s*\{/);
  for (const [access, shared] of [['ink', 'ink'], ['teal', 'teal']]) {
    const brandValue = sharedTokens.match(new RegExp(`--mc-brand-${shared}\\s*:\\s*(#[\\da-f]+)`, 'i'))?.[1];
    assert.ok(brandValue);
    assert.match(tokens, new RegExp(`--access-${access}\\s*:\\s*${brandValue}\\s*;`, 'i'));
  }
  assert.match(tokens, /color-scheme\s*:\s*light\s*;/);
  assert.match(block(css, /\.site-header\s*\{/), /background\s*:\s*(?:#fff(?:fff)?|white)\s*;/i);
  assert.match(block(css, /\.access-page\s+\.site-header\s+\.brand\s+\.brand-name\s*\{/),
    /background-image\s*:\s*url\(\s*["']?brand\/logo-horizontal\.svg["']?\s*\)/);
});

test('el diseño respeta movimiento reducido y conserva identidad en colores forzados', () => {
  const reduced = block(css, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/);
  assert.match(reduced, /animation-duration\s*:\s*(?:0|\.0*1|0\.0*1)ms\s*!important/);
  assert.match(reduced, /animation-iteration-count\s*:\s*1\s*!important/);
  assert.match(reduced, /transition\s*:\s*none\s*!important/);
  assert.match(reduced, /scroll-behavior\s*:\s*auto\s*!important/);
  const forced = block(css, /@media\s*\(\s*forced-colors\s*:\s*active\s*\)\s*\{/);
  const brand = block(forced, /\.brand-name\s*\{/);
  assert.match(brand, /background\s*:\s*none\s*;/);
  assert.match(brand, /color\s*:\s*CanvasText\s*!important/);
  assert.match(brand, /font-size\s*:\s*[1-9][\d.]*px\s*!important/);
  assert.match(forced, /:checked\)[^{]*\{[^}]*outline\s*:\s*[1-9][\d.]*px\s+solid\s+Highlight/);
});

test('los estilos y fuentes del acceso no agregan dependencias remotas', () => {
  const localPath = (value, context) => {
    assert.ok(value, `recurso sin ruta en ${context}`);
    assert.doesNotMatch(value, /^(?:[a-z][\w+.-]*:)?\/\//i, `dependencia remota en ${context}: ${value}`);
    assert.doesNotMatch(value, /^(?:https?|ftp):/i, `dependencia remota en ${context}: ${value}`);
  };
  const shipped = new Set([...buildFileList('shellFiles'), ...buildFileList('pwaFiles')]);
  for (const link of nodes.filter((node) => node.tag === 'link')) {
    if (!hasToken(link.attributes.rel, 'stylesheet') && !['style', 'font'].includes(link.attributes.as)) continue;
    localPath(link.attributes.href, 'login.html');
    const file = link.attributes.href.replace(/^\//, '');
    assert.ok(shipped.has(file), `${file} debe estar incluido en la compilación`);
    if (!hasToken(link.attributes.rel, 'stylesheet')) continue;
    const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of source.matchAll(/@import\s+["']([^"']+)["']/gi)) localPath(match[1], file);
    for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      const resource = match[1].trim();
      localPath(resource, file);
      if (/^(?:data:|#)/i.test(resource)) continue;
      const destination = resource.startsWith('/') ? resource.slice(1) : path.posix.join(path.posix.dirname(file), resource);
      assert.ok(fs.existsSync(path.join(root, destination)), `falta recurso local ${destination}`);
      assert.ok(shipped.has(destination), `${destination} debe llegar al artefacto publicado`);
    }
  }
  assert.doesNotMatch(markup(html), /fonts\.(?:googleapis|gstatic)\.com/i);
});
