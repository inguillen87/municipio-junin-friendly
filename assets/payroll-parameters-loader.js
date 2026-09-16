// Lazy, optional workspace. No private data is queried before opening the task.
export function mountParameterTask(host) {
  let loading = false, ready = false;
  host.textContent = 'Abrí Parámetros para consultar y gestionar los valores salariales.';
  async function open() {
    if (loading || ready) return;
    loading = true;
    host.textContent = 'Abriendo Parámetros salariales…';
    try {
      const access = await globalThis.MuniControlCapabilityGate?.ready;
      if (!access?.tenantCapabilities?.has('payroll.parameter.read')) { host.textContent = 'Tu sesión no tiene permiso para consultar parámetros salariales.'; return; }
      const module = await import('__MC_PAYROLL_PARAMETERS_BUNDLE__');
      if (!host.isConnected) return;
      module.mountPayrollParameters(host); ready = true;
    } catch {
      host.textContent = 'No se pudo abrir Parámetros salariales. ';
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'rc-button secondary'; retry.textContent = 'Reintentar'; retry.addEventListener('click', open); host.append(retry);
    } finally { loading = false; }
  }
  document.addEventListener('taskchange', e => { if (e.detail?.id === 'parametros') open(); });
  if (location.hash === '#parametros') open();
}
