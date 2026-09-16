// Public navigation only: no data query, approval, persistence or guessed output.
export const CATALOG_SHORTCUTS = Object.freeze([
  Object.freeze({ id: 'mutuales', label: 'Mutuales', query: 'mutuales', area: 'Nómina', format: 'all' }),
  Object.freeze({ id: 'bancos', label: 'Bancos', query: 'bancarización', area: 'Nómina', format: 'all' }),
  Object.freeze({ id: 'escolaridad', label: 'Escolaridad', query: 'escolaridad', area: 'RR. HH.', format: 'all' }),
  Object.freeze({ id: 'recibos', label: 'Recibos', query: 'recibos', area: 'Nómina', format: 'all' }),
]);

export function catalogShortcut(id) {
  const item = CATALOG_SHORTCUTS.find(shortcut => shortcut.id === id);
  if (!item) throw new TypeError('Acceso rápido no reconocido');
  return { query: item.query, area: item.area, format: item.format };
}
