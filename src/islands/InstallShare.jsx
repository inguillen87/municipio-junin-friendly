import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';

export const PUBLIC_URL = 'https://municipio-junin-friendly.vercel.app/';
export const SHARE_TEXT = 'Gestión municipal, más simple.';
export const WHATSAPP_URL = `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${PUBLIC_URL}`)}`;

// The entry starts this controller before React mounts, retaining early prompts.
export function createInstallController(browser) {
  const displayMode = browser.matchMedia?.('(display-mode: standalone)');
  const subscribers = new Set();
  let pendingPrompt = null;
  let installationConfirmed = false;
  let listening = false;
  const isInstalled = () => installationConfirmed || Boolean(displayMode?.matches || browser.navigator?.standalone);
  let snapshot = { installed: isInstalled(), canInstall: false };

  function publish() {
    const installed = isInstalled();
    if (installed) pendingPrompt = null;
    const canInstall = !installed && pendingPrompt !== null;
    if (snapshot.installed === installed && snapshot.canInstall === canInstall) return;
    snapshot = { installed, canInstall };
    subscribers.forEach((notify) => notify());
  }

  function capturePrompt(event) {
    if (isInstalled() || typeof event.prompt !== 'function') return;
    event.preventDefault();
    pendingPrompt = event;
    publish();
  }

  function confirmInstallation() {
    installationConfirmed = true;
    publish();
  }

  function start() {
    if (listening) return;
    listening = true;
    browser.addEventListener('beforeinstallprompt', capturePrompt);
    browser.addEventListener('appinstalled', confirmInstallation);
    if (displayMode?.addEventListener) displayMode.addEventListener('change', publish);
    else displayMode?.addListener?.(publish);
    publish();
  }

  function stop() {
    if (!listening) return;
    listening = false;
    browser.removeEventListener('beforeinstallprompt', capturePrompt);
    browser.removeEventListener('appinstalled', confirmInstallation);
    if (displayMode?.removeEventListener) displayMode.removeEventListener('change', publish);
    else displayMode?.removeListener?.(publish);
  }

  return {
    start,
    stop,
    getSnapshot: () => snapshot,
    subscribe(notify) {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    async requestInstall() {
      const prompt = pendingPrompt;
      if (!prompt || isInstalled()) return 'unavailable';
      // A browser prompt can be used only once; do not equate acceptance with installation.
      pendingPrompt = null;
      publish();
      const result = await prompt.prompt();
      const choice = result?.outcome ? result : await prompt.userChoice;
      return choice?.outcome || 'unknown';
    },
  };
}

export default function InstallShare({ installController }) {
  const { installed, canInstall } = useSyncExternalStore(
    installController.subscribe,
    installController.getSnapshot,
    installController.getSnapshot,
  );
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState({ kind: '', message: '' });
  const [manualCopy, setManualCopy] = useState(false);
  const busyRef = useRef(false);
  const copyInput = useRef(null);

  useEffect(() => {
    installController.start();
    return installController.stop;
  }, [installController]);

  useEffect(() => {
    if (manualCopy) {
      copyInput.current?.focus();
      copyInput.current?.select();
    }
  }, [manualCopy]);

  function begin(action) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(action);
    setStatus({ kind: action, message: '' });
    return true;
  }

  function finish() {
    busyRef.current = false;
    setBusy('');
  }

  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(PUBLIC_URL);
      setManualCopy(false);
      setStatus({ kind: 'share', message: 'Enlace público copiado.' });
    } catch {
      setManualCopy(true);
      copyInput.current?.focus();
      copyInput.current?.select();
      setStatus({ kind: 'share', message: 'Copiá este enlace y pegalo donde quieras compartirlo.' });
    }
  }

  async function handleCopy() {
    if (!begin('copy')) return;
    try {
      await copyLink();
    } finally {
      finish();
    }
  }

  async function handleShare() {
    if (!begin('share')) return;
    try {
      if (typeof navigator.share !== 'function') {
        await copyLink();
        return;
      }
      await navigator.share({ title: 'MuniControl', text: SHARE_TEXT, url: PUBLIC_URL });
      // Resolution can mean only that the share sheet opened, not that a message was sent.
    } catch (error) {
      if (error?.name !== 'AbortError') await copyLink();
    } finally {
      finish();
    }
  }

  async function handleInstall() {
    if (!begin('install')) return;
    try {
      const outcome = await installController.requestInstall();
      if (outcome === 'accepted') {
        setStatus({ kind: 'install', message: 'Solicitud aceptada. Esperando la confirmación del navegador.' });
      } else if (outcome === 'unavailable' || outcome === 'unknown') {
        setStatus({ kind: 'install', message: 'Podés usar las opciones del navegador indicadas abajo.' });
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setStatus({ kind: 'install', message: 'No se pudo abrir la instalación. Usá las opciones del navegador indicadas abajo.' });
      }
    } finally {
      finish();
    }
  }

  const visibleStatus = installed && status.kind === 'install' ? '' : status.message;

  return (
    <details className="mc-install-share">
      <summary>Usar MuniControl en tu celular</summary>
      <div className="mc-install-share__content">
        <p className="mc-install-share__intro">Agregá un acceso en tu pantalla de inicio o compartí el sitio público.</p>
        {installed ? (
          <p className="mc-install-share__installed" role="status">MuniControl ya está instalado en este dispositivo.</p>
        ) : canInstall || busy === 'install' ? (
          <button type="button" className="mc-install-share__install" onClick={handleInstall} disabled={Boolean(busy)}>
            {busy === 'install' ? 'Abriendo instalación…' : 'Instalar MuniControl'}
          </button>
        ) : null}
        {!installed ? (
          <div className="mc-install-share__help">
            <p><strong>iPhone · Safari:</strong> Compartir → Agregar a pantalla de inicio.</p>
            <p><strong>Android · Chrome:</strong> menú ⋮ → Instalar app o Agregar a pantalla de inicio, según disponibilidad.</p>
          </div>
        ) : null}
        <div className="mc-install-share__actions" role="group" aria-label="Compartir el sitio público">
          <button type="button" onClick={handleShare} disabled={Boolean(busy)}>
            {busy === 'share' ? 'Abriendo…' : 'Compartir'}
          </button>
          <button type="button" onClick={handleCopy} disabled={Boolean(busy)}>
            {busy === 'copy' ? 'Copiando…' : 'Copiar enlace'}
          </button>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="Compartir por WhatsApp (abre otra ventana)">WhatsApp</a>
        </div>
        <p className="mc-install-share__privacy">Solo se comparte el enlace público, sin datos de tu cuenta.</p>
        <p className="mc-install-share__status" role="status" aria-live="polite" aria-atomic="true">{visibleStatus}</p>
        {manualCopy ? (
          <label className="mc-install-share__copy">
            Enlace público para copiar
            <input ref={copyInput} type="text" readOnly value={PUBLIC_URL} onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.currentTarget.select()} spellCheck={false} />
          </label>
        ) : null}
      </div>
    </details>
  );
}
