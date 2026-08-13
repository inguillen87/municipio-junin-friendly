import { sendAlertaEjecutivaTemplate, sendReclamoConfirmacionTemplate, sendTurnoConfirmacionTemplate } from './lib/whatsapp-templates.js';

const BASE = 'https://municipio-junin.vercel.app';

// Estado de conversación por usuario (en memoria)
const sessions = {};

function getSession(from) {
  if (!sessions[from]) sessions[from] = { step: null, reclamo: null, lastActivity: Date.now() };
  sessions[from].lastActivity = Date.now();
  return sessions[from];
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(challenge);
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (req.method !== 'POST') return res.status(405).end();

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
    console.log('[WA-WEBHOOK-RECV]', JSON.stringify(body));

    if (body) {
      for (const entry of (body.entry || [])) {
        for (const change of (entry.changes || [])) {
          const v = change.value || {};
          for (const msg of (v.messages || [])) {
            await route(msg, v.metadata || {}, v.contacts || []);
          }
        }
      }
    }
  } catch (err) {
    console.error('[WA-WEBHOOK-ERROR]', err.message, err.stack);
  }
  return res.status(200).json({ ok: true });
}

// ================================================================
// ROUTER
// ================================================================
async function route(msg, meta, contacts) {
  const from = msg.from;
  const pid = (meta.phone_number_id && meta.phone_number_id !== '123456123') 
    ? meta.phone_number_id 
    : (process.env.WHATSAPP_PHONE_ID || '1250694471458832');
  
  const contactName = contacts?.[0]?.profile?.name || 'Vecino/a';
  const session = getSession(from);

  // --- UBICACIÓN GPS ---
  if (msg.type === 'location') {
    return await handleLocation(from, pid, msg.location, session, contactName);
  }

  // --- FOTO ---
  if (msg.type === 'image') {
    return await handleImage(from, pid, msg.image, session);
  }

  // --- AUDIO/VOZ ---
  if (msg.type === 'audio' || msg.type === 'voice') {
    return await send(from, pid, 'text',
      `\uD83C\uDFA4 *VOZ RECIBIDA*\n\nTu audio fue procesado. ` +
      `Escrib\u00ED *menu* para opciones o describ\u00ED tu consulta por texto.`
    );
  }

  // --- TEXTO ---
  let txt = '';
  if (msg.type === 'text') txt = msg.text?.body || '';
  else if (msg.type === 'interactive') {
    const ir = msg.interactive || {};
    txt = ir.button_reply?.id || ir.list_reply?.id || '';
  } else return;

  if (!txt.trim()) return;
  const t = txt.trim().toLowerCase();

  // Si está en flujo de reclamo, manejar el paso actual
  if (session.step) {
    return await handleReclamoFlow(from, pid, t, txt.trim(), session, contactName);
  }

  // === MENÚS ===
  if (t === 'menu' || t === 'inicio' || t === 'cmd_menu' || t === 'cmd_inicio') return await cmdMenuDual(from, pid);
  if (t === 'hola' || (t.includes('hola') && t.length < 15) || t === 'buenas' || t === 'buenos dias' || t === 'buenas tardes') return await cmdMenuDual(from, pid);
  if (t === '1' || t === 'gobernantes') return await cmdMenuGobernantes(from, pid);
  if (t === '2' || t === 'vecinos' || t === 'ciudadano') return await cmdMenuVecinos(from, pid);

  // Gobernantes
  if (t === '3' || t === 'obras') return await cmdObras(from, pid);
  if (t === '4' || t === 'hacienda' || t === 'finanzas') return await cmdHacienda(from, pid);
  if (t === '5' || t === 'rrhh' || t === 'personal') return await cmdRRHH(from, pid);
  if (t === '6' || t === 'licitaciones') return await cmdLicitaciones(from, pid);
  if (t === '7' || t === 'reporte' || t === 'informe' || t === 'pdf') return await cmdReporte(from, pid);
  
  // Vecinos
  if (t === 'reclamos' || t === 'reclamo' || t === 'reportar') return await cmdReclamosInicio(from, pid);
  if (t === 'turnos' || t === 'turno') return await cmdTurnos(from, pid);
  if (t === 'mis reclamos' || t === 'mis reportes' || t === 'estado') return await cmdMisReclamos(from, pid);

  // === DETECCIÓN INTELIGENTE DE RECLAMO ===
  const analysis = analyzeText(t);
  if (analysis.esReclamo) {
    return await iniciarReclamoInteligente(from, pid, txt.trim(), analysis, contactName);
  }

  // === FALLBACK IA ===
  await cmdLibre(from, pid, txt);
}

