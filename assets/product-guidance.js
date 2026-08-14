function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function publicSection(section) {
  const { aliases: _aliases, ...visible } = section;
  return { ...visible, actions: [...visible.actions], limits: [...visible.limits] };
}

export const GUIDANCE_AS_OF = '2026-08-13T00:00:00.000Z';

export const SECTION_CATALOG = deepFreeze([
  {
    id: 'inicio', label: 'Inicio', targetPath: '/internal-dashboard#inicio',
    purpose: 'Ubicar los controles principales, la fecha de corte y los accesos a las áreas de trabajo del portal interno.',
    actions: ['revisar el resumen operativo', 'confirmar el corte disponible', 'elegir la sección adecuada para continuar'],
    limits: ['es una vista de orientación y no reemplaza el detalle ni los controles especializados de cada sección'],
    aliases: ['inicio', 'home', 'portal', 'panel principal', 'tablero interno'],
  },
  {
    id: 'personas', label: 'Personas', targetPath: '/internal-dashboard#legajos',
    purpose: 'Buscar legajos y consultar fichas laborales individuales con su trazabilidad disponible.',
    actions: ['buscar por apellido, número de legajo o documento', 'filtrar el directorio', 'abrir una ficha'],
    limits: ['la ficha informa datos y evidencia; no modifica GRH ni resuelve por sí sola casos administrativos'],
    aliases: ['persona', 'personas', 'empleado', 'empleados', 'legajo', 'legajos', 'directorio'],
  },
  {
    id: 'estructura', label: 'Estructura', targetPath: '/estructura',
    purpose: 'Explorar asignaciones agregadas de organizaciones, sectores, cargos y catálogos de GRH.',
    actions: ['buscar una asignación', 'filtrar grupos activos o inactivos', 'alternar entre organizaciones, sectores y catálogos'],
    limits: ['no presenta una jerarquía cuando GRH no informa relaciones parentales completas'],
    aliases: ['estructura', 'organigrama', 'organizacion', 'organizaciones', 'sector', 'sectores', 'cargo', 'cargos'],
  },
  {
    id: 'integracion', label: 'Integración', targetPath: '/integracion-datos',
    purpose: 'Revisar la separación entre la autoridad laboral GRH y el enriquecimiento auxiliar de PERSONAS.',
    actions: ['consultar el control administrativo frente a la corrida', 'revisar coincidencias, ambigüedades y casos sin vínculo', 'leer reglas y límites del crosswalk'],
    limits: ['PERSONAS no cambia estados laborales, liquidaciones ni bajas de GRH', 'la pantalla no confirma manualmente coincidencias ambiguas'],
    aliases: ['integracion', 'crosswalk', 'coincidencia', 'coincidencias', 'identidad', 'padron'],
  },
  {
    id: 'nomina', label: 'Nómina', targetPath: '/nomina-control',
    purpose: 'Controlar corridas cerradas y abiertas, conciliación aritmética, trazabilidad y límites monetarios.',
    actions: ['distinguir la última corrida cerrada de la abierta', 'revisar la conciliación', 'consultar el historial controlado'],
    limits: ['no publica como KPI financiero una corrida abierta', 'los importes históricos son nominales y no incorporan IPC'],
    aliases: ['nomina', 'liquidacion', 'liquidaciones', 'haberes', 'sueldo', 'salario', 'corrida', 'corridas'],
  },
  {
    id: 'asistente', label: 'Asistente', targetPath: '/asistente',
    purpose: 'Consultar datos canónicos, pedir explicaciones y recibir orientación sobre el uso de la plataforma.',
    actions: ['consultar controles agregados', 'buscar personas', 'abrir una ficha por legajo', 'pedir ayuda, definiciones o pasos'],
    limits: ['no autoriza decisiones ni reemplaza la validación administrativa', 'las consultas nominales permanecen en la base local'],
    aliases: ['asistente', 'ia', 'bot', 'chat', 'chatbot'],
  },
  {
    id: 'ausentismo', label: 'Ausentismo', targetPath: '/internal-dashboard#ausentismo',
    purpose: 'Consultar eventos históricos de ausencia y personas alcanzadas dentro del período informado por la fuente.',
    actions: ['revisar eventos registrados', 'consultar personas alcanzadas', 'confirmar el período y los límites de la fuente'],
    limits: ['un evento no equivale a un día perdido, una duración ni una tasa de ausentismo homologada'],
    aliases: ['ausentismo', 'ausencia', 'ausencias', 'evento de ausencia', 'eventos de ausencia'],
  },
  {
    id: 'calidad', label: 'Calidad', targetPath: '/calidad-datos',
    purpose: 'Auditar controles, excepciones, reglas de lectura, disponibilidad, límites y trazabilidad del corte.',
    actions: ['revisar la matriz de validación', 'identificar excepciones', 'leer definiciones y limitaciones por dominio'],
    limits: ['un estado para revisar no equivale automáticamente a invalidar todo el corte'],
    aliases: ['calidad', 'calidad de datos', 'auditoria', 'excepcion', 'excepciones', 'trazabilidad'],
  },
  {
    id: 'reportes', label: 'Reportes', targetPath: '/reportes-rrhh',
    purpose: 'Consultar análisis agregados de dotación, movimientos, ausentismo y composición por sector.',
    actions: ['leer hallazgos principales', 'comparar altas y bajas', 'consultar eventos de ausencia y composición sectorial'],
    limits: ['los eventos de ausencia no equivalen a días perdidos ni a una tasa homologada', 'el reporte agregado no expone fichas individuales'],
    aliases: ['reporte', 'reportes', 'informe', 'informes', 'rrhh', 'analitica'],
  },
  {
    id: 'ayuda', label: 'Ayuda', targetPath: '/centro-ayuda',
    purpose: 'Orientar a personas nuevas con navegación, explicación de secciones, recorridos por tarea y glosario.',
    actions: ['preguntar dónde encontrar una función', 'pedir un paso a paso', 'consultar qué significa un término'],
    limits: ['describe sólo funciones verificadas en la versión actual', 'no inventa permisos, estados ni operaciones administrativas'],
    aliases: ['ayuda', 'onboarding', 'guia', 'tutorial', 'aprender', 'nuevo', 'nueva'],
  },
]);

