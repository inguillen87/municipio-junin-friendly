import { createRoot } from 'react-dom/client';
import PayrollParameters from './PayrollParameters.jsx';
export function mountPayrollParameters(host) {
  if (!host || host.dataset.parameterMounted) return;
  host.dataset.parameterMounted = 'true';
  const root = createRoot(host, { onUncaughtError() { root.unmount(); host.textContent = 'No se pudo abrir Parámetros. Actualizá la página antes de iniciar una operación.'; } });
  root.render(<PayrollParameters/>);
  return () => { root.unmount(); delete host.dataset.parameterMounted; };
}
