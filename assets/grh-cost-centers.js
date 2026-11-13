// Centros de costo de Junín (maestro GRH «costos», respaldo 09/11/2026). Sólo código y nombre; sin personas ni importes.
// Es una ayuda de carga para elegir por nombre: lo que se guarda sigue siendo el código y el servidor lo valida igual.
// Un código fuera de esta lista no se bloquea.
const RAW = [
[1, 'Obras Públicas'], [2, 'Servicios Públicos'], [3, 'Secretaría de Gobierno'], [4, 'Hacienda'], [5, 'Deporte'],
[6, 'Acción Social'], [7, 'Tesorería'], [8, 'Rentas'], [9, 'Cultura'], [10, 'Compras'],
[11, 'Taller'], [12, 'Veterinaria'], [13, 'Recursos Humanos'], [14, 'Cómputos'], [15, 'Vivienda'],
[16, 'Intendencia'], [17, 'Mesa de Entrada'], [18, 'Departamento de Defensa Civil'], [19, 'I.B.Z.E.'], [20, 'Catastro'],
[21, 'Centro de Salud'], [22, 'Despacho Admin. Intendencia'], [23, 'Obras Privadas'], [24, 'Asesoría Letrada'], [25, 'Biblioteca'],
[26, 'Hacienda'], [27, 'Obras Públicas y Privadas'], [28, 'Proyectos'], [29, 'H.C.D.'], [30, 'Personal'],
[31, 'Archivo Municipal'], [32, 'Delegación Municipal La Colonia'], [33, 'Promoción Económica'], [34, 'Honorable Concejo Deliberante'], [35, 'Reparación de Escuelas'],
[36, 'Pensiones'], [37, 'Prensa y Difusión'], [38, 'Recursos Físicos'], [39, 'Sin área / costos'], [40, 'Licencias de Conducir'],
[41, 'Planta de Reciclado'], [42, 'Celadora Jardines Maternales'], [43, 'Jardín Corazones Saltarines'], [44, 'Jardín Ferroviario'], [45, 'Mi Rinconcito'],
[46, 'Castillo de Sueños'],
];
export const GRH_COST_CENTERS = Object.freeze(RAW.map(([code, label]) => Object.freeze({ code: String(code), label })));
const byCode = new Map(GRH_COST_CENTERS.map(c => [c.code, c]));
const digits = value => /^(?:0|[1-9]\d{0,19})$/.test(value);
const fold = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function costCenterInfo(code) { return byCode.get(String(code ?? '').trim()) ?? null; }
// Texto de una opción: el código adelante porque hay dos centros con el mismo nombre (4 y 26).
export function costCenterOption(c) { return c.code + ' · ' + c.label; }
// Código guardado → cómo se lee. Uno fuera de la lista se muestra tal cual, sin inventarle nombre.
export function costCenterText(code) {
  if (code === null || code === undefined || code === '') return 'Sin informar';
  const known = costCenterInfo(code); return known ? costCenterOption(known) : String(code);
}
// Centros cuyo nombre o código contiene todas las palabras escritas, en el orden de la lista.
export function searchCostCenters(query, { limit = 6 } = {}) {
  const words = fold(query).split(' ').filter(Boolean); if (!words.length) return [];
  return GRH_COST_CENTERS.filter(c => { const text = fold(costCenterOption(c)); return words.every(word => text.includes(word)); }).slice(0, limit);
}
// Lo escrito → código a guardar; '' si está vacío; null si no se puede saber cuál es.
// Vale un número (se valida al guardar), el texto exacto de una opción o palabras que reconocen un solo centro.
export function costCenterCode(text) {
  const value = typeof text === 'string' ? text.trim() : ''; if (!value) return '';
  if (digits(value)) return value;
  const exact = GRH_COST_CENTERS.filter(c => fold(costCenterOption(c)) === fold(value)); if (exact.length === 1) return exact[0].code;
  const found = searchCostCenters(value, { limit: 2 }); return found.length === 1 ? found[0].code : null;
}
// Línea de ayuda debajo del campo, según lo escrito.
export function costCenterHint(text) {
  const value = typeof text === 'string' ? text.trim() : ''; if (!value) return '';
  if (digits(value)) { const known = costCenterInfo(value); return known ? known.label : 'El centro ' + value + ' no está en la lista de referencia: se valida al guardar.'; }
  const found = searchCostCenters(value, { limit: 4 });
  if (found.length === 1) return found[0].code + ' · ' + found[0].label;
  return found.length ? '¿Cuál? ' + found.map(costCenterOption).join(' / ') : 'Sin coincidencias. Elegí un centro de la lista o escribí su número.';
}
// Opciones para un <datalist>: el valor es el código (lo que se guarda) y la etiqueta, el nombre.
export function costCenterDatalist(id, document = globalThis.document) {
  const list = document.createElement('datalist'); list.id = id;
  for (const c of GRH_COST_CENTERS) { const option = document.createElement('option'); option.value = c.code; option.label = c.label; list.append(option); }
  return list;
}
