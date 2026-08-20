/**
 * Fuente canonica del Presupuesto municipal de Junin para el ejercicio 2026.
 *
 * El contrato conserva exclusivamente cifras visibles y verificadas en las
 * nueve paginas de la Ordenanza 1.021/2025. El archivo oficial remite a
 * planillas anexas que no estan incluidas en el PDF descargado: por eso estos
 * desgloses no deben tratarse como una apertura economica exhaustiva ni como
 * ejecucion presupuestaria.
 *
 * Los importes se codifican como strings decimales canonicos con dos
 * posiciones para evitar perdida de precision binaria en browser y Node.
 */

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export const JUNIN_BUDGET_2026 = deepFreeze({
  version: 'junin-approved-budget-2026.ordinance-1021-2025.v1',
  source: {
    id: 'hcd-junin-ordenanza-1021-2025',
    authority: 'Honorable Concejo Deliberante de Junin, Mendoza',
    instrumentType: 'municipal_ordinance',
    instrumentNumber: '1.021/2025',
    normalizedInstrumentNumber: '1021/2025',
    title: 'Calculo de Recursos, Financiamiento y Presupuesto de Gastos 2026',
    approvalDate: '2025-12-26',
    fiscalYear: 2026,
    url: 'https://hcdjunin.gob.ar/digesto/pdfs/ordenanzas/2025/Ord251021_Presupuesto_26.pdf',
    file: {
      pageCount: 9,
      byteLength: 287288,
      sha256: 'd362c07aefae0b0834e90d758f53073b507649de8cbd931e14f6b4e6c580ceaf',
      annexSheetsPresent: false,
    },
    retrievedAt: '2026-08-20',
    verifiedAt: '2026-08-20',
    verification: ['layout_text_extraction', 'visual_review_all_9_pages', 'exact_decimal_reconciliation'],
  },
  measurement: {
    grain: 'approved_budget_ordinance_visible_article',
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    asOfDate: '2025-12-26',
    currency: 'ARS',
    priceBasis: 'nominal',
    amountEncoding: 'canonical_decimal_string_2dp',
    status: 'approved_budget_only',
    executionStatus: 'source_not_loaded',
    modificationStatus: 'source_not_loaded',
  },
  totals: {
    approvedExpenditures: '31854092000.00',
    estimatedResources: '27700964239.13',
    estimatedFinancing: '4153127760.87',
  },
  expenseByJurisdiction: {
    coverage: 'complete_articles_4_and_5',
    items: [
      {
        code: '01',
        label: 'Departamento Ejecutivo',
        amount: '30879342000.00',
        article: '4',
      },
      {
        code: '02',
        label: 'Honorable Concejo Deliberante',
        amount: '974750000.00',
        article: '5',
      },
    ],
    listedTotal: '31854092000.00',
  },
  capitalAppropriations: {
    coverage: 'complete_explicit_amounts_article_15_not_annex_detail',
    items: [
      {
        code: 'capital_goods',
        label: 'Adquisicion de bienes de capital',
        amount: '1000000000.00',
        article: '15',
      },
      {
        code: 'municipal_public_works_plan',
        label: 'Plan de Obras Publicas Municipales 2026',
        amount: '3170000000.00',
        article: '15',
      },
    ],
    listedTotal: '4170000000.00',
  },
  capitalTransfers: {
    coverage: 'complete_article_17_items_a_to_i_not_annex_detail',
    items: [
      {
        code: 'popular_libraries',
        label: 'Infraestructura de Bibliotecas Populares',
        amount: '3000000.00',
        article: '17.a',
      },
      {
        code: 'department_clubs',
        label: 'Infraestructura de clubes del Departamento',
        amount: '5000000.00',
        article: '17.b',
      },
      {
        code: 'nonprofit_organizations',
        label: 'Infraestructura de organizaciones sin fines de lucro',
        amount: '5000000.00',
        article: '17.c',
      },
      {
        code: 'social_emergency_housing',
        label: 'Construccion, terminacion y ampliacion de viviendas de emergencia social',
        amount: '80000000.00',
        article: '17.d',
      },
      {
        code: 'retiree_centers',
        label: 'Infraestructura de centros de jubilados del Departamento',
        amount: '30000000.00',
        article: '17.e',
      },
      {
        code: 'neighbor_utility_networks',
        label: 'Redes de gas, agua y cloacas ejecutadas por vecinos',
        amount: '8000000.00',
        article: '17.f',
      },
      {
        code: 'orfila_historic_site',
        label: 'Restauracion del Solar Historico de Orfila',
        amount: '100000000.00',
        article: '17.g',
      },
      {
        code: 'education_fund',
        label: 'Fondo Educativo',
        amount: '770000000.00',
        article: '17.h',
      },
      {
        code: 'intermunicipal_cdf_module_ii',
        label: 'Convenio Intermunicipal Const. Modulo II CDF',
        amount: '35000000.00',
        article: '17.i',
      },
    ],
    listedTotal: '1036000000.00',
  },
  otherExplicitAppropriations: {
    coverage: 'explicit_amount_article_21_only',
    items: [
      {
        code: 'municipal_judgments',
        label: 'Pago de juicios contra el Municipio',
        amount: '40000000.00',
        article: '21',
      },
    ],
    listedTotal: '40000000.00',
  },
  staffingEstablishment: {
    coverage: 'visible_article_7_counts_not_annex_detail',
    additive: false,
    reasonNotAdditive: 'El articulo mezcla cargos, personal contratado y horas catedra en unidades distintas.',
    departmentExecutive: [
      { code: 'superior_staff', label: 'Planta de personal superior', quantity: 25, unit: 'position', article: '7.a.1' },
      { code: 'permanent_staff', label: 'Planta de personal permanente', quantity: 385, unit: 'position', article: '7.a.2' },
      { code: 'permanent_teaching_position', label: 'Cargo de horas catedra de planta permanente', quantity: 1, unit: 'position', declaredTeachingHoursPerPosition: 18, article: '7.a.3' },
      { code: 'temporary_staff', label: 'Planta de personal temporaria', quantity: 169, unit: 'position', article: '7.a.4' },
      { code: 'sports_temporary_teaching_hours', label: 'Horas catedra temporarias de Deportes', quantity: 435, unit: 'teaching_hour', article: '7.a.5' },
      { code: 'culture_temporary_teaching_hours', label: 'Horas catedra temporarias de Cultura', quantity: 290, unit: 'teaching_hour', article: '7.a.6' },
      { code: 'seos_contract_teachers', label: 'Personal contratado docente de jardines maternales (SEOS)', quantity: 101, unit: 'contracted_staff', article: '7.a.7' },
      { code: 'seos_maternal_teaching_hours', label: 'Horas catedra de jardines maternales (SEOS)', quantity: 24, unit: 'teaching_hour', article: '7.a.8' },
    ],
    deliberativeCouncil: [
      { code: 'superior_authorities', label: 'Autoridades superiores', quantity: 12, unit: 'position', article: '7.b.1' },
      { code: 'non_ranked_staff', label: 'Personal no escalafonado o fuera de nivel', quantity: 10, unit: 'position', article: '7.b.2' },
      { code: 'permanent_staff', label: 'Planta permanente', quantity: 3, unit: 'position', article: '7.b.3' },
    ],
  },
  reconciliations: [
    {
      id: 'funding_equation',
      expression: 'estimatedResources + estimatedFinancing = approvedExpenditures',
      expected: '31854092000.00',
      status: 'reconciled_exact',
      articles: ['1', '2', '3'],
    },
    {
      id: 'jurisdiction_total',
      expression: 'Departamento Ejecutivo + Honorable Concejo Deliberante = approvedExpenditures',
      expected: '31854092000.00',
      status: 'reconciled_exact',
      articles: ['1', '4', '5'],
    },
    {
      id: 'article_15_listed_total',
      expression: 'Bienes de capital + Plan de Obras Publicas = listedTotal',
      expected: '4170000000.00',
      status: 'reconciled_exact',
      articles: ['15'],
    },
    {
      id: 'article_17_listed_total',
      expression: 'Suma de los incisos a-i = listedTotal',
      expected: '1036000000.00',
      status: 'reconciled_exact',
      articles: ['17.a', '17.b', '17.c', '17.d', '17.e', '17.f', '17.g', '17.h', '17.i'],
    },
  ],
  limits: [
    'El PDF oficial descargado tiene 9 paginas y remite a planillas anexas que no estan incluidas en ese archivo.',
    'La fuente contiene presupuesto aprobado, recursos estimados y financiamiento estimado; no contiene ejecucion, modificaciones posteriores, compromiso, devengado ni pagado.',
    'Los desgloses de los articulos 15, 17 y 21 son cifras expresamente visibles, no una clasificacion economica ni por objeto del gasto exhaustiva.',
    'Los importes son pesos argentinos nominales del ejercicio 2026 y no estan ajustados por inflacion.',
    'La planta visible mezcla unidades heterogeneas y no debe sumarse como una unica cantidad de empleados.',
    'La autorizacion para modificar partidas no prueba que una modificacion se haya producido; toda variacion requiere su instrumento y fuente oficial.',
  ],
});