export const TASK_CATALOG = deepFreeze([
  {
    id: 'buscar_empleado', label: 'Buscar un empleado', sectionId: 'personas',
    aliases: ['buscar empleado', 'buscar un empleado', 'buscar persona', 'buscar una persona', 'buscar legajo', 'encontrar empleado', 'encontrar persona'],
    steps: ['Abrí Personas desde el menú interno.', 'Ingresá un apellido, número de legajo o documento en el buscador.', 'Ajustá los filtros si hay más de un resultado.', 'Abrí la fila correcta para consultar la ficha y su trazabilidad.'],
  },
  {
    id: 'revisar_ficha', label: 'Revisar una ficha laboral', sectionId: 'personas',
    aliases: ['abrir ficha', 'abrir una ficha', 'ver ficha', 'revisar ficha', 'revisar una ficha', 'detalle de empleado', 'datos de empleado'],
    steps: ['Buscá primero el legajo en Personas.', 'Confirmá la identidad usando la información visible en el resultado.', 'Abrí la ficha y recorré estado, organización, ausencias, movimientos y trazabilidad disponibles.', 'Si un dato falta o está marcado como ambiguo, conservá esa limitación y validalo en la fuente administrativa correspondiente.'],
  },
  {
    id: 'explorar_estructura', label: 'Explorar la estructura municipal', sectionId: 'estructura',
    aliases: ['explorar estructura', 'buscar sector', 'buscar organizacion', 'ver organigrama', 'ver cargos'],
    steps: ['Abrí Estructura.', 'Elegí Organizaciones, Sectores o Cargos y catálogos.', 'Usá la búsqueda y el filtro de situación para acotar los grupos.', 'Leé las definiciones de la vista antes de interpretar relaciones jerárquicas.'],
  },
  {
    id: 'revisar_integracion', label: 'Revisar la integración GRH–PERSONAS', sectionId: 'integracion',
    aliases: ['revisar integracion', 'revisar crosswalk', 'ver coincidencias', 'casos ambiguos', 'sin coincidencia'],
    steps: ['Abrí Integración.', 'Revisá primero el control de dotación y su estado de reconciliación.', 'Consultá la cobertura del crosswalk y separá coincidencias confirmadas, ambiguas y sin vínculo.', 'Leé las reglas y límites: PERSONAS sólo enriquece identidad y territorio; GRH conserva la autoridad laboral.'],
  },
  {
    id: 'controlar_nomina', label: 'Controlar una corrida de nómina', sectionId: 'nomina',
    aliases: ['controlar nomina', 'revisar nomina', 'revisar liquidacion', 'corrida cerrada', 'corrida abierta'],
    steps: ['Abrí Nómina.', 'Diferenciá la última corrida cerrada de la corrida actual abierta.', 'Revisá la conciliación aritmética y la decisión de publicación informada por la API.', 'Consultá trazabilidad y limitaciones antes de comparar importes nominales.'],
  },
  {
    id: 'auditar_calidad', label: 'Auditar la calidad del corte', sectionId: 'calidad',
    aliases: ['auditar calidad', 'revisar calidad', 'ver excepciones', 'validar corte', 'trazabilidad del corte'],
    steps: ['Abrí Calidad.', 'Revisá la matriz de validación y los casos que requieren atención.', 'Leé las reglas de construcción del indicador que vas a usar.', 'Confirmá disponibilidad, límites y trazabilidad antes de comunicar una conclusión.'],
  },
  {
    id: 'revisar_ausentismo', label: 'Revisar los eventos de ausentismo', sectionId: 'ausentismo',
    aliases: ['revisar ausentismo', 'ver ausentismo', 'revisar ausencias', 'ver ausencias', 'consultar ausentismo'],
    steps: ['Abrí Ausentismo desde el portal interno.', 'Confirmá el período y la fuente informados antes de leer los valores.', 'Revisá por separado los eventos registrados y las personas alcanzadas.', 'No conviertas eventos en días perdidos, duración ni tasa: esos indicadores no están homologados en la fuente disponible.'],
  },
  {
    id: 'leer_reporte', label: 'Interpretar un reporte de RRHH', sectionId: 'reportes',
    aliases: ['leer reporte', 'ver reporte', 'interpretar informe', 'analizar rrhh'],
    steps: ['Abrí Reportes.', 'Identificá el período y la fuente del análisis.', 'Revisá hallazgos, movimientos, ausencias y composición sectorial según tu pregunta.', 'Conservá los límites metodológicos; un evento de ausencia no representa días perdidos ni una tasa.'],
  },
  {
    id: 'consultar_asistente', label: 'Hacer una consulta al asistente', sectionId: 'asistente',
    aliases: ['usar asistente', 'preguntar al asistente', 'usar ia', 'consultar ia', 'usar bot'],
    steps: ['Abrí Asistente.', 'Escribí una pregunta concreta sobre dotación, nómina, integración, navegación o definiciones.', 'Revisá la fuente, la fecha de corte y el aviso de privacidad incluidos en la respuesta.', 'Usá la sección sugerida para verificar o continuar la tarea.'],
  },
]);