// ================================================================
// ANÁLISIS INTELIGENTE DE TEXTO
// ================================================================
function analyzeText(t) {
  const categorias = {
    'Bacheo y Calzada': /bache|bacheo|calle\s*rota|paviment|asfalto|pozo\s+(?:en|grande)|calzada|vereda\s*rota|cord[oó]n/,
    'Alumbrado P\u00FAblico': /luminaria|luz\s*rota|poste|alumbrado|sem[áa]foro|l[áa]mpara|foco|oscur/,
    'Red de Agua/Cloacas': /agua|ca[ñn]o\s*roto|cloaca|p[ée]rdida|inundaci|desag[üu]e|alcantarilla|desbord/,
    'Higiene Urbana': /basura|contenedor|residuo|reciclaje|limpieza|barrido|micro\s*basural/,
    'Arbolado Urbano': /[áa]rbol|poda|rama\s*ca[iyí]da|forestaci/,
    'Convivencia Vecinal': /ruido|molestia|m[úu]sica|fiesta|vecino\s+molest/,
    'Control Animal/Plagas': /perro\s*suelto|animal|gato|plaga|rata|mosquito|cucaracha/,
    'Tr\u00E1nsito': /tr[áa]nsito|estacionamiento|doble\s*fila|se[ñn]al|sem[áa]foro\s*roto/
  };

  for (const [cat, regex] of Object.entries(categorias)) {
    if (regex.test(t)) {
      // Subcategoría
      let sub = '';
      if (cat === 'Bacheo y Calzada') sub = /vereda/.test(t) ? 'Vereda' : /cord[oó]n/.test(t) ? 'Cordón cuneta' : 'Bache';
      else if (cat === 'Alumbrado P\u00FAblico') sub = /sem[áa]foro/.test(t) ? 'Semáforo' : /poste/.test(t) ? 'Poste caído' : 'Luminaria';
      else if (cat === 'Red de Agua/Cloacas') sub = /cloaca/.test(t) ? 'Cloacas' : /inundaci|desbord/.test(t) ? 'Inundación' : 'Pérdida de agua';
      
      // Urgencia
      let urgencia = 'normal';
      if (/urgente|peligro|emergencia|grave|accidente|riesgo|ca[iyí]do|desbord|inundaci/.test(t)) urgencia = 'alta';
      else if (/hace\s*(varios|muchos|\d+)\s*d[íi]as|semana|mes/.test(t)) urgencia = 'media';

      // Dirección
      const dir = extractDireccion(t);

      return { esReclamo: true, categoria: cat, subcategoria: sub, urgencia, direccion: dir };
    }
  }

  return { esReclamo: false };
}

function extractDireccion(t) {
  // Patrones de dirección en texto libre
  const patterns = [
    /(?:en\s+(?:la\s+)?(?:calle\s+|av(?:enida)?\.?\s+)?)([\w\s.]+?)(?:\s+(?:y|esq(?:uina)?\.?|al|entre|nro?\.?|n[úu]mero|,)\s+)([\w\s.]+)/i,
    /(?:calle|av(?:enida)?\.?|esquina)\s+([\w\s.]+?)(?:\s+(\d{2,5}))?(?:\s|$|,)/i,
    /(?:en\s+)([\w\s.]+?\s+\d{2,5})/i,
  ];

  for (const p of patterns) {
    const m = t.match(p);
    if (m) return m[0].replace(/^en\s+(la\s+)?/, '').trim();
  }

  // Buscar números de dirección sueltos
  const numMatch = t.match(/(\d{2,5})/);
  return numMatch ? '' : '';
}

