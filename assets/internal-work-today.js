(function (global) {
  'use strict';

  const CAPABILITY_PATTERN = /^[a-z][a-z0-9._-]{2,119}$/;
  const MODES = Object.freeze({
    prepare: Object.freeze({
      eyebrow: 'Mi trabajo hoy',
      title: 'Preparar y gestionar',
      summary: 'Tu sesión puede iniciar trabajo municipal y preparar controles para una revisión independiente.',
      badge: 'Modo de preparación',
      boundary: 'Cada alta o envío vuelve a validar alcance, versión y separación de funciones en el servidor.'
    }),
    decide: Object.freeze({
      eyebrow: 'Mi trabajo hoy',
      title: 'Revisar y decidir',
      summary: 'Tu sesión puede consultar evidencia y resolver únicamente los casos que el servidor habilite.',
      badge: 'Modo de aprobación',
      boundary: 'Entrar a una bandeja no aprueba nada: cada decisión exige abrir el caso y confirmar su versión vigente.'
    }),
    consult: Object.freeze({
      eyebrow: 'Mi trabajo hoy',
      title: 'Consultar y controlar',
      summary: 'Tu sesión dispone de lectura para analizar información y controlar circuitos sin modificar registros.',
      badge: 'Modo de consulta',
      boundary: 'Estos accesos son de lectura: no crean, envían, aprueban, rechazan ni cancelan registros.'
    })
  });

  const PREPARE_CAPABILITIES = Object.freeze([
    'leave.request.self.create',
    'leave.request.area.create',
    'leave.request.all.manage',
    'time.overtime.enter',
    'payroll.control_import.prepare',
    'payroll.novelty.prepare',
    'payroll.reprocessing.prepare',
    'payroll.monthly_close.prepare'
  ]);

  const DECIDE_CAPABILITIES = Object.freeze([
    'leave.request.area.decide',
    'leave.request.restricted.decide',
    'time.overtime.approve',
    'payroll.control_import.validate',
    'payroll.novelty.approve',
    'payroll.reprocessing.approve',
    'payroll.monthly_close.approve'
  ]);

  const CARDS = Object.freeze({
    prepare: Object.freeze([
      Object.freeze({
        key: 'actions',
        capabilities: Object.freeze([
          'leave.request.self.create', 'leave.request.area.create',
          'leave.request.all.manage', 'time.overtime.enter'
        ]),
        kicker: 'Solicitudes y tiempo',
        title: 'Preparar acciones municipales',
        description: 'Creá borradores de licencias o registrá mayor esfuerzo dentro del alcance confirmado.',
        action: 'Abrir Centro de acciones',
        href: 'centro-acciones.html'
      }),
      Object.freeze({
        key: 'novelties',
        capabilities: Object.freeze(['payroll.novelty.prepare']),
        kicker: 'Novedades de nómina',
        title: 'Preparar novedades',
        description: 'Validá una carga individual, rápida o masiva antes de enviarla al circuito trazable.',
        action: 'Abrir Novedades',
        href: 'novedades-nomina.html'
      }),
      Object.freeze({
        key: 'payroll',
        capabilities: Object.freeze([
          'payroll.control_import.prepare', 'payroll.reprocessing.prepare',
          'payroll.monthly_close.prepare', 'payroll.art_report.generate'
        ]),
        kicker: 'Control de nómina',
        title: 'Gestionar controles y cierres',
        description: 'Prepará importaciones, reprocesamientos, reportes ART o el cierre mensual gobernado.',
        action: 'Abrir Nómina',
        href: 'nomina-control.html'
      })
    ]),
    decide: Object.freeze([
      Object.freeze({
        key: 'actions',
        capabilities: Object.freeze([
          'leave.request.area.decide', 'leave.request.restricted.decide',
          'time.overtime.approve'
        ]),
        kicker: 'Solicitudes y tiempo',
        title: 'Revisar solicitudes',
        description: 'Consultá el expediente y resolvé sólo las decisiones habilitadas para tu sesión.',
        action: 'Revisar en Centro de acciones',
        href: 'centro-acciones.html'
      }),
      Object.freeze({
        key: 'novelties',
        capabilities: Object.freeze(['payroll.novelty.approve']),
        kicker: 'Novedades de nómina',
        title: 'Decidir novedades',
        description: 'Abrí lotes trazables, verificá su evidencia y decidí con control de versión.',
        action: 'Revisar Novedades',
        href: 'novedades-nomina.html'
      }),
      Object.freeze({
        key: 'payroll',
        capabilities: Object.freeze([
          'payroll.control_import.validate', 'payroll.reprocessing.approve',
          'payroll.monthly_close.approve'
        ]),
        kicker: 'Control de nómina',
        title: 'Decidir controles y cierres',
        description: 'Revisá importaciones, reprocesamientos y cierres que admitan una decisión independiente.',
        action: 'Revisar en Nómina',
        href: 'nomina-control.html'
      })
    ]),
    consult: Object.freeze([
      Object.freeze({
        key: 'people',
        capabilities: Object.freeze(['workforce.employee.read']),
        kicker: 'Personas',
        title: 'Consultar legajos',
        description: 'Buscá personas y revisá la información que la API autorice para tu alcance.',
        action: 'Consultar Personas',
        href: 'internal-dashboard.html#legajos'
      }),
      Object.freeze({
        key: 'actions',
        capabilities: Object.freeze(['actions.read']),
        kicker: 'Solicitudes y decisiones',
        title: 'Controlar expedientes',
        description: 'Consultá estados, historial y evidencia sin iniciar ni resolver operaciones.',
        action: 'Consultar Centro de acciones',
        href: 'centro-acciones.html'
      }),
      Object.freeze({
        key: 'novelties',
        capabilities: Object.freeze(['payroll.novelty.read']),
        kicker: 'Novedades de nómina',
        title: 'Consultar novedades',
        description: 'Revisá lotes, estados y evidencia disponible sin preparar ni decidir novedades.',
        action: 'Consultar Novedades',
        href: 'novedades-nomina.html'
      }),
      Object.freeze({
        key: 'payroll',
        capabilities: Object.freeze(['payroll.read']),
        kicker: 'Nómina',
        title: 'Controlar nómina',
        description: 'Revisá corridas, diagnósticos y circuitos gobernados en modo lectura.',
        action: 'Consultar Nómina',
        href: 'nomina-control.html'
      }),
      Object.freeze({
        key: 'reports',
        capabilities: Object.freeze(['workforce.summary.read', 'management.analytics.read']),
        kicker: 'Información agregada',
        title: 'Ver reportes RRHH',
        description: 'Abrí el informe agregado y sus exportaciones sin modificar datos operativos.',
        action: 'Ver Reportes RRHH',
        href: 'reportes-rrhh.html'
      })
    ])
  });

  function capabilities(value) {
    return new Set(Array.isArray(value)
      ? value.map((entry) => String(entry || '').trim()).filter((entry) => CAPABILITY_PATTERN.test(entry))
      : []);
  }

  function hasAny(available, required) {
    return required.some((capability) => available.has(capability));
  }

  function resolveMode(available) {
    if (hasAny(available, PREPARE_CAPABILITIES)) return 'prepare';
    if (hasAny(available, DECIDE_CAPABILITIES)) return 'decide';
    return 'consult';
  }

  function buildModel(access, roleLabel) {
    const contract = access && typeof access === 'object' ? access : {};
    const available = capabilities(contract.tenantCapabilities);
    const mode = resolveMode(available);
    const cards = CARDS[mode].filter((card) => hasAny(available, card.capabilities)).map((card) => ({
      key: card.key,
      kicker: card.kicker,
      title: card.title,
      description: card.description,
      action: card.action,
      href: card.href
    }));
    if (!cards.length) return null;
    return {
      mode,
      eyebrow: MODES[mode].eyebrow,
      title: MODES[mode].title,
      summary: MODES[mode].summary,
      badge: MODES[mode].badge,
      boundary: MODES[mode].boundary,
      roleLabel: String(roleLabel || '').trim(),
      cards
    };
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function appendText(documentRef, parent, tag, className, value) {
    const node = documentRef.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    parent.appendChild(node);
    return node;
  }

  function render(options) {
    const settings = options && typeof options === 'object' ? options : {};
    const root = settings.root;
    if (!root || typeof root.querySelector !== 'function') return null;
    const model = buildModel(settings.access, settings.roleLabel);
    root.hidden = true;
    root.removeAttribute('data-mode');
    if (!model) return null;

    const title = root.querySelector('[data-work-today-title]');
    const eyebrow = root.querySelector('[data-work-today-eyebrow]');
    const summary = root.querySelector('[data-work-today-summary]');
    const badge = root.querySelector('[data-work-today-badge]');
    const list = root.querySelector('[data-work-today-list]');
    const boundary = root.querySelector('[data-work-today-boundary]');
    if (!title || !eyebrow || !summary || !badge || !list || !boundary) return null;

    eyebrow.textContent = model.eyebrow;
    title.textContent = model.title;
    summary.textContent = model.summary;
    badge.textContent = model.roleLabel ? `${model.badge} · ${model.roleLabel}` : model.badge;
    boundary.textContent = model.boundary;
    clear(list);
    const documentRef = root.ownerDocument || global.document;
    model.cards.forEach((card) => {
      const link = documentRef.createElement('a');
      link.className = 'work-today-card';
      link.href = card.href;
      link.setAttribute('data-work-today-card', card.key);
      appendText(documentRef, link, 'span', 'work-today-card-kicker', card.kicker);
      appendText(documentRef, link, 'strong', '', card.title);
      appendText(documentRef, link, 'span', 'work-today-card-copy', card.description);
      appendText(documentRef, link, 'span', 'work-today-card-action', `${card.action} →`);
      list.appendChild(link);
    });
    root.dataset.mode = model.mode;
    root.hidden = false;
    return model;
  }

  global.MuniControlWorkToday = Object.freeze({ buildModel, render });
})(typeof window === 'undefined' ? globalThis : window);
