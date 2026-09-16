import { ParameterRequestError } from './payroll-parameter-client.js';
export async function catalogRequest(query = {}, attempt = null, fetcher = globalThis.fetch) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetcher('/api/internal-payroll-catalog' + (Object.keys(query).length ? '?' + new URLSearchParams(query) : ''), {
      method: attempt ? 'POST' : 'GET', credentials:'same-origin', cache:'no-store', redirect:'error', signal:controller.signal,
      headers: attempt ? {'Content-Type':'application/json','Idempotency-Key':attempt.key} : {},
      ...(attempt ? {body:JSON.stringify({command:attempt.command,payload:attempt.payload})} : {}),
    });
    let result; try { result = await response.json(); } catch { throw new ParameterRequestError('Respuesta no verificable. Consultá el intento antes de repetirlo.',503,'CATALOG_RESPONSE_INVALID'); }
    if (!response.ok || result?.ok !== true) throw new ParameterRequestError(typeof result?.error === 'string' ? result.error : 'No se completó la consulta.',response.status,result?.code || 'CATALOG_REQUEST_FAILED');
    return result;
  } catch (e) {
    if (e instanceof ParameterRequestError) throw e;
    throw new ParameterRequestError('Se perdió la confirmación. Conservamos el mismo intento para no duplicar la activación.',503,'CATALOG_CONNECTION_UNCERTAIN');
  } finally { clearTimeout(timer); }
}
