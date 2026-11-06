// «Todas las reparticiones» for Calcular. With «Todos los legajos propios» the engine rejects the whole run when
// one active legajo has no repartición; the «Reparticiones» scope skips them instead. This picks every
// repartición that has active people in the verified own roster, so the run covers everyone else.
// Pure: no requests, no DOM. A name that does not match exactly one catalog repartición blocks the shortcut.
const key = value => String(value ?? '').trim().toUpperCase();

export function ownRunDepartmentsForAll(rows, catalogItems) {
  const sectors = (Array.isArray(catalogItems) ? catalogItems : []).filter(item => item && item.kind === 'sectors' && typeof item.code === 'string' && /^[0-9]{1,9}$/.test(item.code));
  const byLabel = new Map();
  for (const item of sectors) byLabel.set(key(item.label), [...(byLabel.get(key(item.label)) ?? []), item.code]);
  const codes = new Set(), unsectored = [], unmatched = new Set();
  let covered = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.status !== 'active') continue;
    const name = key(row.sector);
    if (!name) { unsectored.push(String(row.legajo)); continue; }
    const match = byLabel.get(name);
    if (match?.length !== 1) { unmatched.add(String(row.sector).trim()); continue; }
    codes.add(match[0]); covered++;
  }
  const sorted = [...codes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.freeze({
    codes: Object.freeze(sorted),
    covered,
    unsectored: Object.freeze(unsectored.sort((a, b) => Number(a) - Number(b) || (a < b ? -1 : 1))),
    unmatched: Object.freeze([...unmatched].sort()),
    usable: sorted.length > 0 && unmatched.size === 0,
  });
}

export function ownRunUnsectoredText(plan) {
  const list = plan.unsectored, n = list.length;
  if (!n) return '';
  const who = (n === 1 ? 'El legajo ' + list[0] + ' no tiene' : 'Los legajos ' + list.slice(0, 8).join(', ') + (n > 8 ? ' y ' + (n - 8) + ' más' : '') + ' no tienen') + ' repartición cargada';
  const why = 'con «Todos los legajos propios» el motor rechaza la corrida entera.';
  if (!plan.usable) return who + ': ' + why + ' Corregí su ficha en Personas antes de calcular a todos.';
  return who + ': ' + why + ' Calculá las ' + plan.codes.length + ' reparticiones con personal activo: incluye a los ' + plan.covered + ' legajos restantes y deja fuera sólo ' + (n === 1 ? 'ese legajo' : 'esos ' + n) + ' hasta que se corrija su ficha en Personas.';
}
