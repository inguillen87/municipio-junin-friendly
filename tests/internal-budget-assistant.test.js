import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  classifyAssistantRequest,
  createInternalAssistantHandler,
  planAssistantRequest,
} from '../api/internal-assistant.js';
import { budgetApproved } from '../api/internal-data.js';

function responseRecorder() {
  return {
    headers: {}, statusCode: null, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return value; },
  };
}

function endpoint(overrides = {}) {
  return createInternalAssistantHandler({
    requireInternalSession: () => ({
      id: 'budget-assistant-user',
      email: 'budget-assistant@example.test',
      role: 'ADMIN_INTERNO',
    }),
    getInternalSql: overrides.getInternalSql || (async () => {
      throw new Error('budget_approved no debe abrir Neon');
    }),
    budgetApproved: overrides.budgetApproved || (() => budgetApproved()),
    fetch: overrides.fetch || (async () => { throw new Error('fetch inesperado'); }),
    env: overrides.env || {},
    quotaStore: new Map(),
    now: () => Date.parse('2026-08-20T12:00:00Z'),
    logger: { info() {} },
    requestIdFactory: () => 'request-budget-assistant-test',
  });
}

async function post(body, overrides = {}) {
  const res = responseRecorder();
  await endpoint(overrides)({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }, res);
  return res;
}

function ars(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

test('clasifica presupuesto, Ordenanza 1021, gasto, recursos, financiamiento y ejecución', () => {
  for (const message of [
    '¿Cuál es el presupuesto municipal aprobado para 2026?',
    'Explicame la Ordenanza 1021/2025',
    '¿Cuál es el gasto aprobado del presupuesto municipal 2026?',
    '¿Cuáles son los recursos estimados del presupuesto municipal 2026?',
    '¿Cuál es el financiamiento estimado del presupuesto municipal 2026?',
    '¿Tenemos ejecución presupuestaria municipal 2026?',
  ]) {
    assert.equal(classifyAssistantRequest({ message }), 'budget_approved', message);
  }
  for (const message of [
    'Mostrame los gastos aprobados de la licitación 15',
    'Financiamiento estimado del préstamo municipal 55',
    'Recursos estimados del proyecto de obra',
    'Presupuesto familiar de Juan Pérez',
    'Presupuesto de compras 2026',
    'Presupuestos de obras 2026',
    'Presupuesto de proyectos 2026',
    'Presupuesto de contrataciones 2026',
    'Presupuesto de licitaciones 2026',
    'Presupuesto de cotizaciones 2026',
    'Presupuesto de préstamos 2026',
    'Presupuesto del evento 15',
    'Presupuesto de la capacitación 30',
    'Presupuesto del expediente 55',
    'Presupuesto del proveedor 42',
    'Presupuesto del contrato 123',
    'Presupuesto de obra 2026 según Ordenanza 1021/2025.',
    'Presupuesto de licitación 2026 según Ordenanza 1021/2025.',
    'Presupuesto del proyecto 2026 según Ordenanza 1021/2025.',
    'Presupuesto personal 2026 según Ordenanza 1021/2025.',
    'Presupuesto familiar 2026 según Ordenanza 1021/2025.',
  ]) {
    assert.notEqual(classifyAssistantRequest({ message }), 'budget_approved', message);
  }
  for (const message of [
    'Explicame la Ordenanza 21/2025',
    'Explicame la Ordenanza 121',
    'Explicame la Ordenanza 021',
    'Explicame la Ordenanza 1021/2024',
    'Explicame la Ordenanza 1.021/2024',
  ]) {
    assert.notEqual(classifyAssistantRequest({ message }), 'budget_approved', message);
  }
  assert.equal(classifyAssistantRequest({ message: 'Explicame la Ordenanza 1.021/2025' }), 'budget_approved');

  const plan = planAssistantRequest({ message: 'Explicá el presupuesto municipal aprobado' });
  assert.equal(plan.intent, 'budget_approved');
  assert.equal(plan.domain, 'budget');
  assert.equal(plan.resource, 'budgetapproved');
  assert.deepEqual(plan.resources, [{
    name: 'budgetapproved', mode: 'read_only', containsNominalData: false,
  }]);
  assert.equal(plan.externalPolicy, 'local_only');
  assert.equal(plan.privacy.rawUserMessageSentExternally, false);
});

test('un intent explícito tampoco puede cargar cifras para otro alcance presupuestario', async () => {
  for (const message of [
    'Presupuesto de obra 2026 según Ordenanza 1021/2025.',
    'Presupuesto de licitación 2026.',
    'Presupuesto del proyecto 2026.',
    'Presupuesto personal 2026.',
    'Presupuesto familiar 2026.',
    'Presupuesto del proveedor 2026.',
  ]) {
    let budgetCalls = 0;
    let externalCalls = 0;
    const res = await post(
      { intent: 'budget_approved', message },
      {
        budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); },
        fetch: async () => { externalCalls += 1; throw new Error('fetch inesperado'); },
      },
    );
    assert.equal(res.statusCode, 422, message);
    assert.equal(res.payload.data.code, 'BUDGET_SCOPE_UNAVAILABLE', message);
    assert.equal(budgetCalls, 0, message);
    assert.equal(externalCalls, 0, message);
  }
});