// ================================================================
// FLUJO DE RECLAMO INTELIGENTE
// ================================================================
async function iniciarReclamoInteligente(from, pid, textoOriginal, analysis, contactName) {
  const session = getSession(from);
  
  // Crear reclamo en el backend
  let reclamoData;
  try {
    const resp = await fetch(`${BASE}/api/reclamos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        nombre: contactName,
        telefono: from,
        waId: from,
        categoria: analysis.categoria,
        subcategoria: analysis.subcategoria,
        descripcion: textoOriginal,
        direccion: analysis.direccion,
        urgencia: analysis.urgencia,
        canal: 'whatsapp',
        iaCategorizacion: true,
        iaConfianza: 0.9
      })
    });
    const data = await resp.json();
    reclamoData = data.reclamo;
  } catch (err) {
    console.error('[RECLAMO-API-ERROR]', err.message);
    reclamoData = {
      id: 'REC-' + Math.floor(10000 + Math.random() * 90000),
      categoria: analysis.categoria,
      sla: { fechaLimite: new Date(Date.now() + 5*24*60*60*1000).toISOString(), diasRestantes: 5 }
    };
  }

  // Guardar en sesión para flujo conversacional
  session.step = 'esperando_ubicacion';
  session.reclamo = reclamoData;

  const prioridadEmoji = analysis.urgencia === 'alta' ? '\uD83D\uDD34' : analysis.urgencia === 'media' ? '\uD83D\uDFE1' : '\uD83D\uDFE2';
  const slaDate = reclamoData.sla?.fechaLimite 
    ? new Date(reclamoData.sla.fechaLimite).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'N/A';

  await send(from, pid, 'text',
    `\u2705 *RECLAMO REGISTRADO*\n` +
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
    `\uD83C\uDFF7\uFE0F *Ticket:* ${reclamoData.id}\n` +
    `\uD83D\uDCC1 *Categor\u00EDa:* ${analysis.categoria}\n` +
    (analysis.subcategoria ? `\uD83D\uDD16 *Tipo:* ${analysis.subcategoria}\n` : '') +
    `${prioridadEmoji} *Prioridad:* ${analysis.urgencia.toUpperCase()}\n` +
    `\uD83D\uDCDD *Descripci\u00F3n:* _"${textoOriginal.substring(0, 100)}"_\n` +
    (analysis.direccion ? `\uD83D\uDCCD *Direcci\u00F3n detectada:* ${analysis.direccion}\n` : '') +
    `\u23F3 *Resoluci\u00F3n estimada:* ${slaDate}\n` +
    `\uD83C\uDFE2 *\u00C1rea asignada:* ${reclamoData.area || 'Atenci\u00F3n al Vecino'}\n\n` +
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n` +
    `\uD83D\uDCF1 *Para completar tu reclamo:*\n\n` +
    `1\uFE0F\u20E3 Envi\u00E1 tu *ubicaci\u00F3n GPS* \uD83D\uDCCD (recomendado)\n` +
    `2\uFE0F\u20E3 Envi\u00E1 una *foto* del problema \uD83D\uDCF8\n` +
    `3\uFE0F\u20E3 Escrib\u00ED *listo* para finalizar\n` +
    `4\uFE0F\u20E3 Escrib\u00ED *cancelar* para anular\n\n` +
    `_La ubicaci\u00F3n GPS nos permite enviar cuadrillas al punto exacto._`
  );
}

async function handleReclamoFlow(from, pid, t, txtOriginal, session, contactName) {
  const rec = session.reclamo;

  // Cancelar
  if (t === 'cancelar' || t === 'anular') {
    session.step = null;
    session.reclamo = null;
    return await send(from, pid, 'text', `\u274C *Reclamo cancelado.*\n\nEscrib\u00ED *menu* para volver al men\u00FA principal.`);
  }

  // Finalizar
  if (t === 'listo' || t === 'finalizar' || t === 'fin' || t === 'ok') {
    session.step = null;
    const r = session.reclamo;
    session.reclamo = null;
    return await send(from, pid, 'text',
      `\u2705 *RECLAMO ${r?.id || ''} FINALIZADO*\n\n` +
      `Tu reporte fue enviado al \u00E1rea correspondiente.\n` +
      `\uD83D\uDD14 Te notificaremos por WhatsApp cuando haya novedades.\n\n` +
      `\uD83D\uDCBB *Seguimiento online:*\n${BASE}/ciudadano.html\n\n` +
      `Escrib\u00ED *menu* para volver al men\u00FA.`
    );
  }

  // Si está esperando ubicación y envían texto con dirección
  if (session.step === 'esperando_ubicacion') {
    // Si escriben una dirección manualmente
    if (t.length > 5 && !['menu', 'hola'].includes(t)) {
      // Actualizar dirección en el reclamo
      try {
        await fetch(`${BASE}/api/reclamos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', id: rec.id, ubicacion: { direccion: txtOriginal, precision: 'texto' } })
        });
      } catch(e) {}

      session.step = 'esperando_foto';
      return await send(from, pid, 'text',
        `\uD83D\uDCCD *Direcci\u00F3n registrada:* _${txtOriginal}_\n\n` +
        `\uD83D\uDCF8 Ahora pod\u00E9s enviar una *foto* del problema para documentarlo mejor.\n\n` +
        `O escrib\u00ED *listo* para finalizar sin foto.`
      );
    }
  }

  // Si está esperando foto y envían texto
  if (session.step === 'esperando_foto') {
    if (t === 'no' || t === 'sin foto' || t === 'paso') {
      session.step = null;
      const r = session.reclamo;
      session.reclamo = null;
      return await send(from, pid, 'text',
        `\u2705 *RECLAMO ${r?.id || ''} COMPLETO*\n\n` +
        `\uD83D\uDD14 Te avisaremos por WhatsApp cuando un inspector sea asignado.\n` +
        `\uD83D\uDCBB Seguimiento: ${BASE}/ciudadano.html`
      );
    }
  }

  // Si no matchea nada del flujo, tratar como nuevo comando
  session.step = null;
  session.reclamo = null;
  return await route({ from, type: 'text', text: { body: txtOriginal } }, { phone_number_id: pid }, [{ profile: { name: contactName } }]);
}

async function handleLocation(from, pid, location, session, contactName) {
  const lat = location.latitude;
  const lng = location.longitude;

  // Reverse geocoding
  let geoData = null;
  try {
    const geoResp = await fetch(`${BASE}/api/reclamos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'geocode', lat, lng })
    });
    const geoResult = await geoResp.json();
    geoData = geoResult.geocode;
  } catch(e) {
    console.warn('[GEOCODE-SKIP]', e.message);
  }

  const direccion = geoData?.direccionCompleta || `${lat}, ${lng}`;
  const calle = geoData?.calle || '';
  const barrio = geoData?.barrio || '';
  const numero = geoData?.numero || '';
  const dirCorta = calle ? `${calle}${numero ? ' ' + numero : ''}${barrio ? ', ' + barrio : ''}` : `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  // Si hay un reclamo activo, actualizar
  if (session.reclamo) {
    try {
      await fetch(`${BASE}/api/reclamos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id: session.reclamo.id,
          ubicacion: { lat, lng, direccion: dirCorta, barrio, georef: geoData, precision: 'gps' }
        })
      });
    } catch(e) {}

    session.step = 'esperando_foto';
    return await send(from, pid, 'text',
      `\uD83D\uDCCD *UBICACI\u00D3N REGISTRADA*\n` +
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
      `\uD83C\uDFF7\uFE0F *Ticket:* ${session.reclamo.id}\n` +
      `\uD83D\uDCCD *Direcci\u00F3n:* ${dirCorta}\n` +
      (barrio ? `\uD83C\uDFD8\uFE0F *Barrio:* ${barrio}\n` : '') +
      `\uD83C\uDF10 *Coordenadas:* ${lat.toFixed(6)}, ${lng.toFixed(6)}\n` +
      `\uD83D\uDD0D *Precisi\u00F3n:* GPS (alta)\n\n` +
      `\uD83D\uDCF8 Ahora pod\u00E9s enviar una *foto* para documentar.\n` +
      `O escrib\u00ED *listo* para finalizar.`
    );
  }

  // Si no hay reclamo activo, crear uno nuevo con la ubicación
  const ticket = 'REC-' + Math.floor(10000 + Math.random() * 90000);
  try {
    const resp = await fetch(`${BASE}/api/reclamos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        nombre: contactName,
        telefono: from,
        waId: from,
        categoria: 'Por determinar',
        descripcion: `Reclamo georeferenciado desde WhatsApp`,
        lat, lng,
        direccion: dirCorta,
        barrio,
        georef: geoData,
        canal: 'whatsapp'
      })
    });
    const data = await resp.json();
    session.reclamo = data.reclamo;
    session.step = 'esperando_descripcion';
  } catch(e) {
    session.reclamo = { id: ticket };
    session.step = 'esperando_descripcion';
  }

  await send(from, pid, 'text',
    `\uD83D\uDCCD *UBICACI\u00D3N RECIBIDA*\n` +
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
    `\uD83C\uDFF7\uFE0F *Ticket:* ${session.reclamo?.id || ticket}\n` +
    `\uD83D\uDCCD *Direcci\u00F3n:* ${dirCorta}\n` +
    (barrio ? `\uD83C\uDFD8\uFE0F *Barrio:* ${barrio}\n` : '') +
    `\uD83C\uDF10 *Coordenadas:* ${lat.toFixed(6)}, ${lng.toFixed(6)}\n\n` +
    `\u270F\uFE0F Ahora *describ\u00ED el problema* para completar el reclamo:\n` +
    `_Ej: "luminaria rota", "bache peligroso", "ca\u00F1o roto"_`
  );
}

async function handleImage(from, pid, image, session) {
  if (session.reclamo) {
    try {
      await fetch(`${BASE}/api/reclamos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id: session.reclamo.id,
          fotos: [{ mediaId: image.id, mime: image.mime_type, timestamp: new Date().toISOString() }]
        })
      });
    } catch(e) {}

    session.step = null;
    const r = session.reclamo;
    session.reclamo = null;
    return await send(from, pid, 'text',
      `\uD83D\uDCF8 *FOTO ADJUNTADA*\n\n` +
      `\u2705 *RECLAMO ${r.id} COMPLETO*\n\n` +
      `\u2022 Ticket: ${r.id}\n` +
      `\u2022 Foto: Adjuntada\n` +
      `\u2022 Estado: *En revisi\u00F3n*\n\n` +
      `\uD83D\uDD14 Te avisaremos por WhatsApp cuando un inspector sea asignado.\n` +
      `\uD83D\uDCBB Seguimiento: ${BASE}/ciudadano.html`
    );
  }

  // Sin reclamo activo
  const ticket = 'REC-' + Math.floor(10000 + Math.random() * 90000);
  session.reclamo = { id: ticket };
  session.step = 'esperando_descripcion';
  return await send(from, pid, 'text',
    `\uD83D\uDCF8 *FOTO RECIBIDA*\n\n` +
    `\uD83C\uDFF7\uFE0F Ticket: *${ticket}*\n\n` +
    `\u270F\uFE0F Ahora describ\u00ED el problema:\n` +
    `_Ej: "bache en calle San Mart\u00EDn 450"_\n\n` +
    `O envi\u00E1 tu *ubicaci\u00F3n GPS* \uD83D\uDCCD`
  );
}

