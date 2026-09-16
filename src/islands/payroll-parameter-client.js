export const PARAMETER_ENDPOINT = '/api/internal-payroll-parameters';
export class ParameterRequestError extends Error {
  constructor(message, status, code) { super(message); Object.assign(this, { status, code }); }
}
export async function parameterRequest(query = {}, mutation = null, fetcher = globalThis.fetch) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetcher(PARAMETER_ENDPOINT + (Object.keys(query).length ? '?' + new URLSearchParams(query) : ''), {
      method: mutation ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
      headers: mutation ? { 'Content-Type': 'application/json', 'Idempotency-Key': mutation.key } : {},
      ...(mutation ? { body: JSON.stringify({ command: mutation.command, payload: mutation.payload }) } : {}),
    });
    let result; try { result = await response.json(); } catch { throw new ParameterRequestError('La respuesta no se pudo verificar. Consultá el intento antes de repetirlo.', 503, 'RESPONSE_INVALID'); }
    if (!response.ok || result?.ok !== true) throw new ParameterRequestError(typeof result?.error === 'string' ? result.error : 'La consulta no se completó.', response.status, result?.code || 'REQUEST_FAILED');
    return result;
  } catch (e) {
    if (e instanceof ParameterRequestError) throw e;
    throw new ParameterRequestError('Se perdió la confirmación de la conexión. No se presupone que la operación haya fallado.', 503, 'CONNECTION_UNCERTAIN');
  } finally { clearTimeout(timeout); }
}
export function parameterAttempt(command, payload, uuid = () => crypto.randomUUID()) {
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  return freeze({ command, payload: JSON.parse(JSON.stringify(payload)), key: uuid() });
}
