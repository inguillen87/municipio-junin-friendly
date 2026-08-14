/**
 * Contrato normativo verificable para el Titulo VI de la Ley 5811 (Mendoza).
 *
 * Este archivo es deliberadamente browser-safe: lo consumen la API, la UI y
 * las pruebas sin depender de Node, secretos ni una base de datos. No reemplaza
 * el perfil de aplicabilidad municipal que deben aprobar RRHH y Asesoria
 * Letrada de Junin.
 */

export const TITLE_VI_CATALOG_VERSION = 'mendoza-ley-5811-title-vi.v1';
export const TITLE_VI_VERIFIED_AT = '2026-08-14';

export const TITLE_VI_SOURCES = Object.freeze([
  Object.freeze({
    id: 'ley-5811-consolidada',
    label: 'Ley 5811 - texto consolidado vigente',
    authority: 'Argentina.gob.ar - normativa provincial',
    url: 'https://www.argentina.gob.ar/normativa/provincial/ley-5811-123456789-0abc-defg-118-5000mvorpyel/actualizacion',
    scope: 'Titulo VI, articulos 36 a 72',
    status: 'official_current_consolidation',
  }),
  Object.freeze({
    id: 'decreto-727-1993',
    label: 'Decreto 727/1993 - reglamentacion provincial',
    authority: 'Poder Judicial de Mendoza',
    url: 'https://jusmendoza.gob.ar/wp-content/uploads/2026/03/Decreto-Ley-727-de-1993-Decreto-Reglamentario-del-la-ley-5811.pdf',
    scope: 'Procedimientos y acreditacion para la Administracion provincial',
    status: 'official_requires_municipal_adoption_check',
  }),
  Object.freeze({
    id: 'ley-9324-2021',
    label: 'Ley 9324 - modificaciones de proteccion familiar',
    authority: 'Boletin Oficial de Mendoza',
    url: 'https://boe.mendoza.gov.ar/publico/verpdf/31391',
    scope: 'Maternidad, persona no gestante y adopcion',
    status: 'official_amendment',
  }),
  Object.freeze({
    id: 'ley-9550-2024',
    label: 'Ley 9550 - modificaciones a los articulos 49 y 52',
    authority: 'Boletin Oficial de Mendoza',
    url: 'https://boe.mendoza.gov.ar/default/public/publico/verpdf/32131',
    scope: 'Reserva de empleo y licencia sin goce por razones particulares',
    status: 'official_amendment',
  }),
  Object.freeze({
    id: 'ley-5892-estatuto-municipal',
    label: 'Ley 5892 - Estatuto Escalafon para el personal municipal',
    authority: 'Poder Judicial de Mendoza',
    url: 'https://wwwjuri.jus.mendoza.gov.ar/legislacion/ley005892.php',
    scope: 'Ambito municipal, licencias provinciales y exclusiones por categoria',
    status: 'official_current_reference',
  }),
  Object.freeze({
    id: 'ordenanza-junin-1021-2025',
    label: 'Ordenanza 1021/2025 - Presupuesto municipal 2026',
    authority: 'Honorable Concejo Deliberante de Junin',
    url: 'https://hcdjunin.gob.ar/digesto/pdfs/ordenanzas/2025/Ord251021_Presupuesto_26.pdf',
    scope: 'Aplicacion local para 2026 y extension limitada a autoridades superiores',
    status: 'official_local_2026_evidence_not_complete_profile',
  }),
  Object.freeze({
    id: 'ley-9681-2025',
    label: 'Ley 9681 - Presupuesto provincial 2026',
    authority: 'Gobierno de Mendoza',
    url: 'https://mza-dicaws-portal-uploads-media-prod.s3.amazonaws.com/informacion-oficial/uploads/sites/11/2026/01/LEY-PRESUPUESTO-2026-No-9681-CON-ANEXOS-1-y-2.pdf',
    scope: 'Derogacion del articulo 44 de la Ley 5811',
    status: 'official_amendment',
  }),
]);

