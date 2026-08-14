(function () {
  'use strict';

  var STORAGE_KEY = 'municontrol:screen-guide:v1:' + sessionScope();
  var PAGE_KEY = document.body.getAttribute('data-mc-page') || inferPage();
  var PAGES = {
    portal: {
      sectionId: 'inicio', taskSectionIds: ['personas', 'ausentismo', 'calidad'], title: 'Portal interno',
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

  function inferPage() {
    var path = window.location.pathname.toLowerCase();
    if (path.indexOf('estructura') >= 0 || path.indexOf('organigrama') >= 0) return 'structure';
    if (path.indexOf('integracion') >= 0) return 'integration';
    if (path.indexOf('nomina') >= 0) return 'payroll';
    if (path.indexOf('asistente') >= 0 || path === '/ia' || path === '/ia-hf') return 'assistant';
    if (path.indexOf('internal') >= 0 || path === '/rrhh' || path === '/admin') return 'portal';
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
    if (!nav || nav.querySelector('a[href*="centro-ayuda"]')) return;
    var link = document.createElement('a');
    link.href = 'centro-ayuda.html';
    if (nav.classList.contains('primary-nav')) link.className = 'nav-button';
    var codeClass = nav.classList.contains('primary-nav') ? 'nav-index' : 'nav-code';
    link.innerHTML = '<span class="' + codeClass + '" aria-hidden="true">AY</span><span>Ayuda</span>';
    nav.appendChild(link);
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
    await hydrateProductGuidance();
    injectStyles();
    ensureNavigationLink();
    ensureHeaderButton();
    insertFirstVisitBanner();
    addExplainButtons();
    document.addEventListener('keydown', handleKeyboard);
    window.addEventListener('hashchange', function () { window.setTimeout(addExplainButtons, 80); });
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