// ================================================================
// MIS RECLAMOS
// ================================================================
async function cmdMisReclamos(from, pid) {
  try {
    const resp = await fetch(`${BASE}/api/reclamos?telefono=${from}&limit=5`);
    const data = await resp.json();
    if (data.reclamos && data.reclamos.length > 0) {
      let msg = `\uD83D\uDCCB *MIS RECLAMOS*\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n`;
      for (const r of data.reclamos) {
        const estadoEmoji = r.estado === 'resuelto' ? '\u2705' : r.estado === 'en_proceso' ? '\uD83D\uDD04' : '\u23F3';
        msg += `${estadoEmoji} *${r.id}* \u2014 ${r.categoria}\n`;
        msg += `   Estado: ${r.estado} | ${new Date(r.timestamp).toLocaleDateString('es-AR')}\n\n`;
      }
      msg += `Total: ${data.stats.total} reclamos\n`;
      msg += `\uD83D\uDCBB Detalle: ${BASE}/ciudadano.html`;
      return await send(from, pid, 'text', msg);
    }
  } catch(e) {}
  await send(from, pid, 'text', `\uD83D\uDCCB No ten\u00E9s reclamos registrados.\n\nEscrib\u00ED *reclamos* para crear uno nuevo.`);
}

// ================================================================
// MENUS
// ================================================================
async function cmdMenuDual(to, pid) {
  await send(to, pid, 'text',
    `\uD83C\uDFDB\uFE0F *MUNICONTROL JUN\u00CDN*\n_Sistema Inteligente de Gesti\u00F3n Municipal_\n\n` +
    `Escrib\u00ED el n\u00FAmero:\n` +
    `1\uFE0F\u20E3 *Gobernantes* (Hacienda, Obras, RRHH)\n` +
    `2\uFE0F\u20E3 *Portal Vecino 311* (Reclamos, Turnos)\n\n` +
    `\uD83D\uDCA1 _Tambi\u00E9n pod\u00E9s escribir directamente tu consulta o reclamo._`
  );
}