test('la consulta natural del presupuesto 2026 llega al recurso estático sin abrir Neon', async () => {
  let budgetCalls = 0;
  let sqlCalls = 0;
  const res = await post(
    { message: '¿Cuál es el presupuesto municipal aprobado para 2026?' },
    {
      budgetApproved: async () => {
        budgetCalls += 1;
        return budgetApproved();
      },
      getInternalSql: async () => {
        sqlCalls += 1;
        throw new Error('no debe abrir Neon');
      },
    },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(budgetCalls, 1);
  assert.equal(sqlCalls, 0);
  assert.equal(res.payload.intent, 'budget_approved');
  assert.equal(res.payload.queryPlan.resource, 'budgetapproved');
  assert.equal(res.payload.targetPath, '/presupuesto-control');
  assert.match(res.headers['Cache-Control'], /private, no-store/);
});

test('distingue el año de la Ordenanza 1021/2025 del ejercicio presupuestario 2026', async () => {
  for (const message of [
    'Explicame la Ordenanza 1021/2025',
    'Explicame la Ordenanza Municipal N° 1021/2025',
    'Explicame la Ordenanza número 1021/2025',
    'Explicame la Ord. 1021/2025',
    'Explicame la Ordenanza １．０２１／２０２５',
    'Explicame la Ordenanza ١٠٢١/٢٠٢٥',
    'Explicame la Ordenanza 1021/2025.',
    'Fuente: Ordenanza 1021/2025. Presupuesto municipal 2026',
    'Referencia: Ordenanza 1021/2025',
    'De acuerdo con la Ordenanza 1021/2025, ¿cuál es el presupuesto 2026?',
    'Presupuesto 2026. La fuente es la Ordenanza 1021/2025.',
    'Según Ordenanza 1021/2025 decime el presupuesto municipal 2026',
    'Presupuesto 2026 según la Ordenanza 1021/2025 decime el total',
  ]) {
    let budgetCalls = 0;
    const res = await post(
      { message },
      { budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); } },
    );

    assert.equal(res.statusCode, 200, message);
    assert.equal(res.payload.intent, 'budget_approved', message);
    assert.equal(res.payload.data.fiscalYear, 2026, message);
    assert.deepEqual(
      res.payload.queryPlan.filters,
      /presupuesto\s+municipal\s+2026|presupuesto\s+2026/i.test(message) ? { fiscalYear: 2026 } : {},
      message,
    );
    assert.equal(budgetCalls, 1, message);
  }
});

test('rechaza una referencia a 1021/2024 aunque la consulta también mencione el presupuesto 2026', async () => {
  for (const message of [
    'Explicame la Ordenanza 1021/2024 y el presupuesto municipal 2026',
    'Presupuesto 2026 según Ordenanza 1021-2024',
    'Presupuesto 2026 según Ordenanza 1021 del año 2024',
    'Presupuesto 2026 según Ordenanza 1021 año 2024',
  ]) {
    let budgetCalls = 0;
    const res = await post(
      { message },
      { budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); } },
    );

    assert.equal(res.statusCode, 422, message);
    assert.equal(res.payload.intent, 'budget_approved', message);
    assert.equal(res.payload.data.code, 'BUDGET_INSTRUMENT_YEAR_MISMATCH', message);
    assert.equal(res.payload.data.requestedInstrumentYear, 2024, message);
    assert.deepEqual(res.payload.data.availableInstrumentYears, [2025], message);
    assert.equal(budgetCalls, 0, message);
  }
});

