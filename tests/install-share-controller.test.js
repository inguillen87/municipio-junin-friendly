import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Import the actual JSX module and its React dependency entirely in memory.
// No generated bundles are written into the workspace or public output.
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/islands/InstallShare.jsx', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
});
const { createInstallController, PUBLIC_URL, SHARE_TEXT, WHATSAPP_URL } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
);

class TrackedEventTarget extends EventTarget {
  additions = new Map();
  removals = new Map();

  addEventListener(type, callback) {
    this.additions.set(type, (this.additions.get(type) || 0) + 1);
    super.addEventListener(type, callback);
  }

  removeEventListener(type, callback) {
    this.removals.set(type, (this.removals.get(type) || 0) + 1);
    super.removeEventListener(type, callback);
  }

  activeListeners(type) {
    return (this.additions.get(type) || 0) - (this.removals.get(type) || 0);
  }
}

class FakeBrowser extends TrackedEventTarget {
  constructor({ standalone = false, mediaMatches = false, legacyMedia = false } = {}) {
    super();
    this.navigator = { standalone };
    this.media = new TrackedEventTarget();
    this.media.matches = mediaMatches;
    if (legacyMedia) {
      this.media.addListener = (callback) => TrackedEventTarget.prototype.addEventListener.call(this.media, 'change', callback);
      this.media.removeListener = (callback) => TrackedEventTarget.prototype.removeEventListener.call(this.media, 'change', callback);
      this.media.addEventListener = undefined;
      this.media.removeEventListener = undefined;
    }
  }

  matchMedia(query) {
    assert.equal(query, '(display-mode: standalone)');
    return this.media;
  }
}

function fixture(t, options) {
  const browser = new FakeBrowser(options);
  const controller = createInstallController(browser);
  controller.start();
  t.after(() => controller.stop());
  return { browser, controller };
}

function offerPrompt(browser, { outcome = 'accepted', legacyChoice = false, error } = {}) {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  let calls = 0;
  event.prompt = async () => {
    calls += 1;
    if (error) throw error;
    return legacyChoice ? undefined : { outcome };
  };
  if (legacyChoice) event.userChoice = Promise.resolve({ outcome });
  browser.dispatchEvent(event);
  return { event, get calls() { return calls; } };
}

test('instalar y compartir usa únicamente la URL pública canónica y el lema aprobado', () => {
  assert.equal(PUBLIC_URL, 'https://municipio-junin-friendly.vercel.app/');
  assert.equal(SHARE_TEXT, 'Gestión municipal, más simple.');
  const publicUrl = new URL(PUBLIC_URL);
  assert.equal(publicUrl.search, '');
  assert.equal(publicUrl.hash, '');
  assert.equal(publicUrl.username, '');
  const whatsapp = new URL(WHATSAPP_URL);
  assert.equal(whatsapp.origin, 'https://wa.me');
  assert.equal(whatsapp.pathname, '/');
  assert.deepEqual([...whatsapp.searchParams], [['text', `${SHARE_TEXT} ${PUBLIC_URL}`]]);
});

test('retiene beforeinstallprompt recibido antes de la suscripción de React', (t) => {
  const { browser, controller } = fixture(t);
  const prompt = offerPrompt(browser);
  assert.equal(prompt.event.defaultPrevented, true);
  assert.equal(prompt.calls, 0, 'capturar no debe abrir automáticamente el diálogo');
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => { notifications += 1; });
  t.after(unsubscribe);
  assert.deepEqual(controller.getSnapshot(), { installed: false, canInstall: true });
  assert.equal(notifications, 0);
});

test('start es idempotente y conserva snapshots estables cuando no cambia el estado', (t) => {
  const { browser, controller } = fixture(t);
  const initial = controller.getSnapshot();
  controller.start();
  controller.start();
  assert.equal(browser.additions.get('beforeinstallprompt'), 1);
  assert.equal(browser.additions.get('appinstalled'), 1);
  assert.equal(browser.media.additions.get('change'), 1);
  browser.media.dispatchEvent(new Event('change'));
  assert.strictEqual(controller.getSnapshot(), initial);
});

