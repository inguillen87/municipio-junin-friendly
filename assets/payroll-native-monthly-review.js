import { requireNativeMonthlyPreparation } from './payroll-native-monthly-model.js';

const element = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};

function amount(value) {
  if (value === null) return 'No informado';
  const cents = BigInt(value), absolute = cents < 0n ? -cents : cents;
  return (cents < 0n ? '-' : '') + '$ ' + (absolute / 100n).toLocaleString('es-AR')
    + ',' + String(absolute % 100n).padStart(2, '0');
}

export function mountNativeMonthlyReview(host, onChange) {
  let review = null;
  const title = element('h3', 'Revisá la novedad mensual completa');
  title.id = 'nativeMonthlyReviewTitle';
  title.tabIndex = -1;
  host.setAttribute('aria-labelledby', title.id);
  host.dataset.reviewOnly = 'true';

  const person = element('p'), grid = element('dl');
  const effect = element('p', 'Se guardará una novedad en borrador para revisión independiente. No calcula ni paga haberes.');
  const label = element('label'), confirm = element('input');
  grid.className = 'native-monthly-review-grid';
  label.className = 'native-monthly-review-confirm';
  confirm.type = 'checkbox';
  confirm.id = 'nativeMonthlyReviewConfirm';
  label.append(confirm, element('span', 'Revisé la persona, el período y todos los datos de esta novedad.'));
  host.append(title, person, grid, effect, label);
  confirm.addEventListener('change', onChange);

  return {
    show(value) {
      review = requireNativeMonthlyPreparation(value);
      const { draft, subject } = review, row = draft.rows[0];
      confirm.checked = false;
      person.textContent = (subject.employeeName ?? 'Nombre no informado')
        + ' · Legajo ' + subject.legajo + ' · Alta propia de MuniControl';
      grid.replaceChildren();
      const fields = [
        ['Período', draft.periodMonth.slice(0, 7)],
        ['Liquidación', 'Mensual'],
        ['Concepto', row.conceptSourceId],
        ['Área / centro de costo', row.costCenterSourceId ?? 'No informado'],
        ['Mes de ajuste', row.adjustmentMonth?.slice(0, 7) ?? 'No informado'],
        ['Unidades informadas', row.quantityDecimal === null ? 'No informadas' : row.quantityDecimal.replace('.', ',')],
        ['Importe manual', amount(row.amountCents)],
        ['Movimiento', row.movementType ?? 'No informado'],
        ['Instrumento legal', row.legalInstrument ?? 'No informado'],
        ['Observación', row.observation ?? 'No informada'],
        ['Modo forzado', row.forced ? 'Sí · exige revisión independiente' : 'No'],
      ];
      for (const [name, value] of fields) {
        const item = element('div');
        item.append(element('dt', name), element('dd', value));
        grid.append(item);
      }
      host.hidden = false;
      title.focus({ preventScroll: true });
      host.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    confirmed(value) {
      return value === review && confirm.checked && !host.hidden;
    },
    clear() {
      review = null;
      confirm.checked = false;
      person.textContent = '';
      grid.replaceChildren();
      host.hidden = true;
    },
  };
}