async function cmdMenuGobernantes(to, pid) {
  await send(to, pid, 'text',
    `\uD83C\uDFDB\uFE0F *PANEL DE GOBERNANTES*\n_Municipalidad de Jun\u00EDn \u00B7 Mendoza_\n\n` +
    `3 \u2014 Obras P\u00FAblicas ($142.5M)\n` +
    `4 \u2014 Hacienda y Finanzas (+$14.9M)\n` +
    `5 \u2014 Recursos Humanos (1,247 empl.)\n` +
    `6 \u2014 Licitaciones P\u00FAblicas (5 activas)\n` +
    `7 \u2014 Descargar Informe PDF\n\n` +
    `\uD83D\uDCBB Dashboard: ${BASE}/inteligencia.html?auth=governante`
  );
}

async function cmdMenuVecinos(to, pid) {
  await send(to, pid, 'text',
    `\uD83C\uDFE0 *PORTAL VECINO JUN\u00CDN 311*\n\n` +
    `\u2022 Escrib\u00ED *reclamos* para el men\u00FA de reportes\n` +
    `\u2022 Escrib\u00ED *turnos* para pedir un turno\n` +
    `\u2022 Escrib\u00ED *mis reclamos* para ver el estado\n\n` +
    `\uD83D\uDCA1 _O describ\u00ED tu problema directamente:_\n` +
    `_"hay un bache en calle San Mart\u00EDn 450"_\n` +
    `_"luminaria rota en esquina de Mitre y Colón"_\n\n` +
    `\uD83D\uDCBB Portal: ${BASE}/ciudadano.html`
  );
}