export const TITLE_VI_PROVISIONS = Object.freeze([
  Object.freeze({
    id: 'annual-ordinary',
    article: '37 y 38',
    label: 'Licencia anual ordinaria',
    automation: 'conditional',
    unit: 'calendar_day',
    summary: 'La escala se determina por antiguedad al 31 de diciembre. Si no se alcanzan seis meses, corresponde un dia por cada veinte dias efectivamente trabajados.',
    requiredFacts: Object.freeze(['recognizedSeniority', 'effectiveDaysWorkedForShortService', 'municipalApplicabilityProfile', 'approvedUsageAndCarryover']),
  }),
  Object.freeze({
    id: 'health',
    article: '40 a 49',
    label: 'Razones de salud y régimen de accidentes laborales',
    automation: 'human_validation_required',
    unit: 'calendar_day',
    summary: 'Los plazos por salud dependen de antiguedad, cargas de familia, recurrencia y control medico. El articulo 44 fue derogado: un accidente laboral debe tratarse por el regimen ART vigente, nunca por el texto historico.',
    requiredFacts: Object.freeze(['medicalEvidence', 'medicalAuthorityDecision', 'recognizedSeniority', 'familyChargeStatus', 'recurrenceAssessment', 'municipalApplicabilityProfile']),
  }),
  Object.freeze({
    id: 'special',
    article: '50',
    label: 'Licencias especiales',
    automation: 'mixed',
    unit: 'rule_specific',
    summary: 'Incluye supuestos como matrimonio, fallecimiento, examenes, donacion de sangre y cuidado de familiares; cada inciso exige evidencia propia.',
    requiredFacts: Object.freeze(['eventEvidence', 'relationshipEvidenceWhenApplicable', 'municipalApplicabilityProfile']),
  }),
  Object.freeze({
    id: 'gender-violence',
    article: '50 bis',
    label: 'Proteccion por violencia de genero',
    automation: 'restricted_human_validation',
    unit: 'case_specific',
    summary: 'Materia sensible: no se publica en rankings nominales ni se envia a proveedores externos.',
    requiredFacts: Object.freeze(['restrictedEvidence', 'authorizedDecision', 'municipalApplicabilityProfile']),
  }),
  Object.freeze({
    id: 'unpaid-personal',
    article: '52',
    label: 'Razones particulares sin goce de haberes',
    automation: 'human_validation_required',
    unit: 'case_specific',
    summary: 'La procedencia y el plazo requieren verificar la redaccion vigente, la situacion de revista y la decision administrativa.',
    requiredFacts: Object.freeze(['employmentStatus', 'serviceFeasibility', 'authorizedDecision', 'municipalApplicabilityProfile']),
  }),
  Object.freeze({
    id: 'family-protection',
    article: '54 y siguientes',
    label: 'Maternidad, persona no gestante, lactancia y adopcion',
    automation: 'human_validation_required',
    unit: 'rule_specific',
    summary: 'Regimen modificado por la Ley 9324; requiere version normativa y hechos acreditados del caso.',
    requiredFacts: Object.freeze(['eventEvidence', 'applicableProvisionVersion', 'authorizedDecision', 'municipalApplicabilityProfile']),
  }),
  Object.freeze({
    id: 'attendance',
    article: '65',
    label: 'Inasistencias y tardanzas',
    automation: 'not_calculable_with_current_grh',
    unit: 'schedule_dependent',
    summary: 'No se calculan tardanzas, presentismo ni horas trabajadas sin turnos vigentes, fichadas actuales y calendario homologado.',
    requiredFacts: Object.freeze(['workScheduleAssignment', 'currentTimeClockRecords', 'holidayCalendar', 'municipalRuleProfile']),
  }),
]);

export const ANNUAL_LEAVE_TIERS = Object.freeze([
  Object.freeze({ minExclusiveYears: 0.5, maxInclusiveYears: 5, days: 14, article: '37.a' }),
  Object.freeze({ minExclusiveYears: 5, maxInclusiveYears: 10, days: 21, article: '37.b' }),
  Object.freeze({ minExclusiveYears: 10, maxInclusiveYears: 20, days: 28, article: '37.c' }),
  Object.freeze({ minExclusiveYears: 20, maxInclusiveYears: null, days: 35, article: '37.d' }),
]);