test('rechaza cualquier otra ordenanza aunque la consulta también mencione presupuesto 2026', async () => {
  for (const [message, instrumentNumber] of [
    ['Explicame el presupuesto 2026 según la Ordenanza 21/2025', 21],
    ['Presupuesto municipal 2026 aprobado por Ordenanza 121/2025', 121],
    ['¿Qué dice la Ordenanza 021/2025 sobre el presupuesto 2026?', 21],
    ['Presupuesto 2026 según Ordenanza 000/2025', 0],
    ['Presupuesto 2026 según Ordenanza N° 000/2025', 0],
    ['Presupuesto 2026 según Ordenanza 1021/2025 y Ordenanza 21/2025', 21],
    ['Ordenanza 121/2025 y Ordenanza 1021/2025: presupuesto municipal 2026', 121],
    ['Presupuesto 2026 según la Ordenanza Municipal N° 21/2025', 21],
    ['Presupuesto 2026 según Ordenanza número 21/2025', 21],
    ['Presupuesto 2026 según Ordenanzas 21/2025 y 1021/2025', 21],
    ['Presupuesto 2026 según Ord. 21/2025', 21],
    ['Presupuesto 2026 según Ordenanzas 1021/2025 y la 21', 21],
    ['Presupuesto 2026 según Ordenanzas 1021/2025 o 21', 21],
    ['Presupuesto 2026 según Ordenanzas 1021/2025 y también la 21', 21],
    ['Presupuesto 2026 según Ordenanzas 1021/2025 además de la 21', 21],
    ['Presupuesto 2026 según Ordenanzas 1021/2025 y la 21 de 2026', 21],
    ['Presupuesto 2026 según Ordenanza ２１/２０２５', 21],
    ['Presupuesto 2026 según Ordenanza ٢١/٢٠٢٥', 21],
  ]) {
    let budgetCalls = 0;
    const res = await post(
      { message },
      { budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); } },
    );

    assert.equal(res.statusCode, 422, message);
    assert.equal(res.payload.intent, 'budget_approved', message);
    assert.equal(res.payload.data.code, 'BUDGET_INSTRUMENT_NUMBER_MISMATCH', message);
    assert.equal(res.payload.data.requestedInstrumentNumber, instrumentNumber, message);
    assert.deepEqual(res.payload.data.availableInstrumentNumbers, [1021], message);
    assert.equal(budgetCalls, 0, message);
  }
});

test('falla cerrado ante una referencia legal numérica que no puede interpretar', async () => {
  for (const message of [
    'Presupuesto 2026 según la Ordenanza municipal del expediente N° 21/2025',
    'Presupuesto 2026 según Ordenanza 1021/24',
    'Presupuesto 2026 según Ordenanza 1021/2024x',
    'Presupuesto 2026 según Ordenanza 1021/20250',
    'Presupuesto 2026 según Ordenanza 1021/2.024',
    'Presupuesto 2026 según Ordenanza 1021/2025.0',
    'Presupuesto 2026 según Ordenanza 1021/2025.1',
    'Presupuesto 2026 según Ordenanza 1021/2025-A',
    'Presupuesto 2026 según Ordenanza 1021/2025/1',
    'Presupuesto 2026 según Ordenanza 1021/2025/21',
    'Presupuesto 2026 según Ordenanza 1021/2025-1',
    'Presupuesto 2026 según Ordenanza 1021/2025 -A',
    'Presupuesto 2026 según Ordenanza 1021/2025 - A',
    'Presupuesto 2026 según Ordenanza 1021/2025 /21',
    'Presupuesto 2026 según Ordenanza 1021/2025 / 21',
    'Presupuesto 2026 según Ordenanza 1021/2025 .1',
    'Presupuesto 2026 según Ordenanza 1021/2025 . 1',
    'Presupuesto 2026 según Ordenanza 1021/2025 _A',
    'Presupuesto 2026 según Ordenanza 1021/2025 bis',
    'Presupuesto 2026 según Ordenanza 1021/2025 ter',
    'Presupuesto 2026 según Ordenanza 1021/2025 v2',
    'Presupuesto 2026 según Ordenanza 1021/2025 versión 2',
    'Presupuesto 2026 según Ordenanza 1021/2025, bis',
    'Presupuesto 2026 según Ordenanza 1021/2025, Anexo I',
    'Presupuesto 2026 según Ordenanza 1021/2025 (bis)',
    'Presupuesto 2026 según Ordenanza 1021/2025 (ter)',
    'Presupuesto 2026 según Ordenanza 1021/2025 (v2)',
    'Presupuesto 2026 según Ordenanza 1021/2025 (Anexo I)',
    'Presupuesto 2026 según Ordenanza 1021/2025 anexo A',
    'Presupuesto 2026 según Ordenanza: 21',
    'Presupuesto 2026 según Ordenanza «21»',
    'Presupuesto 2026 según Ordenanza (21)',
    'Presupuesto 2026 según Ordenanza #21',
    'Presupuesto 2026 según Ordenanza de Junín 21',
    'Presupuesto 2026 según Ordenanza 1021',
    'Presupuesto 2026 según Ordenanzas 1021/2025 y, además, la 21',
    'Presupuesto 2026 según Ordenanzas 1021/2025 así como la 21',
    'Presupuesto 2026 según Ordenanzas 1021/2025 junto a la 21',
    'Presupuesto 2026 según Ordenanzas 1021/2025 y (la 21)',
    'Ordenanzas 1021/2025? Presupuesto 2026 y la 21',
    `Presupuesto 2026 según Ordenanzas 1021/2025${' con antecedentes administrativos'.repeat(8)} y la 21`,
    'Presupuesto 2026 según Decreto 21/2026',
    'Presupuesto 2026 según Resolución Municipal 77/2026',
    'Presupuesto 2026 según Ley 5811',
  ]) {
    let budgetCalls = 0;
    const res = await post(
      { message },
      { budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); } },
    );

    assert.equal(res.statusCode, 422, message);
    assert.equal(res.payload.intent, 'budget_approved', message);
    assert.equal(res.payload.data.code, 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED', message);
    assert.deepEqual(res.payload.data.availableInstrumentReferences, ['1021/2025'], message);
    assert.equal(budgetCalls, 0, message);
  }
});

