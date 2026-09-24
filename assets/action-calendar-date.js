// A requested calendar day is not a timestamp. Formatting never shifts it to another date.
(function (root) {
  'use strict';
  const pattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const formatter = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
  function parse(value) {
    if (typeof value !== 'string') return null;
    const match = pattern.exec(value); if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const result = new Date(0); result.setUTCFullYear(year, month - 1, day); result.setUTCHours(12, 0, 0, 0);
    return result.getUTCFullYear() === year && result.getUTCMonth() === month - 1 && result.getUTCDate() === day ? result : null;
  }
  function label(value) { const date = parse(value); return date ? formatter.format(date).replace(/\./g, '') : null; }
  root.MuniControlCalendarDate = Object.freeze({ isCivil: value => typeof value === 'string' && pattern.test(value), parse, label });
})(globalThis);
