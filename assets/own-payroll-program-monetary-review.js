import {ownMonetaryProgrammeStructure} from './own-payroll-monetary-manifest.js';
import {salarySerialized} from './native-salary-catalog-model.js';

// A presentation snapshot of the entire declaration, never an integrity or
// authority decision. Proposal/approval boundaries still verify every digest.
export function programMonetaryReview(definition) {
 if (!definition || !['monetaryPolicyVersion', 'monetaryPolicy'].some(key => Object.hasOwn(definition, key))) return null;
 const checked = ownMonetaryProgrammeStructure(definition), value = checked.definition;
 const manifest = value.monetaryPolicy, policy = manifest.policy;
 return Object.freeze({
  manifestVersion: value.monetaryPolicyVersion, policyVersion: policy.version,
  sourceReference: manifest.sourceReference, sourceSha256: manifest.sourceSha256,
  sourceStateSha256: policy.sourceStateSha256, programSha256: policy.programSha256,
  inventorySha256: policy.inventorySha256, policySha256: policy.policySha256,
  entries: policy.entries,
  declaration: manifest, integrityValidated: false, approvalAuthorityValidated: false,
  sourceEvidence: 'declared_not_document_revalidated', payrollCalculated: false,
 });
}

export function programMonetaryComparison(before, after) {
 const a = programMonetaryReview(before), b = programMonetaryReview(after);
 if (!a && !b) return null;
 const content = view => view ? salarySerialized({version: view.manifestVersion, declaration: view.declaration}) : null;
 return Object.freeze({before: a, after: b, changed: content(a) !== content(b)});
}

const modes = Object.freeze({exact:'Exigir resultado exacto', half_up:'Más cercano; mitad alejada del cero', half_even:'Más cercano; mitad al par', toward_zero:'Hacia cero', floor:'Hacia el inferior', ceiling:'Hacia el superior'});
const natures = Object.freeze({remuneration:'Remunerativo', non_remuneration:'No remunerativo', deduction:'Descuento', employer_contribution:'Contribución patronal', auxiliary:'Auxiliar'});
const types = Object.freeze({monthly:'Mensual', first_fortnight:'Primera quincena', sac:'Aguinaldo', vacation:'Vacaciones', supplementary:'Suplementaria', final:'Liquidación final', other:'Otros conceptos'});

// All source text is rendered as text nodes. Every declared entry remains
// available; advanced fingerprints are disclosed without truncating the set.
export function renderProgramMonetaryReview(parent, view, title = 'Tratamiento de importes') {
 parent.replaceChildren(); parent.hidden = !view;
 if (!view) return;
 const doc = parent.ownerDocument;
 const node = (tag, text) => {const value = doc.createElement(tag); if (text !== undefined) value.textContent = String(text); return value;};
 parent.append(node('h4', title), node('p', `Declaración completa: ${view.entries.length} reglas con importes. Fuente declarada: ${view.sourceReference}`));
 parent.append(node('p', 'Esta vista no certifica la fuente documental, la integridad ni una aprobación. Las verificaciones completas siguen siendo obligatorias antes de registrar o decidir.'));
 const fingerprints = node('details'); fingerprints.append(node('summary', 'Versiones y huellas de la declaración'));
 for (const [label, value] of [['Versión del anexo', view.manifestVersion], ['Versión de la política', view.policyVersion], ['Fuente', view.sourceSha256], ['Estado de fuente', view.sourceStateSha256], ['Programa', view.programSha256], ['Inventario', view.inventorySha256], ['Política', view.policySha256]]) fingerprints.append(node('p', label + ': ' + value));
 parent.append(fingerprints);
 const details = node('details'); details.append(node('summary', `Ver las ${view.entries.length} reglas y sus fuentes completas`));
 const scroll = node('div'); scroll.className = 'own-program-table'; scroll.tabIndex = 0;
 scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', title + ': todas las reglas monetarias');
 const table = node('table'); table.append(node('caption', 'Conjunto completo de importes, criterios y fuentes declaradas'));
 const head = node('thead'), headings = node('tr');
 for (const label of ['Regla y alcance', 'Tratamiento del importe', 'Fuente declarada']) {const th = node('th', label); th.scope = 'col'; headings.append(th);}
 head.append(headings); table.append(head); const body = node('tbody');
 for (const entry of view.entries) {
  const id = entry.identity, row = node('tr');
  const identity = node('td', `${id.kind === 'auxiliary' ? 'Auxiliar' : 'Concepto'} ${id.code} · convenio ${id.agreementCode} · ${natures[id.nature]}`);
  identity.append(node('p', `${id.validFrom} → ${id.validUntil ?? 'sin término'} · tipos: ${id.liquidationTypes.map(type => types[type]).join(', ')}`));
  const treatment = node('td', `Importe · al terminar la regla · ${entry.rounding.precision} decimales · ${modes[entry.rounding.mode]}`);
  const source = node('td', entry.sourceReference), hashes = node('details'); hashes.append(node('summary', 'Huellas de esta regla'));
  hashes.append(node('p', 'Identidad completa: ' + salarySerialized(id)), node('p', 'Fuente: ' + entry.sourceSha256), node('p', 'Regla: ' + entry.ruleSha256), node('p', 'Expresión: ' + entry.expressionSha256)); source.append(hashes);
  row.append(identity, treatment, source); body.append(row);
 }
 table.append(body); scroll.append(table); details.append(scroll); parent.append(details);
}