test('valida también las referencias legales recibidas como campos estructurados', async () => {
  for (const [body, code] of [
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentNumber: 21, instrumentYear: 2025 }, 'BUDGET_INSTRUMENT_NUMBER_MISMATCH'],
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentNumber: 0, instrumentYear: 2025 }, 'BUDGET_INSTRUMENT_NUMBER_MISMATCH'],
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentNumber: 1021, instrumentYear: 2024 }, 'BUDGET_INSTRUMENT_YEAR_MISMATCH'],
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentNumber: 1021 }, 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED'],
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentYear: 2025 }, 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED'],
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentType: 'decreto', instrumentNumber: 1021, instrumentYear: 2025 }, 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED'],
    [{ intent: 'budget_approved', fiscalYear: 2026, legalInstrument: { type: 'decreto', number: 21, year: 2026 } }, 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED'],
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentNumber: 'desconocida' }, 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED'],
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentReferenceUnparsed: 'true' }, 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED'],
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentNumber: [] }, 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED'],
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentNumber: [1021] }, 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED'],
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentYear: [] }, 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED'],
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentYear: [2025] }, 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED'],
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentNumber: null }, 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED'],
    [{ intent: 'budget_approved', fiscalYear: 2026, instrumentYear: true }, 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED'],
  ]) {
    let budgetCalls = 0;
    let externalCalls = 0;
    const res = await post(body, {
      budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); },
      fetch: async () => { externalCalls += 1; throw new Error('fetch inesperado'); },
    });

    assert.equal(res.statusCode, 422, JSON.stringify(body));
    assert.equal(res.payload.intent, 'budget_approved', JSON.stringify(body));
    assert.equal(res.payload.data.code, code, JSON.stringify(body));
    assert.equal(budgetCalls, 0, JSON.stringify(body));
    assert.equal(externalCalls, 0, JSON.stringify(body));
  }

  const valid = await post({
    intent: 'budget_approved', fiscalYear: 2026, instrumentNumber: 1021, instrumentYear: 2025,
  });
  assert.equal(valid.statusCode, 200);
  assert.deepEqual(valid.payload.queryPlan.filters, {
    fiscalYear: 2026, instrumentNumber: 1021, instrumentYear: 2025,
  });
});

test('valida el ejercicio estructurado sin coerciones ni sustituciones silenciosas', async () => {
  for (const [body, code] of [
    [{ intent: 'budget_approved', fiscalYear: [] }, 'BUDGET_FISCAL_YEAR_INVALID'],
    [{ intent: 'budget_approved', fiscalYear: 'desconocido' }, 'BUDGET_FISCAL_YEAR_INVALID'],
    [{ intent: 'budget_approved', fiscalYear: null }, 'BUDGET_FISCAL_YEAR_INVALID'],
    [{ intent: 'budget_approved', year: {} }, 'BUDGET_FISCAL_YEAR_INVALID'],
    [{ intent: 'budget_approved', year: [2026] }, 'BUDGET_FISCAL_YEAR_INVALID'],
    [{ intent: 'budget_approved', fiscalYear: 2026, year: 2025 }, 'BUDGET_FISCAL_YEAR_CONFLICT'],
    [{ intent: 'budget_approved', fiscalYear: 2026, message: 'presupuesto municipal aprobado para 2025' }, 'BUDGET_FISCAL_YEAR_CONFLICT'],
    [{ intent: 'budget_approved', year: 2026, message: 'presupuesto municipal aprobado para 2025' }, 'BUDGET_FISCAL_YEAR_CONFLICT'],
    [{ intent: 'budget_approved', fiscalYear: 2025, message: 'presupuesto municipal aprobado para 2026' }, 'BUDGET_FISCAL_YEAR_CONFLICT'],
    [{ intent: 'budget_approved', message: 'compará el presupuesto municipal 2025 y 2026' }, 'BUDGET_FISCAL_YEAR_CONFLICT'],
  ]) {
    let budgetCalls = 0;
    let externalCalls = 0;
    const res = await post(body, {
      budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); },
      fetch: async () => { externalCalls += 1; throw new Error('fetch inesperado'); },
    });

    assert.equal(res.statusCode, 422, JSON.stringify(body));
    assert.equal(res.payload.intent, 'budget_approved', JSON.stringify(body));
    assert.equal(res.payload.data.code, code, JSON.stringify(body));
    assert.equal(budgetCalls, 0, JSON.stringify(body));
    assert.equal(externalCalls, 0, JSON.stringify(body));
  }

  const valid = await post({ intent: 'budget_approved', fiscalYear: '2026' });
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.payload.queryPlan.filters.fiscalYear, 2026);
});

