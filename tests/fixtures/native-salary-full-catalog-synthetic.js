// Fictional master for complete-volume QA. No municipal amounts or expressions.
export function fullSalaryCatalogFixture() {
  const definition = (patch = {}) => ({
    kind: 'concept', code: '1', agreementCode: '1', categoryCode: null,
    label: 'Definición ficticia QA', nature: 'remuneration', unit: 'money',
    precision: 3, value: null, validFrom: '2000-01', validUntil: null,
    active: true, ruleReference: 'Documento ficticio de QA; no homologación municipal',
    dependencies: [], ...patch,
  });
  const concepts = Array.from({ length: 2033 }, (_, n) => definition({
    code: String(n + 1), label: 'Concepto ficticio ' + (n + 1),
    value: n % 3 === 0 ? null : n % 3 === 1 ? '0.000' : '-12.345',
  }));
  const auxiliaries = Array.from({ length: 547 }, (_, n) => definition({
    kind: 'auxiliary', code: String(n + 1), nature: 'auxiliary',
    label: 'Auxiliar ficticio ' + (n + 1), value: '0.000',
  }));
  const categories = Array.from({ length: 156 }, (_, n) => String(n + 1));
  const scales = categories.flatMap(categoryCode => Array.from({ length: 4 }, (_, n) => definition({
    kind: 'scale', code: String(4001 + n), categoryCode, nature: null,
    label: 'Escala ficticia ' + (n + 1), value: '12.345',
  })));
  const history = Array.from({ length: 75 }, (_, n) => definition({
    code: String(8001 + n), validFrom: '1999-01', validUntil: '1999-12',
    active: false, label: 'Antecedente ficticio ' + (n + 1), value: '0.000',
  }));
  const classification = [
    { kind: 'agreements', code: '1', label: 'Convenio ficticio QA' },
    ...categories.map(code => ({ kind: 'categories', agreementCode: '1', code, label: 'Clase ficticia ' + code })),
  ];
  return { items: [...concepts, ...auxiliaries, ...scales], history, classification };
}