export const TITLE_VI_KEY_RULES = Object.freeze([
  Object.freeze({ id: 'annual-window', article: '38.1-6', label: 'Ventana de licencia anual', value: '1 de diciembre a 30 de abril; aviso con 30 dias', status: 'conditional', unit: 'calendar_window', manualGate: 'necesidad_del_servicio_y_regla_local' }),
  Object.freeze({ id: 'annual-carryover', article: '39', label: 'Acumulacion anual', value: 'Hasta un tercio del periodo inmediato anterior mediante acuerdo escrito', status: 'conditional', unit: 'calendar_day', manualGate: 'acuerdo_escrito_y_ledger' }),
  Object.freeze({ id: 'health-under-5-no-family', article: '40', label: 'Salud, menos de 5 anos, sin cargas', value: 3, status: 'conditional', unit: 'month', manualGate: 'control_medico' }),
  Object.freeze({ id: 'health-under-5-family', article: '40', label: 'Salud, menos de 5 anos, con cargas', value: 6, status: 'conditional', unit: 'month', manualGate: 'control_medico_y_cargas' }),
  Object.freeze({ id: 'health-over-5-no-family', article: '40', label: 'Salud, mas de 5 anos, sin cargas', value: 6, status: 'conditional', unit: 'month', manualGate: 'control_medico' }),
  Object.freeze({ id: 'health-over-5-family', article: '40', label: 'Salud, mas de 5 anos, con cargas', value: 12, status: 'conditional', unit: 'month', manualGate: 'control_medico_y_cargas' }),
  Object.freeze({ id: 'health-exactly-5', article: '40', label: 'Salud, antiguedad exactamente 5 anos', value: null, status: 'not_calculable', unit: null, manualGate: 'ambiguedad_textual_legal' }),
  Object.freeze({ id: 'work-accident-art44-repealed', article: '44', label: 'Accidente o enfermedad laboral', value: 'Articulo 44 derogado por Ley 9681; aplicar el regimen ART vigente', status: 'not_calculable', unit: null, manualGate: 'art_rrhh_y_asesoria_letrada' }),
  Object.freeze({ id: 'job-reservation', article: '47', label: 'Reserva posterior a licencia de salud', value: 1, status: 'conditional', unit: 'year', manualGate: 'estado_medico_y_acto_rrhh' }),
  Object.freeze({ id: 'marriage', article: '50.2', label: 'Matrimonio', value: 10, status: 'conditional', unit: 'calendar_day', manualGate: 'acreditacion' }),
  Object.freeze({ id: 'bereavement-direct', article: '50.3', label: 'Fallecimiento de conyuge, conviviente, ascendiente o descendiente', value: 3, status: 'conditional', unit: 'calendar_day', manualGate: 'acreditacion_de_vinculo_y_defuncion' }),
  Object.freeze({ id: 'bereavement-sibling', article: '50.4', label: 'Fallecimiento de hermano o hermana', value: 2, status: 'not_calculable', unit: 'day_unspecified', manualGate: 'definir_unidad_por_regla_local' }),
  Object.freeze({ id: 'exam', article: '50.5', label: 'Examen o mesa examinadora', value: '3 por examen; maximo 21 por ano calendario', status: 'conditional', unit: 'calendar_day', manualGate: 'certificado_y_encuadre_educativo' }),
  Object.freeze({ id: 'blood-donation', article: '50.6', label: 'Donacion de sangre', value: 1, status: 'conditional', unit: 'day_unspecified', manualGate: 'certificado_y_criterio_local' }),
  Object.freeze({ id: 'family-care', article: '50.7', label: 'Cuidado de familiar enfermo a cargo', value: 10, status: 'conditional', unit: 'day_per_year', manualGate: 'certificado_vinculo_y_unidad_local' }),
  Object.freeze({ id: 'training', article: '50.8', label: 'Capacitacion tecnica o profesional', value: 15, status: 'conditional', unit: 'day_per_year', manualGate: 'aplicabilidad_y_posibilidades_del_servicio' }),
  Object.freeze({ id: 'personal-paid', article: '50.9', label: 'Razones particulares con goce', value: '6 por ano; maximo 2 por mes', status: 'conditional', unit: 'day_unspecified', manualGate: 'autorizacion_y_unidad_local' }),
  Object.freeze({ id: 'organ-donation', article: '50.10', label: 'Donacion de organos o material anatomico', value: '20 preoperatorios + 30 postoperatorios', status: 'conditional', unit: 'calendar_day', manualGate: 'certificacion_y_prorroga_medica' }),
  Object.freeze({ id: 'gender-violence-duration', article: '50.12 y 50 bis', label: 'Violencia contra la mujer', value: 'Hasta 30; ampliable hasta 60 adicionales', status: 'restricted_human_validation', unit: 'calendar_day', manualGate: 'protocolo_confidencial_y_autoridad' }),
  Object.freeze({ id: 'unpaid-personal-duration', article: '52', label: 'Razones particulares sin goce', value: 'Hasta 1 ano; nueva licencia tras 5 anos al agotar el maximo', status: 'conditional', unit: 'calendar_period', manualGate: 'antiguedad_servicio_y_autorizacion' }),
  Object.freeze({ id: 'birth-gestating', article: '54', label: 'Nacimiento, persona gestante', value: '120; 180 en supuestos previstos', status: 'conditional', unit: 'calendar_day', manualGate: 'documentacion_y_version_aplicable' }),
  Object.freeze({ id: 'birth-non-gestating', article: '54 bis', label: 'Nacimiento, progenitor no gestante', value: 15, status: 'conditional', unit: 'calendar_day', manualGate: 'certificado_de_nacimiento' }),
  Object.freeze({ id: 'lactation', article: '56', label: 'Lactancia', value: '2 descansos de 30 minutos por jornada', status: 'conditional', unit: 'minute_per_workday', manualGate: 'horario_vigente_y_acreditacion' }),
  Object.freeze({ id: 'adoption', article: '56 bis y 57', label: 'Adopcion', value: '120; 180 en supuestos previstos; coadoptante 15', status: 'conditional', unit: 'calendar_day', manualGate: 'entrega_judicial_y_version_aplicable' }),
  Object.freeze({ id: 'special-work', article: '58 a 60', label: 'Tareas especiales o riesgosas', value: '30 o 40 segun encuadre; reglas especiales para radiologia', status: 'not_calculable', unit: 'calendar_day', manualGate: 'catalogo_ocupacional_y_jornada_homologados' }),
  Object.freeze({ id: 'tardiness', article: '65', label: 'Impuntualidad', value: 'Bandas expresas con vacio entre mas de 1 hora y hasta 2 h 30', status: 'not_calculable', unit: 'schedule_dependent', manualGate: 'fichada_horario_y_resolucion' }),
]);