test('no sustituye silenciosamente otro ejercicio por el presupuesto 2026', async () => {
  for (const [message, requestedFiscalYear] of [
    ['¿Cuál fue el presupuesto municipal aprobado para 2025?', 2025],
    ['Presupuesto municipal para el 2025', 2025],
    ['Presupuesto municipal correspondiente a 2025', 2025],
    ['Presupuesto municipal correspondiente al 2025', 2025],
    ['Presupuesto municipal vigente en 2025', 2025],
    ['Presupuesto municipal del período 2025', 2025],
    ['Presupuesto municipal del ejercicio fiscal 2025', 2025],
    ['Presupuesto municipal para el 2.025', 2025],
    ['Presupuesto municipal para el 2,025', 2025],
    ['Presupuesto municipal para el 2 025', 2025],
    ['Presupuesto municipal dos mil veinticinco', 2025],
    ['Presupuesto municipal veinticinco', 2025],
    ['Presupuesto municipal del veinticinco', 2025],
    ['Presupuesto del ejercicio veinticinco', 2025],
    ['Presupuesto: 2025 según Ordenanza 1021/2025', 2025],
    ['Ejercicio: 2025; Ordenanza 1021/2025', 2025],
    ['Presupuesto municipal aprobado para el ejercicio 2100 según Ordenanza 1021/2025', 2100],
    ['Presupuesto municipal aprobado para 2200 según Ordenanza 1021/2025', 2200],
    ['Presupuesto municipal aprobado para 1899 según Ordenanza 1021/2025', 1899],
    ['Presupuesto municipal aprobado para 2.025 según Ordenanza 1021/2025', 2025],
    ['Presupuesto municipal aprobado para ２０２５ según Ordenanza 1021/2025', 2025],
    ['Presupuesto municipal aprobado para ٢٠٢٥ según Ordenanza 1021/2025', 2025],
  ]) {
    let budgetCalls = 0;
    const res = await post(
      { message },
      { budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); } },
    );

    assert.equal(res.statusCode, 422, message);
    assert.equal(res.payload.intent, 'budget_approved', message);
    assert.equal(res.payload.data.code, 'BUDGET_FISCAL_YEAR_UNAVAILABLE', message);
    assert.equal(res.payload.data.requestedFiscalYear, requestedFiscalYear, message);
    assert.deepEqual(res.payload.data.availableFiscalYears, [2026], message);
    assert.equal(budgetCalls, 0, message);
  }
});

test('rechaza ejercicios explícitos malformados en vez de usar silenciosamente 2026', async () => {
  for (const message of [
    'Presupuesto para 20250',
    'Presupuesto para 02025',
    'Presupuesto para 25',
    'Presupuesto ejercicio 20250',
    'Presupuesto 2.0250',
    'Presupuesto del ejercicio 999',
    'Presupuesto municipal dos mil veinticuatro',
    'Presupuesto municipal dos mil veintisiete',
  ]) {
    let budgetCalls = 0;
    const res = await post(
      { message },
      { budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); } },
    );

    assert.equal(res.statusCode, 422, message);
    assert.equal(res.payload.intent, 'budget_approved', message);
    assert.equal(res.payload.data.code, 'BUDGET_FISCAL_YEAR_INVALID', message);
    assert.equal(budgetCalls, 0, message);
  }

  for (const requestedFiscalYear of [0, 1799, 3000, 9999]) {
    let budgetCalls = 0;
    const message = `Presupuesto del ejercicio ${String(requestedFiscalYear).padStart(4, '0')} según Ordenanza 1021/2025`;
    const res = await post(
      { message },
      { budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); } },
    );
    assert.equal(res.statusCode, 422, message);
    assert.equal(res.payload.intent, 'budget_approved', message);
    assert.equal(budgetCalls, 0, message);
  }

  const validWording = await post({ message: 'Presupuesto según Ordenanza 1021/2025 para 2026' });
  assert.equal(validWording.statusCode, 200);
  assert.equal(validWording.payload.data.fiscalYear, 2026);
  const validSpelling = await post({ message: 'Presupuesto municipal dos mil veintiséis' });
  assert.equal(validSpelling.statusCode, 200);
  assert.equal(validSpelling.payload.data.fiscalYear, 2026);
  const validShortSpelling = await post({ message: 'Presupuesto municipal del veintiséis' });
  assert.equal(validShortSpelling.statusCode, 200);
  assert.equal(validShortSpelling.payload.data.fiscalYear, 2026);
});

