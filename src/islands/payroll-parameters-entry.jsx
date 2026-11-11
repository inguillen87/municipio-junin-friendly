import { createRoot } from 'react-dom/client';
import PayrollParameters from './PayrollParameters.jsx';
export function mountPayrollParameters(host) {
  if (!host || host.dataset.parameterMounted) return;
  host.dataset.parameterMounted = 'true';
  // React reports the error while it is still committing: an unmount asked for at that moment is queued and empties the host
  // afterwards, erasing the notice and leaving a blank task. The notice is written once React has finished.
  const root = createRoot(host, { onUncaughtError() { queueMicrotask(() => { root.unmount(); host.textContent = 'No se pudo abrir Parámetros. Actualizá la página antes de iniciar una operación.'; }); } });
  root.render(<PayrollParameters/>);
  return () => { root.unmount(); delete host.dataset.parameterMounted; };
}
