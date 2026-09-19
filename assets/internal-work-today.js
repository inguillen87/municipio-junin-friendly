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
        title: 'Consultar solicitudes e historial',
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

  const DESTINATIONS=Object.freeze({
    'centro-acciones.html':['actions.read'], 'novedades-nomina.html':['payroll.novelty.read'],
    'nomina-control.html':['payroll.read'], 'internal-dashboard.html#legajos':['workforce.employee.read'],
    'reportes-rrhh.html':['workforce.summary.read','management.analytics.read'],
    'juridica-registro.html':['legal.norm.read'],'relojes-marcaciones.html':['attendance.read'],
    'nomina-control.html#parametros':['payroll.read'],'nomina-control.html#comparar':['payroll.read'],'presupuesto-control.html':['budget.approved.read']
  });
  const EXTRA=Object.freeze({prepare:[{key:'legal',capabilities:['legal.norm.register'],kicker:'Jurídica y Legislativa',title:'Registrar o corregir normas',description:'Incorporá documentos y artículos o registrá una nueva versión con fundamento.',action:'Abrir Registro normativo',href:'juridica-registro.html'}],decide:[],consult:[
    {key:'legal',capabilities:['legal.norm.read'],kicker:'Jurídica y Legislativa',title:'Consultar normas y comparar versiones',description:'Buscá por ficha o artículo y recuperá el documento de la versión exacta.',action:'Consultar Registro normativo',href:'juridica-registro.html'},
    {key:'clocks',capabilities:['attendance.read'],kicker:'Tiempo y asistencia',title:'Controlar recepción de relojes',description:'Revisá recepción, cobertura y vinculaciones. Una conexión no acredita asistencia.',action:'Consultar Relojes',href:'relojes-marcaciones.html'}
  ]});
  const FOCUSED=Object.freeze({prepare:[{key:'parameters',capabilities:['payroll.parameter.prepare'],all:['payroll.parameter.read'],kicker:'Contaduría · Parámetros',title:'Preparar parámetros salariales',description:'Guardá una propuesta fundamentada para su revisión independiente.',action:'Abrir Parámetros',href:'nomina-control.html#parametros'}],decide:[{key:'parameters',capabilities:['payroll.parameter.approve'],all:['payroll.parameter.read'],kicker:'Contaduría · Revisión',title:'Revisar parámetros propuestos',description:'Contrastá evidencia y versión antes de decidir; no se aprueba desde este acceso.',action:'Revisar Parámetros',href:'nomina-control.html#parametros'}],consult:[{key:'comparison',capabilities:['payroll.read'],kicker:'Liquidaciones · Comparación',title:'Comparar liquidaciones',description:'Revisá períodos, alcances y diferencias sin modificar corridas.',action:'Consultar Comparación',href:'nomina-control.html#comparar'},{key:'budget',capabilities:['budget.approved.read'],kicker:'Contaduría · Presupuesto',title:'Consultar presupuesto aprobado',description:'Consultá el crédito aprobado, sin confundirlo con ejecución o pagos.',action:'Consultar Presupuesto',href:'presupuesto-control.html'}]});
  const normalizeSearch=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  function buildModel(access, roleLabel, requestedMode=null, query='') {
    const contract=access&&typeof access==='object'?access:{};
    const available=capabilities(contract.tenantCapabilities);
    const byMode=Object.fromEntries(Object.keys(MODES).map(mode=>[mode,[...CARDS[mode],...EXTRA[mode],...FOCUSED[mode]]
      .filter(card=>hasAny(available,card.capabilities)&&(card.all||[]).every(c=>available.has(c))&&DESTINATIONS[card.href]&&hasAny(available,DESTINATIONS[card.href]))]));
    const platform=capabilities(contract.platformCapabilities),roles=Array.isArray(contract.platformRoles)?contract.platformRoles:[];
    if(roles.includes('PLATFORM_OWNER')&&['platform.tenants.manage','platform.users.invite','platform.users.manage','platform.roles.manage'].some(c=>platform.has(c)))byMode.consult.push({key:'administration',kicker:'Superadministración',title:'Administrar municipios, usuarios y roles',description:'Revisá la cartera y sus accesos. Este enlace no concede permisos ni modifica usuarios.',action:'Abrir Administración',href:'administracion-plataforma.html'});
    const modes=Object.keys(MODES).filter(mode=>byMode[mode].length);
    if(!modes.length)return null;
    const mode=modes.includes(requestedMode)?requestedMode:modes[0],terms=normalizeSearch(query).split(/\s+/).filter(Boolean);
    const all=byMode[mode];const cards=all.filter(c=>terms.every(t=>normalizeSearch(c.kicker+' '+c.title+' '+c.description).includes(t)))
      .map(({capabilities,all,...card})=>({...card}));
    return {mode,modes:modes.map(key=>({key,label:({prepare:'Preparar',decide:'Revisar',consult:'Consultar'})[key],count:byMode[key].length})),
      eyebrow:MODES[mode].eyebrow,title:MODES[mode].title,summary:MODES[mode].summary,badge:MODES[mode].badge,
      boundary:MODES[mode].boundary,roleLabel:String(roleLabel||'').trim(),cards,total:all.length,query:String(query).slice(0,120)};
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

  function renderOtherModes(root,settings,model){
    const doc=root.ownerDocument||global.document;
    if(typeof root.insertBefore!=='function')return;
    let host=root.querySelector('[data-work-today-other-modes]');
    if(!host){host=doc.createElement('div');host.className='work-today-other-modes';host.setAttribute('data-work-today-other-modes','');root.insertBefore(host,root.querySelector('[data-work-today-boundary]'));}
    clear(host);host.hidden=!model;
    if(!model)return;
    model.modes.filter(mode=>mode.key!==model.mode).forEach(mode=>{
      const other=buildModel(settings.access,settings.roleLabel,mode.key);
      const group=doc.createElement('details');group.className='work-today-other-mode';group.setAttribute('data-work-today-mode',mode.key);
      appendText(doc,group,'summary','',mode.label+' · '+other.total+' accesos disponibles');
      const list=doc.createElement('div');list.className='work-today-grid';
      other.cards.forEach(card=>{const link=doc.createElement('a');link.className='work-today-card';link.href=card.href;link.setAttribute('data-work-today-card',card.key);
        appendText(doc,link,'span','work-today-card-kicker',card.kicker);appendText(doc,link,'strong','',card.title);
        appendText(doc,link,'span','work-today-card-copy',card.description);appendText(doc,link,'span','work-today-card-action',card.action+' →');list.appendChild(link);});
      group.appendChild(list);host.appendChild(group);
    });
  }

  const workRoots=new WeakMap();
  function bindWorkAccess(root,settings){
    const doc=root.ownerDocument||global.document;if(typeof doc?.addEventListener!=='function')return;
    const previous=workRoots.get(root);if(previous){previous.settings=settings;return;}
    const state={settings};workRoots.set(root,state);
    const empty=()=>render({...state.settings,access:{tenantCapabilities:[]},roleLabel:'',mode:null,query:''});
    doc.getElementById('logoutButton')?.addEventListener('click',empty);
    global.addEventListener('pagehide',empty);
    doc.addEventListener('municontrol:capabilities-ready',event=>{
      const source=event.detail?.tenantCapabilities;
      const list=Array.isArray(source)?source:source instanceof Set?Array.from(source):[];
      const detail=event.detail||{};const items=v=>Array.isArray(v)?v:v instanceof Set?Array.from(v):[];render({...state.settings,access:{tenantCapabilities:list,platformCapabilities:items(detail.platformCapabilities),platformRoles:items(detail.platformRoles)}});
    });
    new MutationObserver(()=>{if(doc.documentElement.dataset.mcCapabilityState==='denied')empty();})
      .observe(doc.documentElement,{attributes:true,attributeFilter:['data-mc-capability-state']});
  }

  function render(options) {
    const settings = options && typeof options === 'object' ? options : {};
    const root = settings.root;
    if (!root || typeof root.querySelector !== 'function') return null;
    bindWorkAccess(root,settings);
    const model = buildModel(settings.access, settings.roleLabel, settings.mode, settings.query);
    root.hidden = true;
    root.removeAttribute('data-mode');
    if (!model) { clear(root.querySelector('[data-work-today-list]'));renderOtherModes(root,settings,null);return null; }

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
    boundary.textContent = model.boundary+' Los números indican accesos disponibles, no trámites pendientes.';
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
    renderOtherModes(root,settings,model);
    root.dataset.mode = model.mode;
    root.hidden = false;
    return model;
  }

  global.MuniControlWorkToday = Object.freeze({ buildModel, render });
})(typeof window === 'undefined' ? globalThis : window);