test('falla cerrado ante citas legales globales, abreviadas o Unicode no homologadas', async () => {
  for (const message of [
    'Presupuesto 2026: la 21 y la Ordenanza 1021/2025',
    'Presupuesto 2026 según la 21/2025',
    'Presupuesto 2026 conforme a 21/2025',
    'Presupuesto 2026 fuente 21/2025',
    'Según 21/2025 y Ordenanza 1021/2025, presupuesto 2026',
    'Presupuesto 2026 según Dto. 21/2026',
    'Presupuesto 2026 según Dcto. 21/2026',
    'Presupuesto 2026 según Dec. 21/2026',
    'Presupuesto 2026 según Res. 77/2026',
    'Presupuesto 2026 según Resol. 77/2026',
    'Presupuesto 2026 según Disposición 8/2026',
    'Presupuesto 2026 según Norma 21/2026',
    'Presupuesto 2026 según Acto 8',
    'Presupuesto 2026 según Edicto 8',
    'Presupuesto 2026 según el instrumento 21',
    'Presupuesto 2026 según el expediente 21',
    'Presupuesto 2026 según el reglamento 21',
    'Presupuesto municipal 2026 según Anexo 8',
    'Presupuesto municipal 2026 según Acta 8',
    'Presupuesto municipal 2026 según Convenio 8',
    'Presupuesto municipal 2026 según Nota 8',
    'Presupuesto municipal 2026 según Informe 8',
    'Presupuesto municipal 2026 según Dictamen 8',
    'Presupuesto municipal 2026 según Pliego 8',
    'Presupuesto municipal 2026 según Resoluc. 8',
    'Presupuesto 2026 según Dtos. 21',
    'Presupuesto 2026 según Dctos. 21',
    'Presupuesto 2026 según Decs. 21',
    'Presupuesto 2026 según Decr. 21',
    'Presupuesto 2026 según Resols. 21',
    'Presupuesto 2026 según Disps. 21',
    'Presupuesto 2026 según Disp. 8',
    'Presupuesto 2026 según Circular 8',
    'Presupuesto 2026 según Acuerdo 8',
    'Presupuesto 2026 según Ordza. 21',
    'Presupuesto 2026 fuente: 21',
    'Presupuesto 2026 source 21',
    'Presupuesto 2026 origen 21',
    'Presupuesto 2026 documento 21',
    'Presupuesto 2026 ref. 21',
    'Presupuesto 2026 referencia: 21 de 2026',
    'Presupuesto 2026 de acuerdo con 21',
    'Presupuesto 2026 aprobado por 21',
    'Presupuesto 2026 fuente: 21⁄2026',
    'Presupuesto 2026 fuente: 21∕2026',
    'Presupuesto 2026 fuente: 21–2026',
    'Presupuesto 2026 según Ordenanza २१/२०२५',
    'Presupuesto 2026 según Ordenanza ২১/২০২৫',
    'Presupuesto 2026 según Ordenanza ๒๑/๒๐๒๕',
    'Presupuesto 2026 según Ordenanza veintiuno',
    'Presupuesto 2026 según Ordenanzа 21/2025',
    'Presupuesto 2026 según Οrdenanza 21/2025',
    'Presupuesto 2026 según Оrdenanza 21/2025',
    'Presupuesto 2026 según Ordenan\u200Bza 21/2025',
    'Presupuesto 2026 según Ordenan\u200Eza 21',
    'Presupuesto 2026 según Ordenan\u200Fza 21',
    'Presupuesto 2026 según Ordenan\u00ADza 21',
    'Presupuesto 2026 según Ordenan\u2066za 21',
    'Presupuesto 2026 según 0rdenanza 21',
    'Presupuesto 2026 según Ordenanz@ 21',
  ]) {
    let budgetCalls = 0;
    const res = await post(
      { message },
      { budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); } },
    );

    assert.equal(res.statusCode, 422, message);
    assert.equal(res.payload.intent, 'budget_approved', message);
    assert.equal(budgetCalls, 0, message);
  }
});