const REASON_POLICY = Object.freeze({
  '2': Object.freeze({ provisionId: 'health', status: 'separate_regime', note: 'El articulo 44 fue derogado por la Ley 9681. Derivar el accidente de trabajo al regimen ART vigente, RRHH y Asesoria Letrada.' }),
  '3': Object.freeze({ provisionId: 'family-protection', status: 'requires_version_check', note: 'La configuracion GRH debe contrastarse con la version vigente modificada por Ley 9324.' }),
  '4': Object.freeze({ provisionId: 'special', status: 'candidate', note: 'Matrimonio: verificar evidencia y perfil municipal.' }),
  '5': Object.freeze({ provisionId: 'health', status: 'candidate', note: 'Salud con carga y antiguedad mayor: no autoriza sin control medico.' }),
  '6': Object.freeze({ provisionId: 'special', status: 'configuration_conflict', note: 'El limite GRH no debe asumirse como el limite legal vigente.' }),
  '7': Object.freeze({ provisionId: 'special', status: 'configuration_conflict', note: 'El limite GRH no debe asumirse como el limite legal vigente.' }),
  '8': Object.freeze({ provisionId: 'special', status: 'requires_version_check', note: 'Examen o curso: verificar supuesto, evidencia y tope vigente.' }),
  '9': Object.freeze({ provisionId: 'special', status: 'candidate', note: 'Donacion de sangre: exige constancia.' }),
  '10': Object.freeze({ provisionId: 'special', status: 'configuration_conflict', note: 'GRH declara 30 dias anuales; el texto consolidado debe prevalecer sobre esta configuracion historica.' }),
  '11': Object.freeze({ provisionId: 'special', status: 'candidate', note: 'Razones particulares con goce: sujeta a requisitos y control municipal.' }),
  '12': Object.freeze({ provisionId: 'family-protection', status: 'requires_version_check', note: 'Maternidad: no usar el tope historico GRH como norma.' }),
  '13': Object.freeze({ provisionId: 'family-protection', status: 'requires_version_check', note: 'Lactancia es reduccion/permiso y no equivale automaticamente a dias de licencia.' }),
  '14': Object.freeze({ provisionId: 'special', status: 'requires_version_check', note: 'Cursos tecnicos y profesionales: requiere autorizacion y encuadre.' }),
  '16': Object.freeze({ provisionId: 'unpaid-personal', status: 'requires_version_check', note: 'La Ley 9550 modifico el articulo 52; no usar el tope GRH como decision.' }),
  '17': Object.freeze({ provisionId: null, status: 'not_title_vi_policy', note: 'Compensacion horaria exige horario y saldo homologado; hoy no calculable.' }),
  '18': Object.freeze({ provisionId: null, status: 'separate_regime', note: 'Permiso gremial requiere su convenio o regimen especifico.' }),
  '19': Object.freeze({ provisionId: 'annual-ordinary', status: 'candidate', note: 'Dias adeudados requieren ledger y acto de arrastre; el evento no prueba saldo.' }),
  '20': Object.freeze({ provisionId: 'attendance', status: 'not_a_leave', note: 'Inasistencia es un hecho administrativo, no una licencia aprobada.' }),
  '21': Object.freeze({ provisionId: 'annual-ordinary', status: 'configuration_conflict', note: 'El limite 365 de GRH no representa la escala de 14/21/28/35 dias.' }),
  '22': Object.freeze({ provisionId: null, status: 'not_a_leave', note: 'Periodo inactivo no equivale a una politica de licencia.' }),
  '30': Object.freeze({ provisionId: 'annual-ordinary', status: 'requires_local_rule', note: 'La variante con riesgo exige identificar la norma o convenio que la crea.' }),
  '31': Object.freeze({ provisionId: 'health', status: 'candidate', note: 'Salud con carga y antiguedad menor: exige control medico y prueba de cargas.' }),
  '32': Object.freeze({ provisionId: 'health', status: 'candidate', note: 'Salud sin carga y antiguedad menor: exige control medico.' }),
  '33': Object.freeze({ provisionId: 'health', status: 'candidate', note: 'Salud sin carga y antiguedad mayor: exige control medico.' }),
  '36': Object.freeze({ provisionId: 'health', status: 'requires_version_check', note: 'Estudio preventivo: verificar norma especial vigente y evidencia.' }),
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function completedServiceYears(hireDate, referenceDate) {
  let years = referenceDate.getUTCFullYear() - hireDate.getUTCFullYear();
  const beforeAnniversary = referenceDate.getUTCMonth() < hireDate.getUTCMonth()
    || (referenceDate.getUTCMonth() === hireDate.getUTCMonth()
      && referenceDate.getUTCDate() < hireDate.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return years;
}

function completedServiceMonths(hireDate, referenceDate) {
  let months = (referenceDate.getUTCFullYear() - hireDate.getUTCFullYear()) * 12
    + referenceDate.getUTCMonth() - hireDate.getUTCMonth();
  if (referenceDate.getUTCDate() < hireDate.getUTCDate()) months -= 1;
  return months;
}

function anniversaryWithClampedDay(date, { years = 0, months = 0 } = {}) {
  const targetMonth = date.getUTCMonth() + months;
  const first = new Date(Date.UTC(date.getUTCFullYear() + years, targetMonth, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(date.getUTCDate(), lastDay)));
}

export function annualLeaveReference({ hireDate, year }) {
  const numericYear = Number.parseInt(year, 10);
  const parsedHireDate = validDate(hireDate);
  if (!Number.isInteger(numericYear) || numericYear < 1990 || numericYear > 2100) {
    return { status: 'not_calculable', code: 'evaluation_year_invalid', missingFacts: ['validEvaluationYear'] };
  }
  const reference = new Date(Date.UTC(numericYear, 11, 31));
  if (!parsedHireDate || parsedHireDate > reference || parsedHireDate.getUTCFullYear() < 1900) {
    return { status: 'not_calculable', code: 'hire_date_invalid', referenceDate: `${numericYear}-12-31`, missingFacts: ['recognizedHireDate'] };
  }

  const serviceMonths = completedServiceMonths(parsedHireDate, reference);
  const serviceYears = completedServiceYears(parsedHireDate, reference);
  if (reference <= anniversaryWithClampedDay(parsedHireDate, { months: 6 })) {
    return {
      status: 'not_calculable',
      code: 'effective_days_required',
      referenceDate: `${numericYear}-12-31`,
      serviceMonths,
      serviceYears,
      rule: { article: '38.6', formula: '1 dia cada 20 dias efectivamente trabajados' },
      missingFacts: ['effectiveDaysWorked'],
    };
  }

  const tier = reference <= anniversaryWithClampedDay(parsedHireDate, { years: 5 })
    ? ANNUAL_LEAVE_TIERS[0]
    : reference <= anniversaryWithClampedDay(parsedHireDate, { years: 10 })
      ? ANNUAL_LEAVE_TIERS[1]
      : reference <= anniversaryWithClampedDay(parsedHireDate, { years: 20 })
        ? ANNUAL_LEAVE_TIERS[2]
        : ANNUAL_LEAVE_TIERS[3];
  if (!tier) {
    return { status: 'not_calculable', code: 'tier_not_found', referenceDate: `${numericYear}-12-31`, serviceMonths, serviceYears };
  }
  return {
    status: 'conditional',
    code: 'statutory_tier_candidate',
    referenceDate: `${numericYear}-12-31`,
    serviceMonths,
    serviceYears,
    result: { value: tier.days, unit: 'calendar_day' },
    rule: { article: tier.article, provisionId: 'annual-ordinary' },
    missingFacts: ['recognizedSeniority', 'municipalApplicabilityProfile', 'approvedUsageAndCarryover'],
  };
}

export function reasonPolicyMapping(reasonCode) {
  const code = String(reasonCode ?? '').trim();
  const mapping = REASON_POLICY[code] || Object.freeze({
    provisionId: null,
    status: 'unmapped',
    note: 'El motivo GRH todavia no tiene una politica normativa validada.',
  });
  return { reasonCode: code || null, ...clone(mapping) };
}

export function getTitleViCatalog() {
  return {
    version: TITLE_VI_CATALOG_VERSION,
    verifiedAt: TITLE_VI_VERIFIED_AT,
    sources: clone(TITLE_VI_SOURCES),
    provisions: clone(TITLE_VI_PROVISIONS),
    annualLeaveTiers: clone(ANNUAL_LEAVE_TIERS),
    keyRules: clone(TITLE_VI_KEY_RULES),
    applicability: {
      scope: 'municipal_employees_included_by_article_36',
      status: 'conditional_pending_complete_junin_profile',
      supportedEvaluationYears: [2026],
      rules: [
        'El articulo 71 reserva a los Concejos Deliberantes la reglamentacion en su ambito.',
        'El articulo 72 preserva las reglas de convenios colectivos aplicables.',
        'La Ley 5892 reconoce las licencias provinciales al personal municipal comprendido y excluye determinadas autoridades y funciones.',
        'La Ordenanza 1021/2025 adopta el regimen para el ejercicio 2026, pero debe versionarse por periodo y categoria.',
        'El Decreto 727/1993 no se aplica automaticamente al Municipio sin acreditar adopcion o reglamentacion local.',
      ],
      missingInstruments: ['ordenanzas_reglamentarias_completas', 'convenios_colectivos_aplicables', 'paritarias_vigentes', 'matriz_de_autoridades', 'calendario_laboral_municipal'],
    },
    disclaimer: 'Catalogo tecnico de apoyo. No constituye dictamen legal, diagnostico medico, saldo de licencia ni acto administrativo.',
  };
}
