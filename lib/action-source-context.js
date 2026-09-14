// Only provenance dates and consultation mode may cross the API boundary.
// The SQL facades retain tenant authorization and evidence verification.
export function actionSourceContextFields(record, ErrorType = Error) {
  if (!record || !Object.hasOwn(record, 'sourceContext')) return {};
  const value = record.sourceContext;
  const reject = () => {
    throw new ErrorType('ACTION_SOURCE_CONTEXT_INVALID', 502,
      'No se pudo verificar el respaldo de esta solicitud. Volvé a consultar.');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'currentCutoffAt,sourceCutoffAt,status'
    || !['current', 'historical_read_only'].includes(value.status)) reject();
  function instant(text) {
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(text)) reject();
    const [year, month, day] = text.slice(0, 10).split('-').map(Number);
    const civil = new Date(Date.UTC(year, month - 1, day));
    if (year < 1900 || year > 2100 || civil.getUTCFullYear() !== year
      || civil.getUTCMonth() !== month - 1 || civil.getUTCDate() !== day || !Number.isFinite(Date.parse(text))) reject();
    const fraction = /\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/.exec(text)?.[1] || '';
    const whole = text.replace(/\.\d{1,6}(?=Z|[+-]\d{2}:\d{2}$)/, '');
    return BigInt(Date.parse(whole)) * 1000n + BigInt(fraction.padEnd(6, '0'));
  }
  const original = instant(value.sourceCutoffAt), current = instant(value.currentCutoffAt);
  if (value.status === 'current' ? original !== current : original >= current) reject();
  return { sourceContext: Object.freeze({ status: value.status,
    sourceCutoffAt: value.sourceCutoffAt, currentCutoffAt: value.currentCutoffAt }) };
}

export function actionSourceIsHistorical(record) {
  return record?.sourceContext?.status === 'historical_read_only';
}