test('detecta ejercicios presupuestarios comparados en cualquier redacción', async () => {
  for (const message of [
    'presupuesto 2026/2025',
    'presupuesto 2026-2025',
    'presupuesto 2026 y el 2025',
    'presupuesto 2026 versus 2025',
    'presupuesto 2026 contra 2025',
    'compará el presupuesto de 2026 con 2025',
    'presupuesto entre 2026 y 2025',
    'compará presupuestos 2025 y 2026',
  ]) {
    let budgetCalls = 0;
    const res = await post(
      { message },
      { budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); } },
    );

    assert.equal(res.statusCode, 422, message);
    assert.equal(res.payload.intent, 'budget_approved', message);
    assert.equal(budgetCalls, 0, message);
  }
});

test('detecta todos los ejercicios escritos en palabras antes de publicar cifras', async () => {
  for (const message of [
    'Presupuesto dos mil veinticinco versus dos mil veintiséis',
    'Compará el presupuesto dos mil veintiséis con dos mil veinticinco',
    'Presupuesto veinticinco versus veintiséis',
  ]) {
    let budgetCalls = 0;
    const res = await post(
      { message },
      { budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); } },
    );
    assert.equal(res.statusCode, 422, message);
    assert.equal(res.payload.intent, 'budget_approved', message);
    assert.equal(res.payload.data.code, 'BUDGET_FISCAL_YEAR_CONFLICT', message);
    assert.equal(budgetCalls, 0, message);
  }
});

test('responde con los importes oficiales exactos y bloquea toda lectura de ejecución o desvíos', async () => {
  const res = await post({ intent: 'budget_approved' });
  const expectedAnswer = `La Ordenanza 1021/2025 fija para 2026 un gasto aprobado de ${ars('31854092000.00')}, con recursos estimados por ${ars('27700964239.13')} y financiamiento estimado por ${ars('4153127760.87')}. Recursos más financiamiento reconcilian exactamente con el gasto, al igual que las dos jurisdicciones publicadas. Son pesos nominales aprobados: la fuente no contiene modificaciones, compromiso, devengado ni pagado, por lo que no corresponde calcular ejecución, porcentajes ni desvíos.`;

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.mode, 'deterministic');
  assert.equal(res.payload.answer, expectedAnswer);
  assert.equal(res.payload.asOf, '2025-12-26');
  assert.equal(res.payload.data.fiscalYear, 2026);
  assert.deepEqual(res.payload.data.currency, { code: 'ARS', basis: 'nominal' });
  assert.deepEqual(res.payload.data.approved, {
    expenditures: '31854092000.00',
    resources: '27700964239.13',
    financing: '4153127760.87',
    jurisdictions: [
      { code: '01', label: 'Departamento Ejecutivo', amount: '30879342000.00' },
      { code: '02', label: 'Honorable Concejo Deliberante', amount: '974750000.00' },
    ],
  });
  assert.deepEqual(res.payload.data.reconciliations, { funding: true, jurisdictions: true });
  assert.deepEqual(res.payload.data.execution, { available: false, status: 'source_not_loaded' });
  assert.deepEqual(res.payload.data.methodology, {
    grain: 'approved_initial_budget',
    executionLoaded: false,
    annexBreakdownAvailable: false,
  });
  assert.equal(res.payload.sources[0].system, 'HCD Junín');
  assert.equal(res.payload.sources[0].relation, 'Ordenanza 1021/2025');
  assert.equal(res.payload.sources[0].authority, 'approved_municipal_budget');
  assert.equal(res.payload.provider.status, 'not_requested');
  assert.equal(Object.hasOwn(res.payload.data.execution, 'executionRate'), false);
  assert.equal(Object.hasOwn(res.payload.data.execution, 'variance'), false);
});

test('rechaza mensajes no textuales o truncables antes de planificar y cargar cifras', async () => {
  const longMessage = `Presupuesto 2026 ${'texto '.repeat(220)} Ordenanza 21/2025`;
  for (const message of [
    ['Presupuesto 2026 según Ordenanza 21/2025'],
    { text: 'Presupuesto 2026 según Ordenanza 21/2025' },
    2025,
    true,
    longMessage,
  ]) {
    let budgetCalls = 0;
    let externalCalls = 0;
    const res = await post(
      { intent: 'budget_approved', fiscalYear: 2026, message },
      {
        budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); },
        fetch: async () => { externalCalls += 1; throw new Error('fetch inesperado'); },
      },
    );

    assert.ok([413, 422].includes(res.statusCode), JSON.stringify(message).slice(0, 120));
    assert.ok(['ASSISTANT_MESSAGE_INVALID', 'ASSISTANT_MESSAGE_TOO_LONG'].includes(res.payload.code));
    assert.equal(budgetCalls, 0);
    assert.equal(externalCalls, 0);
  }
});