test('stop limpia todos los eventos y unsubscribe deja de recibir cambios', (t) => {
  const { browser, controller } = fixture(t);
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => { notifications += 1; });
  offerPrompt(browser);
  assert.equal(notifications, 1);
  unsubscribe();
  controller.stop();
  controller.stop();
  assert.equal(browser.activeListeners('beforeinstallprompt'), 0);
  assert.equal(browser.activeListeners('appinstalled'), 0);
  assert.equal(browser.media.activeListeners('change'), 0);
  assert.equal(browser.removals.get('beforeinstallprompt'), 1);
  assert.equal(browser.removals.get('appinstalled'), 1);
  assert.equal(browser.media.removals.get('change'), 1);
  const snapshot = controller.getSnapshot();
  const ignored = offerPrompt(browser);
  browser.dispatchEvent(new Event('appinstalled'));
  browser.media.matches = true;
  browser.media.dispatchEvent(new Event('change'));
  assert.equal(ignored.event.defaultPrevented, false);
  assert.strictEqual(controller.getSnapshot(), snapshot);
  controller.start();
  assert.equal(controller.getSnapshot().installed, true);
  assert.equal(notifications, 1);
});

test('accepted no confirma instalación y cada prompt se usa una sola vez', async (t) => {
  const { browser, controller } = fixture(t);
  const prompt = offerPrompt(browser);
  const request = controller.requestInstall();
  assert.equal(prompt.calls, 1);
  assert.deepEqual(controller.getSnapshot(), { installed: false, canInstall: false });
  assert.equal(await controller.requestInstall(), 'unavailable');
  assert.equal(await request, 'accepted');
  assert.equal(prompt.calls, 1);
  assert.deepEqual(controller.getSnapshot(), { installed: false, canInstall: false });
});

test('appinstalled confirma la instalación y descarta cualquier prompt pendiente', async (t) => {
  const { browser, controller } = fixture(t);
  const pending = offerPrompt(browser);
  browser.dispatchEvent(new Event('appinstalled'));
  assert.deepEqual(controller.getSnapshot(), { installed: true, canInstall: false });
  assert.equal(await controller.requestInstall(), 'unavailable');
  assert.equal(pending.calls, 0);
  const ignored = offerPrompt(browser);
  assert.equal(ignored.event.defaultPrevented, false);
  assert.equal(ignored.calls, 0);
  assert.deepEqual(controller.getSnapshot(), { installed: true, canInstall: false });
});

test('detecta standalone en iOS y por display-mode y actualiza cambios del navegador', (t) => {
  const ios = fixture(t, { standalone: true });
  assert.deepEqual(ios.controller.getSnapshot(), { installed: true, canInstall: false });
  const { browser, controller } = fixture(t, { mediaMatches: true });
  assert.deepEqual(controller.getSnapshot(), { installed: true, canInstall: false });
  browser.media.matches = false;
  browser.media.dispatchEvent(new Event('change'));
  assert.deepEqual(controller.getSnapshot(), { installed: false, canInstall: false });
  offerPrompt(browser);
  browser.media.matches = true;
  browser.media.dispatchEvent(new Event('change'));
  assert.deepEqual(controller.getSnapshot(), { installed: true, canInstall: false });
});

test('dismissed y falta de disponibilidad no marcan instalado y permiten un nuevo ofrecimiento', async (t) => {
  const { browser, controller } = fixture(t);
  assert.equal(await controller.requestInstall(), 'unavailable');
  const dismissed = offerPrompt(browser, { outcome: 'dismissed', legacyChoice: true });
  assert.equal(await controller.requestInstall(), 'dismissed');
  assert.equal(dismissed.calls, 1);
  assert.deepEqual(controller.getSnapshot(), { installed: false, canInstall: false });
  assert.equal(await controller.requestInstall(), 'unavailable');
  const retry = offerPrompt(browser);
  assert.deepEqual(controller.getSnapshot(), { installed: false, canInstall: true });
  assert.equal(retry.calls, 0);
});

test('AbortError consume el prompt sin confirmar instalación y limpia listeners de Safari antiguo', async (t) => {
  const { browser, controller } = fixture(t, { legacyMedia: true });
  assert.equal(browser.media.activeListeners('change'), 1);
  const aborted = offerPrompt(browser, { error: new DOMException('Canceled by user', 'AbortError') });
  await assert.rejects(controller.requestInstall(), { name: 'AbortError' });
  assert.equal(aborted.calls, 1);
  assert.deepEqual(controller.getSnapshot(), { installed: false, canInstall: false });
  assert.equal(await controller.requestInstall(), 'unavailable');
  controller.stop();
  assert.equal(browser.media.activeListeners('change'), 0);
});