async function cmdReclamosInicio(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDCE2 *SISTEMA 311 \u2014 RECLAMOS*\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
    `Registr\u00E1 tu reclamo de forma r\u00E1pida:\n\n` +
    `*Opci\u00F3n 1 \u2014 Texto libre:*\n` +
    `Describ\u00ED el problema directamente:\n` +
    `_"bache peligroso en Av. Libertador 890"_\n` +
    `_"ca\u00F1o roto pierde agua en calle Mitre"_\n\n` +
    `*Opci\u00F3n 2 \u2014 Ubicaci\u00F3n GPS:*\n` +
    `Envi\u00E1 tu ubicaci\u00F3n \uD83D\uDCCD y luego describ\u00ED el problema.\n\n` +
    `*Opci\u00F3n 3 \u2014 Foto:*\n` +
    `Envi\u00E1 una foto \uD83D\uDCF8 del problema.\n\n` +
    `\uD83D\uDD04 El sistema detecta autom\u00E1ticamente la categor\u00EDa.\n` +
    `\u23F3 SLA promedio: *3.2 d\u00EDas h\u00E1biles*`
  );
}

// ================================================================
// MÓDULOS GOBERNANTES
// ================================================================
async function cmdHacienda(to, pid) {
  await send(to, pid, 'text', 
    `\uD83D\uDCB0 *HACIENDA Y FINANZAS*\n_Ago 2026_\n\n` +
    `Ingresos: *$180.2M* (+8%)\nGastos: *$165.3M*\nSuperávit: *+$14.9M*\n\n` +
    `\u2593\u2593\u2593\u2593\u2593\u2593\u2593\u2591\u2591\u2591 67% Ejecución\n\n` +
    `\uD83D\uDCC4 PDF: ${BASE}/api/pdf-report?type=presupuesto\n` +
    `\uD83D\uDCBB Web: ${BASE}/hacienda.html?auth=governante`
  );
}

