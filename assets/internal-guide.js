(function () {
  'use strict';

  var STORAGE_KEY = 'municontrol:screen-guide:v1:' + sessionScope();
  var NAV_STORAGE_KEY = 'municontrol:progressive-navigation:v1:' + sessionScope();
  var ESSENTIAL_NAV_KEYS = Object.freeze(['inicio', 'personas', 'acciones']);
  var PAGE_KEY = document.body.getAttribute('data-mc-page') || inferPage();
  var PAGES = {
    portal: {
      sectionId: 'inicio', taskSectionIds: ['personas', 'acciones', 'ausentismo', 'calidad'], title: 'Portal interno',
      tour: [
        ['.primary-nav', 'Recorrido principal', 'Estas son las áreas operativas. La sección activa permanece visible también en móvil.'],
        ['.suite-links', 'Herramientas de análisis', 'Ausentismo, calidad y reportes complementan la operación sin mezclar funciones.'],
        ['#view-inicio .page-heading', 'Punto de partida', 'El inicio explica el corte y permite entrar a las tareas más frecuentes.'],
        ['#sidebarSource', 'Fuente y corte', 'Consultá siempre esta referencia antes de comparar cifras.']
      ],
      explain: [
        ['#view-inicio .page-heading', 'Inicio', 'Resume el alcance operativo y orienta hacia las tareas disponibles.'],
        ['#view-legajos .page-heading', 'Personas', 'Busca contratos laborales y abre una ficha canónica con sus registros asociados.'],
        ['#view-ausentismo .page-heading', 'Ausentismo', 'Presenta eventos de ausencia con período y cobertura explícitos.'],
        ['#view-calidad .page-heading', 'Calidad', 'Muestra qué tan confiable y completa es cada familia de datos.']
      ]
    },
    structure: {
      sectionId: 'estructura', title: 'Estructura municipal',
      tour: [
        ['.page-head', 'Alcance de la pantalla', 'Esta introducción aclara qué relaciones organizacionales están verificadas.'],
        ['#hierarchyNotice', 'Límite de jerarquía', 'Leé este control antes de interpretar la vista como organigrama formal.'],
        ['.tabs', 'Tres lecturas', 'Alterná organizaciones, sectores y catálogos sin abandonar la pantalla.'],
        ['.source-section', 'Evidencia', 'Acá se documentan cobertura, faltantes y fuente utilizada.']
      ],
      explain: [
        ['#hierarchyNotice', 'Jerarquía', 'Informa si la fuente permite reconstruir dependencias entre áreas.'],
        ['.workspace', 'Explorador', 'Organiza las lecturas disponibles sin afirmar relaciones no presentes.'],
        ['.source-section', 'Fuente', 'Detalla la procedencia y las limitaciones del resultado.']
      ]
    },
    integration: {
      sectionId: 'integracion', title: 'Integración de datos',
      tour: [
        ['.policy', 'Regla de autoridad', 'GRH conserva la autoridad laboral; PERSONAS no puede cambiar contratos ni estados.'],
        ['#workforceTitle', 'Control laboral', 'Reconciliá activos administrativos y liquidables antes de informar.'],
        ['#identityTitle', 'Calidad del vínculo', 'El crosswalk distingue coincidencias automáticas, ambigüedad y pendientes.'],
        ['#contractTitle', 'Contrato técnico', 'Las vistas ausentes o incompatibles se muestran de forma explícita.']
      ],
      explain: [
        ['.policy', 'Política de fuentes', 'Define qué sistema manda para cada dominio.'],
        ['#workforceTitle', 'Brecha operativa', 'Controla diferencias entre situación administrativa y corrida de nómina.'],
        ['#identityTitle', 'Crosswalk', 'Vincula identidades mediante evidencia versionada, nunca por IDPERSONA.']
      ]
    },
    payroll: {
      sectionId: 'nomina', title: 'Control de nómina',
      tour: [
        ['.page-head', 'Regla principal', 'La pantalla distingue claramente control operativo y publicación ejecutiva.'],
        ['.notice', 'Advertencia de cierre', 'Una fecha reciente no implica que la liquidación esté cerrada.'],
        ['#runsTitle', 'Corridas', 'Compará el último cierre con el período actualmente abierto.'],
        ['#reconciliationTitle', 'Conciliación', 'Validá componentes y diferencia antes de usar el neto.'],
        ['#auditTitle', 'Trazabilidad', 'Conservá fuente, regla y limitaciones junto con cada cifra.']
      ],
      explain: [
        ['.notice', 'Estado de corrida', 'Evita tratar una preliquidación como resultado financiero definitivo.'],
        ['#reconciliationTitle', 'Conciliación', 'Comprueba que los totales explícitos de GRH cierren dentro de tolerancia.'],
        ['#historyTitle', 'Historial', 'Oculta importes de períodos que no superan el contrato de publicación.']
      ]
    },
    'payroll-receipts': {
      sectionId: 'recibos', title: 'Recibos y liquidaciones',
      tour: [
        ['.page-head', 'Un recorrido corto', 'La pantalla concentra la tarea en buscar una persona y elegir un período.'],
        ['#employeeSearchForm', 'Búsqueda autorizada', 'Ingresá apellido, legajo o identificador y elegí la ficha correcta.'],
        ['#periodSection', 'Liquidaciones reales', 'Cada período muestra importes de GRH y explica por qué puede o no descargarse.'],
        ['#previewSection', 'Control antes de descargar', 'Revisá persona, período, importes y trazabilidad antes de crear el PDF local.']
      ],
      explain: [
        ['#employeeSearchForm', 'Buscar una persona', 'Consulta el directorio laboral autorizado sin guardar el término en el navegador.'],
        ['#periodSection', 'Estado del período', 'Sólo un cierre conciliado habilita el PDF de control.'],
        ['#previewSection', 'Alcance del PDF', 'Es un resumen individual real; todavía no es el recibo oficial con conceptos y firma.']
      ]
    },
    'payroll-novelties': {
      sectionId: 'novedades', title: 'Novedades de nómina',
      tour: [
        ['.page-head', 'Alcance seguro', 'La aprobación sólo habilita una salida exportable; no calcula haberes ni escribe en GRH.'],
        ['#entrySection', 'Carga y preflight', 'Prepará una fila o un CSV y corregí su estructura antes de crear un lote trazable.'],
        ['#previewPanel', 'Previsualización', 'Revisá legajo, concepto, unidades, importe y observación antes de guardar.'],
        ['#batchesTitle', 'Circuito de aprobación', 'Los comandos dependen del estado del lote y de las capacidades efectivas informadas por el backend.'],
        ['#detailPanel', 'Detalle y exportación', 'Consultá validaciones y descargá únicamente lotes aprobados para exportar.']
      ],
      explain: [
        ['.boundary', 'Límite operativo', 'Esta etapa no modifica GRH, cálculo de haberes ni movimientos laborales.'],
        ['#entrySection', 'Carga individual o masiva', 'Ambos modos usan el mismo contrato, límites y validaciones determinísticas.'],
        ['#batchesTitle', 'Maker-checker', 'La preparación, el envío y la decisión quedan separados y auditados.']
      ]
    },
    actions: {
      sectionId: 'acciones', title: 'Centro de acciones',
      tour: [
        ['.page-head', 'Alcance de la sesión', 'Confirmá las capacidades vigentes antes de crear, revisar o decidir una solicitud.'],
        ['#summaryMetrics', 'Bandeja operativa', 'Los indicadores resumen únicamente los casos visibles para tu alcance actual.'],
        ['#actionFilters', 'Filtros de trabajo', 'Acotá la bandeja sin incluir datos personales en la URL ni en el almacenamiento local.'],
        ['#actionQueue', 'Solicitudes', 'Cada caso conserva estado, versión, responsable y próxima acción permitida.'],
        ['#actionDialog', 'Detalle e historial', 'La línea de tiempo es inmutable; una corrección se registra como un nuevo evento.'],
        ['#actionWizard', 'Nueva solicitud', 'El asistente de carga separa lo solicitado de cualquier saldo, jornada o impacto salarial todavía no homologado.']
      ],
      explain: [
        ['#summaryMetrics', 'Resumen operativo', 'Cuenta solicitudes dentro del alcance de la sesión, no toda la administración.'],
        ['#actionQueue', 'Bandeja', 'Permite continuar sólo con los comandos autorizados y la versión vigente del caso.'],
        ['#actionWizard', 'Solicitud de licencia', 'Registra días o minutos solicitados; no infiere horas trabajadas, saldo ni liquidación.']
      ]
    },
    attendance: {
      sectionId: 'marcaciones', title: 'Relojes y marcaciones',
      tour: [
        ['.truth-strip', 'Estado operativo real', 'Esta franja sólo confirma conexión cuando el backend recibió recientemente un lote de hardware no simulado.'],
        ['.evidence-panel', 'Inventario municipal', 'Los trece puntos y modelos provienen del relevamiento recibido; todavía no prueban conexión física.'],
        ['.summary-grid', 'Recepción y pendientes', 'Separá altas lógicas, conectores, eventos, identidades sin vínculo y revisiones pendientes.'],
        ['.tabs', 'Cinco recursos', 'Consultá puntos, equipos, conectores, marcaciones y lotes sin mezclar sus estados.'],
        ['#resourcePanel', 'Detalle operativo', 'Cada fila proviene del backend interno y mantiene estado, fuente y trazabilidad.'],
        ['.feature-grid', 'Límites del cálculo', 'Una fichada recibida no calcula jornada, presentismo, nómina ni almacena la plantilla biométrica.']
      ],
      explain: [
        ['.truth-strip', 'Conexión acreditada', 'Exige conector y reloj físico activos con recepción aceptada dentro de la ventana reciente.'],
        ['.evidence-panel', 'Relevamiento', 'Conserva lugares, modelos y canal reportado separados de la operación.'],
        ['#resourcePanel', 'Registros del tenant', 'Muestra únicamente recursos autorizados del municipio activo.']
      ]
    },
    platformAdmin: {
      sectionId: 'administracion', title: 'Administración de plataforma',
      tour: [
        ['#tenantSwitcher', 'Ámbito activo', 'Confirmá si estás administrando la plataforma completa o un gobierno específico antes de cambiar accesos.'],
        ['#tenantContextBanner', 'Contexto efectivo', 'Esta franja conserva gobierno, entorno y rol efectivo durante toda la tarea.'],
        ['#userTable', 'Usuarios y acceso', 'Cada usuario muestra estado, rol, alcance y acceso efectivo; una invitación preparada todavía no habilita el ingreso.'],
        ['#effectiveAccessDialog', 'Permisos explicados', 'Las casillas se traducen en capacidades técnicas, origen, alcance y restricciones verificables.'],
        ['#policyControlTable', 'Funciones exclusivas', 'Las horas extra o Mayor esfuerzo admiten un titular primario y una delegación temporal auditada, nunca cuentas compartidas.'],
        ['#auditTable', 'Auditoría', 'Toda asignación, revocación o suspensión queda como un evento append-only.']
      ],
      explain: [
        ['#tenantSwitcher', 'Selector de ámbito', 'Evita operar accidentalmente sobre otro gobierno y nunca amplía el alcance devuelto por el backend.'],
        ['#userTable', 'Identidades', 'Separa cuenta, tenant, rol y vínculo laboral; no crea contraseñas compartidas.'],
        ['#roleTable', 'Roles y capacidades', 'Una plantilla acelera la configuración, mientras las excepciones permanecen visibles y auditables.'],
        ['#policyControlTable', 'Segregación', 'Expone incompatibilidades y responsabilidades exclusivas antes de guardar.'],
        ['#auditTable', 'Trazabilidad', 'Permite reconstruir quién cambió qué, en qué ámbito y con qué resultado.']
      ]
    },
    management: {
      sectionId: 'gestiones', title: 'Comparación de gestiones',
      tour: [
        ['.page-head', 'Regla de comparación', 'La cabecera explica por qué la lectura principal usa la misma cantidad de días para ambas gestiones.'],
        ['#periodRail', 'Períodos exactos', 'Confirmá fechas, duración y carácter parcial antes de comparar cifras.'],
        ['#movementLedger', 'Movimientos registrales', 'Altas, bajas y balance se cuentan al grano legajo por empresa; no son personas únicas.'],
        ['#managementYearChart', 'Años de gestión', 'Cada año comienza en la fecha real del mandato. El tramo parcial se compara sólo contra igual cantidad de días.'],
        ['#payrollPanel', 'Base normalizada', 'Los eventos se relacionan con contrato-mes liquidado y cerrado, sin presentarlos como tasa de ausentismo.'],
        ['#breakdownPanel', 'Sectores y jardines', 'Alterná etiquetas originales y una agrupación analítica reversible sin modificar GRH.'],
        ['#sourcePanel', 'Evidencia y límites', 'Revisá reconciliaciones, cobertura y dominios todavía sin fuente.']
      ],
      explain: [
        ['#movementLedger', 'Altas, bajas y balance', 'Describe movimientos de legajos dentro de períodos equivalentes; no mide eficiencia ni calidad de gobierno.'],
        ['#payrollPanel', 'Eventos por contrato-mes', 'Usa sólo meses cerrados completos para construir un denominador comparable.'],
        ['#breakdownPanel', 'Agrupación sectorial', 'La vista Jardines consolida claves explícitas y permite volver a las etiquetas literales.'],
        ['#sourcePanel', 'Fuente y calidad', 'Documenta el corte GRH, exclusiones y las verificaciones que deben cerrar.']
      ]
    },
    budget: {
      sectionId: 'presupuesto', title: 'Presupuesto aprobado',
      tour: [
        ['.page-head', 'Ejercicio y fuente', 'Confirmá el ejercicio fiscal, la ordenanza y la fecha de aprobación antes de usar cualquier importe.'],
        ['.summary-ledger', 'Ecuación presupuestaria', 'Gastos aprobados, recursos estimados y financiamiento se presentan por separado y concilian en centavos.'],
        ['#breakdownStack', 'Cobertura publicada', 'Las jurisdicciones y desagregaciones sólo se muestran cuando están explícitas en la publicación oficial disponible.'],
        ['#appropriationsStack', 'Autorizaciones específicas', 'Estos importes provienen de artículos concretos y no constituyen una clasificación exhaustiva del presupuesto.'],
        ['#staffingLedger', 'Planta autorizada', 'Cargos, horas cátedra y contratos conservan unidades distintas; no deben sumarse entre sí.'],
        ['.execution-panel', 'Ejecución pendiente', 'La plataforma no calcula avance, desvío, compromiso, devengado ni pagado hasta incorporar una fuente transaccional oficial.'],
        ['.evidence-grid', 'Evidencia y límites', 'Revisá huella, corte, reconciliaciones y anexos faltantes antes de comunicar el resultado.']
      ],
      explain: [
        ['.summary-ledger', 'Presupuesto aprobado', 'Resume el crédito inicial aprobado por ordenanza sin confundirlo con ejecución corriente.'],
        ['#breakdownStack', 'Desagregaciones', 'Distingue totales exhaustivos de partidas explícitas y cobertura documental parcial.'],
        ['#staffingLedger', 'Planta', 'Mantiene separadas las unidades heterogéneas declaradas por la norma.'],
        ['.execution-panel', 'Estado de ejecución', 'Explica por qué todavía no existen porcentajes de avance ni desvíos verificables.'],
        ['.evidence-grid', 'Trazabilidad', 'Conserva fuente oficial, fecha de corte, controles y limitaciones junto a las cifras.']
      ]
    },
    leave: {
      sectionId: 'licencias', title: 'Licencias normativas',
      tour: [
        ['.page-head', 'Decisión asistida', 'La pantalla separa regla legal, evidencia GRH y hechos todavía no disponibles.'],
        ['#legalPanel', 'Marco aplicable', 'Verificá la norma, el perfil municipal y el estado de aplicabilidad antes de calcular.'],
        ['#mappingPanel', 'Motivos GRH', 'Los motivos observados se mapean con política explícita; una etiqueta no concede una licencia.'],
        ['#readinessPanel', 'Preparación de datos', 'Cada bloque indica si el sistema puede calcular, orientar o debe esperar evidencia.'],
        ['#previewPanel', 'Referencia por legajo', 'La simulación es condicionada y no reemplaza saldo, aprobación ni acto administrativo.'],
        ['#limitationsPanel', 'Límites', 'Revisá fuentes faltantes y controles humanos antes de usar el resultado.']
      ],
      explain: [
        ['#legalPanel', 'Norma y alcance', 'Muestra la fuente legal versionada y su relación con el régimen municipal.'],
        ['#readinessPanel', 'Estado de cálculo', 'Distingue lo calculable de aquello que requiere fichadas, turnos, calendario o validación.'],
        ['#previewPanel', 'Referencia individual', 'Aplica una regla a los datos disponibles sin afirmar saldo vigente ni autorización.']
      ]
    },
    absence: {
      sectionId: 'ausentismo', title: 'Ausentismo operativo',
      tour: [
        ['.page-head', 'Alcance y corte', 'La cabecera identifica la fuente GRH y el período efectivo de la consulta.'],
        ['#filterPanel', 'Filtros verificables', 'Acotá fecha, motivo y sector antes de interpretar los resultados.'],
        ['#summaryMetrics', 'Tres lecturas distintas', 'Eventos, legajos alcanzados y días declarados por GRH no son medidas intercambiables.'],
        ['#trendPanel', 'Evolución del período', 'La serie muestra registros administrativos y señala períodos parciales.'],
        ['#eventsPanel', 'Bandeja operativa', 'Desde cada fila podés continuar en la ficha laboral autorizada.'],
        ['#qualityPanel', 'Calidad y límites', 'Revisá exclusiones y semántica antes de comunicar una conclusión.']
      ],
      explain: [
        ['#filterPanel', 'Período y filtros', 'Todas las cifras de la pantalla responden al mismo rango efectivo y a los filtros visibles.'],
        ['#summaryMetrics', 'Indicadores administrativos', 'Separa conteos de eventos, legajos y días declarados sin inferir presentismo.'],
        ['#eventsPanel', 'Eventos', 'Lista registros nominales sólo dentro del portal interno y enlaza a la ficha laboral.'],
        ['#qualityPanel', 'Límites de uso', 'Documenta anomalías y evita convertir la fuente en una tasa o productividad no respaldada.']
      ]
    },
    quality: {
      sectionId: 'calidad', title: 'Calidad operativa de datos',
      tour: [
        ['#summaryPanel', 'Incidencias registradas', 'Separá total, abiertas y severidad sin convertirlas en un puntaje sintético.'],
        ['#domainsPanel', 'Controles materializados', 'Cada bloque explica qué control existe y qué parte todavía no fue evaluada.'],
        ['#lineagePanel', 'Fuente y corte', 'Confirmá lote, fecha de corte, validación y filas informadas antes de interpretar un cero.'],
        ['#issuesPanel', 'Bandeja priorizada', 'Filtrá por severidad, estado, fuente, entidad o código sin exponer valores observados ni datos personales.'],
        ['#caveatsPanel', 'Límites de uso', 'Conservá estas salvedades al continuar el análisis en Integración, Nómina o Personas.']
      ],
      explain: [
        ['#summaryPanel', 'Resumen de incidencias', 'Cuenta controles registrados; no mide por sí solo la calidad total de una fuente.'],
        ['#lineagePanel', 'Linaje de importación', 'Permite reconocer qué snapshot y huella respaldan el resultado visible.'],
        ['#issuesPanel', 'Incidencias', 'Muestra una proyección operativa deliberadamente acotada y sin PII.'],
        ['#caveatsPanel', 'Salvedades', 'Aclara por qué cero controles no equivale a una fuente perfecta.']
      ]
    },
    assistant: {
      sectionId: 'asistente', title: 'Asistente de control',
      tour: [
        ['.page-head', 'Alcance y privacidad', 'Esta cabecera resume qué datos puede consultar el asistente.'],
        ['.quick-section', 'Consultas frecuentes', 'Usá estos accesos para aprender el formato de una buena pregunta.'],
        ['.conversation-card', 'Conversación', 'Cada respuesta separa dato, explicación, fuente y límite.'],
        ['.context-card', 'Reglas de uso', 'La columna lateral recuerda qué fuente gobierna y qué no debe inferirse.']
      ],
      explain: [
        ['.quick-section', 'Consultas rápidas', 'Ejemplos operativos para comenzar sin conocer la terminología.'],
        ['.conversation-card', 'Respuesta trazable', 'Conserva fuente, fecha de corte y estado del proveedor.'],
        ['.context-card', 'Contexto', 'Explica límites de datos y privacidad mientras trabajás.']
      ]
    }
  };

  var page = PAGES[PAGE_KEY];
  if (!page) return;

  var state = readState();
  var lastFocus = null;
  var tourLastFocus = null;
  var drawer = null;
  var backdrop = null;
  var tour = null;
  var tourIndex = -1;
  var activeTarget = null;
  var inertedNodes = [];
  var previousBodyOverflow = '';
  var progressiveNavigation = null;

  function inferPage() {
    var path = window.location.pathname.toLowerCase();
    if (path.indexOf('centro-acciones') >= 0) return 'actions';
    if (path.indexOf('relojes-marcaciones') >= 0) return 'attendance';
    if (path.indexOf('administracion-plataforma') >= 0 || path === '/admin') return 'platformAdmin';
    if (path.indexOf('estructura') >= 0 || path.indexOf('organigrama') >= 0) return 'structure';
    if (path.indexOf('integracion') >= 0) return 'integration';
    if (path.indexOf('recibos-sueldo') >= 0) return 'payroll-receipts';
    if (path.indexOf('nomina') >= 0) return 'payroll';
    if (path.indexOf('gestion-comparativa') >= 0) return 'management';
    if (path.indexOf('presupuesto-control') >= 0) return 'budget';
    if (path.indexOf('licencias-control') >= 0) return 'leave';
    if (path.indexOf('ausentismo') >= 0) return 'absence';
    if (path.indexOf('calidad-operativa') >= 0) return 'quality';
    if (path.indexOf('asistente') >= 0 || path === '/ia' || path === '/ia-hf') return 'assistant';
    if (path.indexOf('internal') >= 0 || path === '/rrhh') return 'portal';
    return '';
  }

  function readState() {
    try {
      var parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeState() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function readNavigationExpanded() {
    try { return sessionStorage.getItem(NAV_STORAGE_KEY) === 'expanded'; } catch (_) { return false; }
  }

  function writeNavigationExpanded(expanded) {
    try { sessionStorage.setItem(NAV_STORAGE_KEY, expanded ? 'expanded' : 'collapsed'); } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  async function hydrateProductGuidance() {
    try {
      var module = await import('./product-guidance.js');
      var catalog = module.getProductGuidanceCatalog();
      var section = catalog.sections.find(function (item) { return item.id === page.sectionId; });
      if (!section) throw new Error('section_not_found');
      page.purpose = section.purpose;
      page.before = section.limits.join(' ');
      var taskSections = page.taskSectionIds || [page.sectionId];
      page.tasks = catalog.tasks
        .filter(function (task) { return taskSections.indexOf(task.sectionId) >= 0; })
        .map(function (task) { return [task.label, task.steps.join(' '), task.targetPath]; });
      page.assistantPrompt = 'Explicame ' + section.label + ' y guiame paso a paso para usar esta sección correctamente.';
      page.guidanceAsOf = catalog.asOf;
    } catch (_) {
      page.purpose = 'Esta guía contextual no pudo cargar el catálogo de producto. La pantalla operativa sigue disponible.';
      page.before = 'Consultá el Centro de aprendizaje o pedí orientación al Asistente antes de interpretar resultados.';
      page.tasks = [['Abrir el Centro de aprendizaje', 'Consultá el mapa de secciones y los recorridos verificados.', '/centro-ayuda']];
      page.assistantPrompt = 'Ayudame a usar esta pantalla de MuniControl.';
      page.guidanceAsOf = 'unavailable';
    }
  }

  function injectStyles() {
    if (document.getElementById('mcGuideStyles')) return;
    var style = document.createElement('style');
    style.id = 'mcGuideStyles';
    style.textContent = [
      '.mc-guide-button{min-height:44px;padding:8px 12px;border:1px solid #9fb1c1;border-radius:8px;background:#fff;color:#0b2940;font:750 12px/1.1 system-ui,sans-serif;cursor:pointer}',
      '.mc-guide-button:hover,.mc-guide-button:focus-visible{border-color:#0f766e;outline:3px solid rgba(15,118,110,.16);outline-offset:2px}',
      '.mc-guide-banner{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:18px 0;padding:14px 16px;border:1px solid #b9d8d3;border-left:4px solid #0f766e;border-radius:10px;background:#f3faf8;color:#102f3f;font:500 13px/1.45 system-ui,sans-serif}',
      '.mc-guide-banner strong{display:block;margin-bottom:2px;color:#082b3d;font-size:14px}.mc-guide-banner-actions{display:flex;gap:8px;flex:0 0 auto}.mc-guide-banner button{min-height:42px;padding:8px 12px;border:1px solid #8ca8a4;border-radius:7px;background:#fff;color:#0b2940;font-weight:750;cursor:pointer}.mc-guide-banner button:first-child{border-color:#0f766e;background:#0f766e;color:#fff}',
      '.mc-guide-backdrop{position:fixed;inset:0;z-index:2147483000;background:rgba(5,22,34,.42)}',
      '.mc-guide-drawer{position:fixed;z-index:2147483001;top:0;right:0;width:min(440px,100vw);height:100dvh;overflow:auto;background:#fff;color:#173042;box-shadow:-18px 0 50px rgba(7,29,45,.22);font:500 14px/1.5 system-ui,sans-serif}',
      '.mc-guide-drawer-head{position:sticky;top:0;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:24px 24px 18px;border-bottom:1px solid #dce5ea;background:#fff}.mc-guide-kicker{color:#0f766e;font-size:10px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}.mc-guide-drawer h2{margin:4px 0 0;color:#082b3d;font-size:24px;line-height:1.15}.mc-guide-close{width:44px;height:44px;border:1px solid #c6d2d9;border-radius:8px;background:#fff;color:#173042;font-size:22px;cursor:pointer}',
      '.mc-guide-body{padding:22px 24px 36px}.mc-guide-purpose{margin:0 0 18px;color:#344f5f}.mc-guide-note{padding:13px 14px;border-left:3px solid #b07b16;background:#fff9eb;color:#574316}.mc-guide-body h3{margin:24px 0 10px;color:#0b2940;font-size:15px}.mc-guide-task{display:block;margin:8px 0;padding:13px 14px;border:1px solid #d6e0e5;border-radius:9px;color:#16394a;text-decoration:none}.mc-guide-task:hover,.mc-guide-task:focus-visible{border-color:#0f766e;outline:3px solid rgba(15,118,110,.12)}.mc-guide-task strong{display:block;color:#082b3d}.mc-guide-task span{display:block;margin-top:3px;color:#5b7180;font-size:12px}.mc-guide-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:22px}.mc-guide-action{display:flex;align-items:center;justify-content:center;min-height:46px;padding:9px 12px;border:1px solid #0f766e;border-radius:8px;background:#fff;color:#0b554f;font-weight:800;text-align:center;text-decoration:none;cursor:pointer}.mc-guide-action.primary{background:#0f766e;color:#fff}.mc-guide-meta{margin-top:20px;padding-top:16px;border-top:1px solid #dce5ea;color:#657b88;font-size:11px}',
      '.mc-nav-more-toggle{width:100%;min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:10px;margin:5px 0;padding:9px 11px;color:#e7f0f3;background:rgba(255,255,255,.055);border:1px solid rgba(199,215,222,.38);border-radius:6px;font:800 12px/1.2 system-ui,sans-serif;text-align:left;cursor:pointer}.mc-nav-more-toggle:hover,.mc-nav-more-toggle:focus-visible{color:#fff;background:rgba(255,255,255,.11);border-color:rgba(255,255,255,.68);outline:3px solid rgba(39,181,165,.2);outline-offset:2px}.mc-nav-more-chevron{font-size:15px;transition:transform .16s ease}.mc-nav-more-toggle[aria-expanded="true"] .mc-nav-more-chevron{transform:rotate(180deg)}',
      '.mc-nav-progressive[data-mc-nav-expanded="false"] .mc-nav-secondary:not(.mc-nav-current),.mc-nav-progressive[data-mc-nav-expanded="false"] .mc-nav-secondary-group{display:none!important}',
      '.mc-explain-button{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;margin-left:8px;border:1px solid #9fb1c1;border-radius:50%;background:#fff;color:#0b554f;font:850 12px/1 system-ui,sans-serif;vertical-align:middle;cursor:pointer}.mc-explain-button:hover,.mc-explain-button:focus-visible{border-color:#0f766e;outline:3px solid rgba(15,118,110,.14)}',
      '.mc-guide-highlight{position:relative!important;z-index:2147483003!important;outline:4px solid #27b5a5!important;outline-offset:5px!important;border-radius:6px!important;background-color:#fff!important}',
      '.mc-tour-dim{position:fixed;inset:0;z-index:2147483002;background:rgba(4,18,29,.58)}.mc-tour-card{position:fixed;z-index:2147483004;width:min(360px,calc(100vw - 24px));padding:18px;border-radius:10px;background:#fff;color:#173042;box-shadow:0 18px 50px rgba(0,0,0,.25);font:500 13px/1.45 system-ui,sans-serif}.mc-tour-card strong{display:block;margin-bottom:5px;color:#082b3d;font-size:16px}.mc-tour-count{color:#0f766e;font-size:10px;font-weight:850;letter-spacing:.1em;text-transform:uppercase}.mc-tour-controls{display:flex;justify-content:space-between;gap:8px;margin-top:15px}.mc-tour-controls button{min-height:42px;padding:8px 12px;border:1px solid #9fb1c1;border-radius:7px;background:#fff;color:#123548;font-weight:750;cursor:pointer}.mc-tour-controls button:last-child{border-color:#0f766e;background:#0f766e;color:#fff}',
      '@media(max-width:680px){.mc-guide-banner{align-items:flex-start;flex-direction:column}.mc-guide-banner-actions{width:100%}.mc-guide-banner-actions button{flex:1}.mc-guide-drawer-head,.mc-guide-body{padding-left:18px;padding-right:18px}.mc-guide-actions{grid-template-columns:1fr}.mc-explain-button{width:36px;height:36px}.mc-tour-card{left:12px!important;right:12px!important;bottom:12px!important;top:auto!important;width:auto}}',
      '@media(prefers-reduced-motion:no-preference){.mc-guide-drawer{animation:mcGuideIn .18s ease-out}@keyframes mcGuideIn{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureNavigationLink() {
    var nav = document.querySelector('nav[aria-label="Navegación principal"]');
    if (!nav || nav.querySelector('a[href*="centro-ayuda"]')) return null;
    var link = document.createElement('a');
    link.href = 'centro-ayuda.html';
    if (nav.classList.contains('primary-nav')) link.className = 'nav-button';
    var codeClass = nav.classList.contains('primary-nav') ? 'nav-index' : 'nav-code';
    link.innerHTML = '<span class="' + codeClass + '" aria-hidden="true">AY</span><span>Ayuda</span>';
    nav.appendChild(link);
    return link;
  }

  function directChildren(node) {
    return node && node.children ? Array.prototype.slice.call(node.children) : [];
  }

  function directNavigationItems(node) {
    return directChildren(node).filter(function (child) {
      return child.matches && child.matches('a[href],button[data-view]');
    });
  }

  function groupPlan(container, label) {
    var items = directNavigationItems(container);
    var nestedItems = container.querySelectorAll('a[href],button[data-view]');
    if (!items.length || nestedItems.length !== items.length) return null;
    return { container: container, label: label || null, items: items };
  }

  function portalNavigationPlan(sidebar) {
    var direct = directChildren(sidebar);
    var primary = direct.filter(function (node) { return node.tagName === 'NAV' && node.classList.contains('primary-nav'); });
    var suite = direct.filter(function (node) { return node.tagName === 'NAV' && node.classList.contains('suite-links'); });
    if (primary.length !== 1 || suite.length !== 1) return null;
    var groups = [groupPlan(primary[0]), groupPlan(suite[0])];
    return groups.every(Boolean) ? { sidebar: sidebar, groups: groups, profile: 'portal' } : null;
  }

  function groupedNavigationPlan(sidebar) {
    var wrappers = directChildren(sidebar).filter(function (node) { return node.classList.contains('nav-wrap'); });
    if (wrappers.length !== 1) return null;
    var groupNodes = directChildren(wrappers[0]).filter(function (node) { return node.classList.contains('nav-group'); });
    if (groupNodes.length < 2) return null;
    var groups = groupNodes.map(function (node) { return groupPlan(node); });
    if (!groups.every(Boolean)) return null;
    var accounted = groups.reduce(function (total, group) { return total + group.items.length; }, 0);
    if (wrappers[0].querySelectorAll('a[href],button[data-view]').length !== accounted) return null;
    return { sidebar: sidebar, groups: groups, profile: 'grouped' };
  }

  function splitNavigationPlan(sidebar) {
    var navs = directChildren(sidebar).filter(function (node) {
      return node.tagName === 'NAV' && node.classList.contains('nav');
    });
    if (navs.length < 2) return null;
    var groups = navs.map(function (nav) {
      var label = nav.previousElementSibling;
      if (!label || !label.classList.contains('nav-label')) return null;
      return groupPlan(nav, label);
    });
    return groups.every(Boolean) ? { sidebar: sidebar, groups: groups, profile: 'split' } : null;
  }

  function navigationTargetKey(item) {
    var view = String(item.getAttribute('data-view') || '').trim().toLowerCase();
    if (view === 'inicio') return 'inicio';
    if (view === 'legajos') return 'personas';
    var href = item.getAttribute('href');
    if (!href) return view ? 'view:' + view : '';
    try {
      var url = new URL(href, document.baseURI || window.location.href);
      var file = url.pathname.split('/').pop().toLowerCase();
      var hash = url.hash.toLowerCase();
      if (file === 'internal-dashboard.html' || file === 'internal-dashboard' || file === 'rrhh') {
        return hash === '#legajos' ? 'personas' : (hash === '' || hash === '#inicio' ? 'inicio' : 'portal:' + hash);
      }
      if (file === 'centro-acciones.html' || file === 'centro-acciones') return 'acciones';
      return file + hash;
    } catch (_) {
      return '';
    }
  }

  function validateProgressiveNavigationPlan(plan) {
    if (!plan || !plan.groups || !plan.groups.length) return null;
    var items = plan.groups.reduce(function (all, group) { return all.concat(group.items); }, []);
    if (items.length < ESSENTIAL_NAV_KEYS.length + 1 || new Set(items).size !== items.length) return null;
    var keys = items.map(navigationTargetKey);
    for (var index = 0; index < ESSENTIAL_NAV_KEYS.length; index += 1) {
      if (keys[index] !== ESSENTIAL_NAV_KEYS[index]) return null;
      if (items[index].parentElement !== plan.groups[0].container) return null;
    }
    plan.items = items;
    plan.keys = keys;
    plan.insertionAfter = items[ESSENTIAL_NAV_KEYS.length - 1];
    return plan;
  }

  function inspectProgressiveNavigation() {
    var sidebars = document.querySelectorAll('aside.sidebar');
    if (sidebars.length !== 1 || sidebars[0].querySelector('[data-mc-nav-more-toggle]')) return null;
    var sidebar = sidebars[0];
    return validateProgressiveNavigationPlan(portalNavigationPlan(sidebar))
      || validateProgressiveNavigationPlan(groupedNavigationPlan(sidebar))
      || validateProgressiveNavigationPlan(splitNavigationPlan(sidebar));
  }

  function canonicalLocation(value) {
    try {
      var url = new URL(value, document.baseURI || window.location.href);
      var pathname = url.pathname.replace(/\/+$/, '').toLowerCase();
      var file = pathname.split('/').pop();
      var hash = url.hash.toLowerCase();
      if ((file === 'internal-dashboard.html' || file === 'internal-dashboard' || file === 'rrhh') && !hash) hash = '#inicio';
      return pathname + hash;
    } catch (_) {
      return '';
    }
  }

  function navigationItemIsCurrent(item) {
    if (item.getAttribute('aria-current') === 'page' || item.classList.contains('active') || item.classList.contains('is-active')) return true;
    var view = String(item.getAttribute('data-view') || '').trim().toLowerCase();
    if (view) return view === String(window.location.hash || '#inicio').replace(/^#/, '').toLowerCase();
    var href = item.getAttribute('href');
    return Boolean(href && canonicalLocation(href) === canonicalLocation(window.location.href));
  }

  function createMoreToolsButton() {
    var button = document.createElement('button');
    var label = document.createElement('span');
    var chevron = document.createElement('span');
    button.type = 'button';
    button.className = 'mc-nav-more-toggle';
    button.setAttribute('data-mc-nav-more-toggle', '');
    button.setAttribute('aria-label', 'Más herramientas');
    label.textContent = 'Más herramientas';
    chevron.className = 'mc-nav-more-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    button.append(label, chevron);
    return button;
  }

  function refreshProgressiveNavigation(plan) {
    plan.items.forEach(function (item) {
      item.classList.toggle('mc-nav-current', navigationItemIsCurrent(item));
    });
    plan.groups.forEach(function (group) {
      var onlySecondary = group.items.every(function (item) {
        return item.classList.contains('mc-nav-secondary') && !item.classList.contains('mc-nav-current');
      });
      group.container.classList.toggle('mc-nav-secondary-group', onlySecondary);
      if (group.label) group.label.classList.toggle('mc-nav-secondary-group', onlySecondary);
    });
  }

  function rollbackProgressiveNavigation(plan, button, injectedLink) {
    if (button && button.parentNode) button.parentNode.removeChild(button);
    if (injectedLink && injectedLink.parentNode) injectedLink.parentNode.removeChild(injectedLink);
    if (!plan) return;
    plan.items.forEach(function (item) { item.classList.remove('mc-nav-secondary', 'mc-nav-current'); });
    plan.groups.forEach(function (group) {
      group.container.classList.remove('mc-nav-secondary-group');
      if (group.label) group.label.classList.remove('mc-nav-secondary-group');
    });
    plan.sidebar.classList.remove('mc-nav-progressive');
    plan.sidebar.removeAttribute('data-mc-nav-expanded');
  }

  function setupProgressiveNavigation() {
    var initialPlan = inspectProgressiveNavigation();
    if (!initialPlan) return null;
    var injectedLink = ensureNavigationLink();
    var plan = inspectProgressiveNavigation();
    if (!plan) {
      if (injectedLink && injectedLink.parentNode) injectedLink.parentNode.removeChild(injectedLink);
      return null;
    }
    var button = createMoreToolsButton();
    try {
      plan.items.forEach(function (item, index) {
        if (index >= ESSENTIAL_NAV_KEYS.length) item.classList.add('mc-nav-secondary');
      });
      plan.insertionAfter.parentNode.insertBefore(button, plan.insertionAfter.nextSibling);
      plan.sidebar.classList.add('mc-nav-progressive');

      function setExpanded(expanded, remember) {
        plan.sidebar.setAttribute('data-mc-nav-expanded', expanded ? 'true' : 'false');
        button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        if (remember) writeNavigationExpanded(expanded);
        refreshProgressiveNavigation(plan);
      }

      button.addEventListener('click', function () {
        setExpanded(button.getAttribute('aria-expanded') !== 'true', true);
      });
      plan.sidebar.addEventListener('click', function () {
        window.setTimeout(function () { refreshProgressiveNavigation(plan); }, 0);
      });
      setExpanded(readNavigationExpanded(), false);
      return { refresh: function () { refreshProgressiveNavigation(plan); }, profile: plan.profile };
    } catch (_) {
      rollbackProgressiveNavigation(plan, button, injectedLink);
      return null;
    }
  }

  function ensureHeaderButton() {
    var actions = document.querySelector('.topbar-actions, .top-actions');
    if (!actions || actions.querySelector('[data-mc-open-guide]')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'mc-guide-button';
    button.setAttribute('data-mc-open-guide', '');
    button.textContent = 'Ayuda de esta pantalla';
    button.addEventListener('click', function () { openDrawer(); });
    actions.insertBefore(button, actions.firstChild);
  }

  function insertFirstVisitBanner() {
    state.seen = state.seen || {};
    if (state.seen[PAGE_KEY]) return;
    var main = document.querySelector('main');
    if (!main) return;
    var banner = document.createElement('section');
    banner.className = 'mc-guide-banner';
    banner.setAttribute('aria-label', 'Orientación inicial');
    banner.innerHTML = '<div><strong>¿Es tu primera vez en ' + escapeHtml(page.title) + '?</strong><span>Hacé un recorrido breve o consultá la explicación de esta pantalla.</span></div><div class="mc-guide-banner-actions"><button type="button" data-mc-tour>Iniciar recorrido</button><button type="button" data-mc-dismiss>Ahora no</button></div>';
    main.insertBefore(banner, main.firstChild);
    banner.querySelector('[data-mc-tour]').addEventListener('click', function () {
      acknowledgePage();
      banner.remove();
      startTour();
    });
    banner.querySelector('[data-mc-dismiss]').addEventListener('click', function () {
      acknowledgePage();
      banner.remove();
    });
  }

  function acknowledgePage() {
    state.seen = state.seen || {};
    state.seen[PAGE_KEY] = new Date().toISOString();
    writeState();
  }

  function addExplainButtons() {
    page.explain.forEach(function (item) {
      var target = document.querySelector(item[0]);
      if (!target || target.querySelector('.mc-explain-button')) return;
      var heading = target.matches('h1,h2,h3,header') ? target : target.querySelector('h1,h2,h3');
      if (!heading) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'mc-explain-button';
      button.setAttribute('aria-label', 'Explicar ' + item[1]);
      button.title = 'Explicar esta sección';
      button.textContent = '?';
      button.addEventListener('click', function () { openDrawer({ title: item[1], explanation: item[2] }); });
      heading.appendChild(button);
    });
  }

  function drawerMarkup(topic) {
    var title = topic && topic.title ? topic.title : page.title;
    var purpose = topic && topic.explanation ? topic.explanation : page.purpose;
    var tasks = page.tasks.map(function (task) {
      return '<a class="mc-guide-task" href="' + escapeHtml(task[2]) + '"><strong>' + escapeHtml(task[0]) + '</strong><span>' + escapeHtml(task[1]) + '</span></a>';
    }).join('');
    var prompt = topic && topic.title
      ? 'Explicame la sección ' + topic.title + ' de ' + page.title + ' y guiame para usarla correctamente.'
      : page.assistantPrompt;
    var aiHref = 'asistente.html?context=' + encodeURIComponent(PAGE_KEY) + '&prompt=' + encodeURIComponent(prompt);
    return '<div class="mc-guide-drawer-head"><div><span class="mc-guide-kicker">Ayuda contextual</span><h2 id="mcGuideTitle">' + escapeHtml(title) + '</h2></div><button class="mc-guide-close" type="button" aria-label="Cerrar ayuda">×</button></div>' +
      '<div class="mc-guide-body"><p class="mc-guide-purpose">' + escapeHtml(purpose) + '</p><div class="mc-guide-note"><strong>Antes de empezar:</strong> ' + escapeHtml(page.before) + '</div><h3>Tareas frecuentes</h3>' + tasks +
      '<div class="mc-guide-actions"><button class="mc-guide-action primary" type="button" data-mc-start-tour>Recorrer pantalla</button><a class="mc-guide-action" href="' + aiHref + '">Preguntar a la IA</a><a class="mc-guide-action" href="centro-ayuda.html">Centro de aprendizaje</a><button class="mc-guide-action" type="button" data-mc-complete>Marcar como aprendido</button></div>' +
      '<p class="mc-guide-meta">Guía de producto: ' + escapeHtml(page.guidanceAsOf) + '. El avance se conserva sólo durante esta sesión y no contiene datos personales.</p></div>';
  }

  function setBackgroundInert(enabled) {
    if (enabled) {
      inertedNodes = [];
      Array.prototype.forEach.call(document.body.children, function (node) {
        if (node === drawer || node === backdrop || node.classList.contains('mc-tour-dim') || node.classList.contains('mc-tour-card')) return;
        inertedNodes.push({ node: node, inert: Boolean(node.inert) });
        if ('inert' in node) node.inert = true;
      });
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return;
    }
    inertedNodes.forEach(function (entry) {
      if (entry.node && 'inert' in entry.node) entry.node.inert = entry.inert;
    });
    inertedNodes = [];
    document.body.style.overflow = previousBodyOverflow;
  }

  function focusableElements(root) {
    if (!root) return [];
    return Array.prototype.filter.call(root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'), function (node) {
      return node.getClientRects().length > 0 && node.getAttribute('aria-hidden') !== 'true';
    });
  }

  function trapFocus(event, root) {
    if (event.key !== 'Tab' || !root) return;
    var focusable = focusableElements(root);
    if (!focusable.length) {
      event.preventDefault();
      root.focus();
      return;
    }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (!root.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openDrawer(topic) {
    closeDrawer();
    lastFocus = document.activeElement;
    backdrop = document.createElement('div');
    backdrop.className = 'mc-guide-backdrop';
    backdrop.addEventListener('click', closeDrawer);
    drawer = document.createElement('aside');
    drawer.className = 'mc-guide-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'mcGuideTitle');
    drawer.setAttribute('tabindex', '-1');
    drawer.innerHTML = drawerMarkup(topic);
    document.body.append(backdrop, drawer);
    setBackgroundInert(true);
    drawer.querySelector('.mc-guide-close').addEventListener('click', closeDrawer);
    drawer.querySelector('[data-mc-start-tour]').addEventListener('click', function () { closeDrawer(); startTour(); });
    drawer.querySelector('[data-mc-complete]').addEventListener('click', function (event) {
      state.completed = state.completed || {};
      state.completed[PAGE_KEY] = new Date().toISOString();
      writeState();
      event.currentTarget.textContent = 'Aprendido';
      event.currentTarget.disabled = true;
    });
    drawer.querySelector('.mc-guide-close').focus();
  }

  function closeDrawer() {
    var focusTarget = lastFocus;
    setBackgroundInert(false);
    if (drawer) drawer.remove();
    if (backdrop) backdrop.remove();
    drawer = null;
    backdrop = null;
    lastFocus = null;
    if (focusTarget && focusTarget.isConnected && typeof focusTarget.focus === 'function') focusTarget.focus();
  }

  function availableSteps() {
    return page.tour.filter(function (item) {
      var target = document.querySelector(item[0]);
      return target && target.getClientRects().length > 0;
    });
  }

  function startTour() {
    closeTour(false);
    tourLastFocus = document.activeElement;
    tour = { steps: availableSteps() };
    if (!tour.steps.length) { tour = null; openDrawer(); return; }
    tourIndex = 0;
    showTourStep();
  }

  function showTourStep() {
    clearActiveTarget();
    var step = tour.steps[tourIndex];
    var target = document.querySelector(step[0]);
    if (!target) return nextTour();
    activeTarget = target;
    target.classList.add('mc-guide-highlight');
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    window.setTimeout(function () {
      if (!tour || !activeTarget) return;
      var dim = document.querySelector('.mc-tour-dim') || document.createElement('div');
      dim.className = 'mc-tour-dim';
      if (!dim.parentNode) document.body.appendChild(dim);
      var card = document.querySelector('.mc-tour-card') || document.createElement('section');
      card.className = 'mc-tour-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-label', 'Recorrido guiado');
      card.setAttribute('tabindex', '-1');
      var isLast = tourIndex === tour.steps.length - 1;
      card.innerHTML = '<span class="mc-tour-count">Paso ' + (tourIndex + 1) + ' de ' + tour.steps.length + '</span><strong>' + escapeHtml(step[1]) + '</strong><div>' + escapeHtml(step[2]) + '</div><div class="mc-tour-controls"><button type="button" data-mc-stop>Salir</button><button type="button" data-mc-next>' + (isLast ? 'Finalizar' : 'Siguiente') + '</button></div>';
      if (!card.parentNode) document.body.appendChild(card);
      if (!inertedNodes.length) setBackgroundInert(true);
      positionTourCard(card, activeTarget.getBoundingClientRect());
      card.querySelector('[data-mc-stop]').addEventListener('click', closeTour);
      card.querySelector('[data-mc-next]').addEventListener('click', nextTour);
      card.querySelector('[data-mc-next]').focus();
    }, 260);
  }

  function positionTourCard(card, rect) {
    if (window.innerWidth <= 680) return;
    var width = Math.min(360, window.innerWidth - 32);
    var left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.left));
    var top = rect.bottom + 14;
    if (top + 230 > window.innerHeight) top = Math.max(16, rect.top - 230);
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  function nextTour() {
    if (!tour) return;
    if (tourIndex >= tour.steps.length - 1) {
      state.completed = state.completed || {};
      state.completed[PAGE_KEY] = new Date().toISOString();
      writeState();
      closeTour();
      return;
    }
    tourIndex += 1;
    showTourStep();
  }

  function clearActiveTarget() {
    if (activeTarget) activeTarget.classList.remove('mc-guide-highlight');
    activeTarget = null;
  }

  function closeTour(restoreFocus) {
    var focusTarget = tourLastFocus;
    setBackgroundInert(false);
    clearActiveTarget();
    var dim = document.querySelector('.mc-tour-dim');
    var card = document.querySelector('.mc-tour-card');
    if (dim) dim.remove();
    if (card) card.remove();
    tour = null;
    tourIndex = -1;
    tourLastFocus = null;
    if (restoreFocus !== false) {
      if (!focusTarget || !focusTarget.isConnected) focusTarget = document.querySelector('[data-mc-open-guide]');
      if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
    }
  }

  function handleKeyboard(event) {
    if (drawer && event.key === 'Tab') {
      trapFocus(event, drawer);
      return;
    }
    if (tour && event.key === 'Tab') {
      trapFocus(event, document.querySelector('.mc-tour-card'));
      return;
    }
    if (event.key === 'Escape') {
      if (tour) closeTour();
      else if (drawer) closeDrawer();
      return;
    }
    if (event.key === '?' && !/input|textarea|select/i.test(document.activeElement && document.activeElement.tagName || '')) {
      event.preventDefault();
      openDrawer();
    }
  }

  async function init() {
    injectStyles();
    progressiveNavigation = setupProgressiveNavigation();
    await hydrateProductGuidance();
    ensureHeaderButton();
    insertFirstVisitBanner();
    addExplainButtons();
    document.addEventListener('keydown', handleKeyboard);
    window.addEventListener('hashchange', function () {
      window.setTimeout(function () {
        addExplainButtons();
        if (progressiveNavigation) progressiveNavigation.refresh();
      }, 80);
    });
    window.MuniControlGuide = { open: openDrawer, start: startTour, page: PAGE_KEY };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
  function sessionScope() {
    var identity = 'anonymous';
    try {
      var user = JSON.parse(sessionStorage.getItem('mjunin_user') || '{}');
      identity = String(user.email || user.name || 'anonymous').trim().toLowerCase();
    } catch (_) {}
    var hash = 2166136261;
    for (var index = 0; index < identity.length; index += 1) {
      hash ^= identity.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