export const GLOSSARY = deepFreeze([
  { id: 'grh', label: 'GRH', aliases: ['grh'], definition: 'Base central y autoridad laboral de MuniControl para personas laborales, legajos, estructura y liquidación.', relatedSectionIds: ['personas', 'estructura', 'nomina', 'integracion'] },
  { id: 'personas_auxiliar', label: 'PERSONAS', aliases: ['personas', 'padron personas', 'base personas'], definition: 'Padrón municipal auxiliar usado para enriquecer identidad, domicilios y territorio. No reemplaza GRH ni gobierna estados laborales.', relatedSectionIds: ['integracion', 'personas'] },
  { id: 'crosswalk', label: 'Crosswalk de persona', aliases: ['crosswalk', 'tabla puente', 'vinculacion de identidad'], definition: 'Vínculo versionado entre identificadores originales de GRH y PERSONAS construido con evidencia de identidad; los casos ambiguos no se confirman automáticamente.', relatedSectionIds: ['integracion', 'calidad'] },
  { id: 'legajo', label: 'Legajo', aliases: ['legajo', 'legajo historico'], definition: 'Registro laboral de una relación de empleo. Una persona puede tener más de un legajo histórico, por lo que legajos y personas no son conteos equivalentes.', relatedSectionIds: ['personas'] },
  { id: 'activo_administrativo', label: 'Activo administrativo', aliases: ['activo administrativo', 'activos administrativos'], definition: 'Clasificación laboral derivada del estado administrativo disponible en GRH. Debe distinguirse de la inclusión efectiva en una corrida de nómina.', relatedSectionIds: ['integracion', 'personas'] },
  { id: 'activo_liquidable', label: 'Activo liquidable', aliases: ['activo liquidable', 'liquidable', 'incluido en corrida'], definition: 'Legajo incluido en la corrida operativa informada. No es sinónimo automático de activo administrativo y una corrida abierta no es un KPI financiero publicable.', relatedSectionIds: ['nomina', 'integracion'] },
  { id: 'corrida_cerrada', label: 'Corrida cerrada', aliases: ['corrida cerrada', 'nomina cerrada', 'liquidacion cerrada'], definition: 'Período de nómina cuyo estado de cierre y controles de conciliación permiten tratarlo como referencia publicable según la decisión informada por la API.', relatedSectionIds: ['nomina'] },
  { id: 'corrida_abierta', label: 'Corrida abierta', aliases: ['corrida abierta', 'nomina abierta', 'preliquidacion'], definition: 'Período todavía en curso. Puede usarse para control interno, pero sus importes no se presentan como KPI financiero cerrado.', relatedSectionIds: ['nomina'] },
  { id: 'dato_nominal', label: 'Dato nominal', aliases: ['dato nominal', 'datos nominales', 'informacion nominal', 'informacion personal'], definition: 'Información que identifica o describe a una persona o legajo individual. Las consultas nominales del asistente permanecen en la base local y no se envían al proveedor externo.', relatedSectionIds: ['personas', 'asistente'] },
]);

export function getProductGuidanceCatalog() {
  return {
    asOf: GUIDANCE_AS_OF,
    sections: SECTION_CATALOG.map(publicSection),
    tasks: TASK_CATALOG.map(({ aliases: _aliases, ...task }) => ({
      ...task,
      steps: [...task.steps],
      targetPath: SECTION_CATALOG.find((section) => section.id === task.sectionId)?.targetPath || null,
    })),
    glossary: GLOSSARY.map(({ aliases: _aliases, ...term }) => ({
      ...term,
      relatedSectionIds: [...term.relatedSectionIds],
    })),
  };
}