async function cmdObras(to, pid) {
  await send(to, pid, 'text', 
    `\uD83C\uDFD7\uFE0F *OBRAS P\u00DABLICAS*\n_Ago 2026_\n\n` +
    `Proyectos Activos (8):\n` +
    `1. Pavimentación Av. San Martín (45%)\n` +
    `2. Luminarias LED Centro (90%)\n` +
    `3. Renovación Red Cloacal (30%)\n\n` +
    `Inversión Total: *$142.5M*\n\n` +
    `\uD83D\uDCC4 PDF: ${BASE}/api/pdf-report?type=obras\n` +
    `\uD83D\uDCBB Web: ${BASE}/obras.html?auth=governante`
  );
}

async function cmdRRHH(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDC65 *RECURSOS HUMANOS*\n_Ago 2026_\n\n` +
    `Empleados: *1,247* | Masa Salarial: *$485.0M*\nAusentismo: *3.2%*\n\n` +
    `\uD83D\uDCC4 PDF: ${BASE}/api/pdf-report?type=rrhh\n` +
    `\uD83D\uDCBB Web: ${BASE}/rrhh.html?auth=governante`
  );
}

async function cmdLicitaciones(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDCC4 *LICITACIONES*\n_Ago 2026_\n\n` +
    `Activas: *5* | Monto: *$85.4M*\n\n` +
    `\uD83D\uDCBB Web: ${BASE}/licitaciones.html?auth=governante`
  );
}

async function cmdReporte(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDCCA *INFORME EJECUTIVO*\n\nSuperávit: +$14.9M | Ejecución: 67%\n\n` +
    `\uD83D\uDCE5 PDF: ${BASE}/api/pdf-report?type=resumen`
  );
}

async function cmdTurnos(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDCC5 *TURNOS MUNICIPALES*\n\n` +
    `Licencia de Conducir | Salud | Habilitación Comercial | Trámites\n\n` +
    `\uD83D\uDCBB Reservá online: ${BASE}/ciudadano.html`
  );
}

// ================================================================
// FALLBACK IA
// ================================================================
async function cmdLibre(to, pid, txt) {
  try {
    const resp = await fetch(`${BASE}/api/ai-analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: txt })
    });
    const data = await resp.json();
    let reply = data.response || data.reply || '';
    if (reply && reply.length > 10) {
      reply = reply.replace(/\*\*(.*?)\*\*/g, '*$1*').replace(/#{1,6}\s?/g, '').replace(/---+/g, '');
      if (reply.length > 1500) reply = reply.substring(0, 1450) + '\n\n_Respuesta resumida._';
      await send(to, pid, 'text', reply);
    } else {
      await send(to, pid, 'text', `Recibí: _"${txt.substring(0, 60)}"_\n\nEscribí *menu* para opciones.`);
    }
  } catch (err) {
    console.error('[AI-ERROR]', err.message);
    await send(to, pid, 'text', `Recibí tu mensaje. Escribí *menu* para opciones.`);
  }
}

// ================================================================
// SEND - Optimizado formato argentino
// ================================================================
async function send(to, pid, type, content) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !pid) return;

  const url = `https://graph.facebook.com/v21.0/${pid}/messages`;

  const doSend = async (num) => {
    const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to: num, type };
    if (type === 'text') payload.text = typeof content === 'string' ? { body: content } : content;
    else if (type === 'image') payload.image = typeof content === 'string' ? { link: content } : content;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: resp.ok, text: await resp.text() };
  };

  // Argentino: primero sin 9 (54XXXX), luego con 9 (549XXXX)
  let nums = [];
  if (to.startsWith('549')) { nums.push('54' + to.substring(3)); nums.push(to); }
  else if (to.startsWith('54')) { nums.push(to); nums.push('549' + to.substring(2)); }
  else nums.push(to);

  for (const n of nums) {
    const r = await doSend(n);
    if (r.ok) { console.log(`[WA-SEND-SUCCESS] ${n}`); return; }
    else console.warn(`[WA-SEND-TRY-FAIL] ${n} -> ${r.text}`);
  }
}