test('el presupuesto es determinístico y nunca externaliza cifras a OpenAI ni Hugging Face', async () => {
  let externalCalls = 0;
  const rawMessage = 'Presupuesto para Marcelo Secreto, DNI 33123456, legajo 7788';
  const res = await post(
    { intent: 'budget_approved', message: rawMessage, enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_budget_test', HF_TOKEN: 'hf_budget_test' },
      fetch: async () => { externalCalls += 1; throw new Error('no debe externalizar presupuesto'); },
    },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(externalCalls, 0);
  assert.equal(res.payload.provider.provider, 'local');
  assert.equal(res.payload.provider.status, 'not_allowed_for_nominal_or_unknown_intent');
  assert.equal(res.payload.provider.externalProviderAttempted, false);
  assert.equal(res.payload.provider.externalProviderUsed, false);
  assert.equal(res.payload.insight, null);
  assert.equal(res.payload.queryPlan.externalPolicy, 'local_only');
  assert.equal(res.payload.privacy.localOnlyResource, true);
  assert.equal(res.payload.privacy.rawUserMessageSentExternally, false);
  assert.equal(res.payload.data.execution.available, false);
  assert.equal(Object.hasOwn(res.payload.data.execution, 'executionRate'), false);
  assert.equal(Object.hasOwn(res.payload.data.execution, 'variance'), false);
});

test('falla cerrado cuando la fuente oficial o el contrato decimal no superan validación', async () => {
  let sqlCalls = 0;
  const sourceFailure = await post(
    { intent: 'budget_approved' },
    {
      budgetApproved: async () => ({
        status: 503,
        payload: {
          ok: false,
          code: 'BUDGET_SOURCE_INVALID',
          error: 'La fuente oficial del presupuesto aprobado no superó la validación de integridad.',
        },
      }),
      getInternalSql: async () => { sqlCalls += 1; throw new Error('no debe abrir Neon'); },
    },
  );
  assert.equal(sourceFailure.statusCode, 503);
  assert.equal(sourceFailure.payload.data.code, 'BUDGET_SOURCE_INVALID');
  assert.equal(sourceFailure.payload.targetPath, '/presupuesto-control');
  assert.equal(sourceFailure.payload.sources[0].system, 'HCD Junín');

  const contractFailure = await post(
    { intent: 'budget_approved' },
    {
      budgetApproved: async () => ({
        status: 200,
        payload: {
          ok: true,
          data: {
            fiscalYear: 2026,
            approved: { expenditures: 31854092000, resources: '27700964239.13', financing: '4153127760.87' },
            source: { cutoff: '2025-12-26' },
          },
        },
      }),
    },
  );
  assert.equal(contractFailure.statusCode, 503);
  assert.equal(contractFailure.payload.data.code, 'BUDGET_APPROVED_INVALID');
  assert.equal(sqlCalls, 0);
});

test('GET publica budget_approved como recurso determinístico local', async () => {
  let sqlCalls = 0;
  const res = responseRecorder();
  await endpoint({
    getInternalSql: async () => { sqlCalls += 1; throw new Error('no debe abrir Neon'); },
  })({ method: 'GET', headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(sqlCalls, 0);
  const capability = res.payload.capabilities.find((item) => item.intent === 'budget_approved');
  assert.deepEqual(capability, {
    intent: 'budget_approved', externalEnhancement: false, resource: 'budgetapproved',
  });
  assert.equal(res.payload.privacy.rawUserMessageSentExternally, false);
});

test('la interfaz incorpora presupuesto en acceso rápido, contexto, resultados, sugerencias y tema', async () => {
  const html = await readFile(new URL('../asistente.html', import.meta.url), 'utf8');

  assert.match(html, /data-prompt="[^"]*presupuesto municipal aprobado[^"]*"[^>]*>[\s\S]*?<span>Presupuesto 2026<\/span>/i);
  assert.match(html, /option value="budget_approved">Presupuesto aprobado<\/option>/);
  assert.match(html, /budget_approved:\s*'budget'/);
  assert.match(html, /presupuesto:\s*'budget_approved'/);
  assert.match(html, /budget:\s*'presupuesto(?: aprobado)?'/);
  assert.match(html, /budgetapproved:\s*'presupuesto aprobado 2026'/);
  assert.ok((html.match(/intent === 'budget_approved'/g) || []).length >= 3);
  assert.match(html, /Presupuesto aprobado 2026/);
  assert.match(html, /Gasto aprobado/);
  assert.match(html, /Recursos estimados/);
  assert.match(html, /Financiamiento estimado/);
  assert.match(html, /Explicar la (?:re)?conciliación/);
  assert.match(html, /Qué falta para medir ejecución/i);
  assert.match(html, /Abrir comparaci(?:ó|o)n de gestiones/);
  assert.match(html, /budget_approved:\s*'Presupuesto aprobado 2026'/);
});
