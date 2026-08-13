// API de Reclamos - CRUD + Geolocalización + IA
// Almacena reclamos en memoria + archivo JSON persistente via KV

const reclamos = [];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const action = body.action || 'create';

    if (action === 'create') {
      const reclamo = {
        id: 'REC-' + Math.floor(10000 + Math.random() * 90000),
        timestamp: new Date().toISOString(),
        vecino: {
          nombre: body.nombre || 'Vecino/a',
          telefono: body.telefono || '',
          waId: body.waId || ''
        },
        categoria: body.categoria || 'General',
        subcategoria: body.subcategoria || '',
        descripcion: body.descripcion || '',
        ubicacion: {
          direccion: body.direccion || '',
          barrio: body.barrio || '',
          lat: body.lat || null,
          lng: body.lng || null,
          georef: body.georef || null,
          precision: body.precision || 'manual'
        },
        prioridad: calcularPrioridad(body),
        estado: 'pendiente',
        asignado: null,
        area: mapCategoriaTArea(body.categoria),
        fotos: body.fotos || [],
        historial: [{
          fecha: new Date().toISOString(),
          evento: 'Reclamo creado via WhatsApp',
          detalle: `Categoría: ${body.categoria}. ${body.descripcion?.substring(0, 100) || ''}`
        }],
        sla: {
          fechaLimite: calcularSLA(body.categoria),
          diasRestantes: 5,
          enRiesgo: false
        },
        metadata: {
          canal: body.canal || 'whatsapp',
          version: '2.0',
          iaCategorizacion: body.iaCategorizacion || false,
          iaConfianza: body.iaConfianza || null
        }
      };

      reclamos.push(reclamo);
      console.log('[RECLAMO-CREATED]', JSON.stringify(reclamo));
      return res.status(201).json({ ok: true, reclamo });
    }

    if (action === 'update') {
      const rec = reclamos.find(r => r.id === body.id);
      if (!rec) return res.status(404).json({ error: 'Reclamo no encontrado' });

      if (body.ubicacion) {
        rec.ubicacion = { ...rec.ubicacion, ...body.ubicacion };
        rec.historial.push({
          fecha: new Date().toISOString(),
          evento: 'Ubicación actualizada',
          detalle: body.ubicacion.direccion || `GPS: ${body.ubicacion.lat}, ${body.ubicacion.lng}`
        });
      }
      if (body.fotos) {
        rec.fotos.push(...body.fotos);
        rec.historial.push({
          fecha: new Date().toISOString(),
          evento: 'Foto adjuntada',
          detalle: `${body.fotos.length} imagen(es) agregada(s)`
        });
      }
      if (body.estado) {
        rec.estado = body.estado;
        rec.historial.push({
          fecha: new Date().toISOString(),
          evento: `Estado cambiado a: ${body.estado}`,
          detalle: body.detalle || ''
        });
      }

      return res.status(200).json({ ok: true, reclamo: rec });
    }

    if (action === 'geocode') {
      const geo = await reverseGeocode(body.lat, body.lng);
      return res.status(200).json({ ok: true, geocode: geo });
    }

    if (action === 'analyze') {
      const analysis = analyzeReclamoText(body.texto);
      return res.status(200).json({ ok: true, analysis });
    }
  }

  if (req.method === 'GET') {
    const { id, telefono, estado, limit } = req.query;
    let results = [...reclamos];

    if (id) results = results.filter(r => r.id === id);
    if (telefono) results = results.filter(r => r.vecino.telefono === telefono || r.vecino.waId === telefono);
    if (estado) results = results.filter(r => r.estado === estado);

    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (limit) results = results.slice(0, parseInt(limit));

    return res.status(200).json({ 
      ok: true, 
      total: results.length,
      reclamos: results,
      stats: {
        total: reclamos.length,
        pendientes: reclamos.filter(r => r.estado === 'pendiente').length,
        enProceso: reclamos.filter(r => r.estado === 'en_proceso').length,
        resueltos: reclamos.filter(r => r.estado === 'resuelto').length
      }
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ================================================================
// REVERSE GEOCODING - OpenStreetMap Nominatim
// ================================================================
async function reverseGeocode(lat, lng) {
  if (!lat || !lng) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=es`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'MuniControl-Junin/2.0 (municipio-junin.vercel.app)' }
    });
    const data = await resp.json();
    const addr = data.address || {};
    
    return {
      direccionCompleta: data.display_name || '',
      calle: addr.road || addr.pedestrian || addr.highway || '',
      numero: addr.house_number || '',
      barrio: addr.suburb || addr.neighbourhood || addr.quarter || '',
      ciudad: addr.city || addr.town || addr.village || 'Junín',
      provincia: addr.state || 'Mendoza',
      codigoPostal: addr.postcode || '',
      tipo: data.type || '',
      confianza: data.place_rank ? (data.place_rank > 25 ? 'alta' : data.place_rank > 20 ? 'media' : 'baja') : 'desconocida'
    };
  } catch (err) {
    console.error('[GEOCODE-ERROR]', err.message);
    return { error: err.message, direccionCompleta: `${lat}, ${lng}` };
  }
}

// ================================================================
// ANÁLISIS INTELIGENTE DE TEXTO
// ================================================================
function analyzeReclamoText(texto) {
  if (!texto) return { categoria: 'General', subcategoria: '', urgencia: 'normal', direccion: '' };

  const t = texto.toLowerCase();

  // Detectar categoría
  let categoria = 'General';
  let subcategoria = '';
  
  if (/bache|bacheo|calle\s*rota|paviment|asfalto|pozo|calzada|vereda\s*rota/.test(t)) {
    categoria = 'Bacheo y Calzada';
    if (/vereda/.test(t)) subcategoria = 'Vereda';
    else if (/bache|pozo/.test(t)) subcategoria = 'Bache';
    else subcategoria = 'Pavimento';
  } else if (/luminaria|luz\s*rota|poste|alumbrado|sem[áa]foro|l[áa]mpara|foco/.test(t)) {
    categoria = 'Alumbrado Público';
    if (/sem[áa]foro/.test(t)) subcategoria = 'Semáforo';
    else if (/poste/.test(t)) subcategoria = 'Poste';
    else subcategoria = 'Luminaria';
  } else if (/agua|ca[ñn]o|cloaca|p[ée]rdida|inundaci|desag[üu]e|alcantarilla/.test(t)) {
    categoria = 'Red de Agua/Cloacas';
    if (/cloaca/.test(t)) subcategoria = 'Cloacas';
    else if (/inundaci/.test(t)) subcategoria = 'Inundación';
    else subcategoria = 'Agua Potable';
  } else if (/basura|contenedor|residuo|reciclaje|limpieza|barrido/.test(t)) {
    categoria = 'Higiene Urbana';
    subcategoria = /contenedor/.test(t) ? 'Contenedor' : 'Limpieza';
  } else if (/[áa]rbol|poda|rama|forestaci/.test(t)) {
    categoria = 'Arbolado Urbano';
    subcategoria = /poda|rama/.test(t) ? 'Poda' : 'Arbolado';
  } else if (/ruido|molestia|vecino|música|musica|fiesta/.test(t)) {
    categoria = 'Convivencia Vecinal';
    subcategoria = 'Ruidos molestos';
  } else if (/perro|animal|gato|plaga|rata|mosquito/.test(t)) {
    categoria = 'Control Animal/Plagas';
    subcategoria = /plaga|rata|mosquito/.test(t) ? 'Plagas' : 'Animal suelto';
  } else if (/tr[áa]nsito|estacionamiento|doble\s*fila|se[ñn]al/.test(t)) {
    categoria = 'Tránsito';
    subcategoria = /se[ñn]al/.test(t) ? 'Señalización' : 'Tránsito';
  }

  // Detectar urgencia
  let urgencia = 'normal';
  if (/urgente|peligro|emergencia|grave|inundaci|accidente|riesgo|ca[iyí]do/.test(t)) {
    urgencia = 'alta';
  } else if (/hace\s*(varios|muchos|3|4|5)\s*d[íi]as|semana|mes|siempre/.test(t)) {
    urgencia = 'media';
  }

  // Extraer dirección del texto
  let direccion = '';
  const dirMatch = t.match(/(?:en\s+(?:la\s+)?(?:calle\s+)?|(?:calle|av(?:enida)?|esquina|intersec)\s+)([\w\s]+?)(?:\s+(?:y|esquina|al|entre|nro?\.?|n[úu]mero)\s+|$)/i);
  if (dirMatch) {
    direccion = dirMatch[0].replace(/^en\s+(la\s+)?/, '').trim();
  }
  
  // Extraer número de calle
  const numMatch = texto.match(/(\d{2,5})/);
  const numero = numMatch ? numMatch[1] : '';

  return {
    categoria,
    subcategoria,
    urgencia,
    direccion: direccion ? `${direccion}${numero ? ' ' + numero : ''}` : '',
    numero,
    palabrasClave: extractKeywords(t)
  };
}

function extractKeywords(t) {
  const keywords = [];
  const kws = ['bache', 'luminaria', 'agua', 'basura', 'árbol', 'ruido', 'cloaca', 'semáforo', 'poste', 'vereda', 'poda', 'contenedor', 'inundación', 'perro'];
  for (const kw of kws) {
    if (t.includes(kw)) keywords.push(kw);
  }
  return keywords;
}

// ================================================================
// HELPERS
// ================================================================
function calcularPrioridad(body) {
  if (body.urgencia === 'alta') return 'URGENTE';
  const catAlta = ['Red de Agua/Cloacas', 'Tránsito'];
  if (catAlta.includes(body.categoria)) return 'ALTA';
  return 'NORMAL';
}

function mapCategoriaTArea(cat) {
  const map = {
    'Bacheo y Calzada': 'Obras Públicas',
    'Alumbrado Público': 'Servicios Públicos',
    'Red de Agua/Cloacas': 'Servicios Públicos',
    'Higiene Urbana': 'Medio Ambiente',
    'Arbolado Urbano': 'Medio Ambiente',
    'Convivencia Vecinal': 'Seguridad Ciudadana',
    'Control Animal/Plagas': 'Salud Pública',
    'Tránsito': 'Tránsito y Transporte',
    'General': 'Atención al Vecino'
  };
  return map[cat] || 'Atención al Vecino';
}

function calcularSLA(categoria) {
  const dias = {
    'Red de Agua/Cloacas': 2,
    'Tránsito': 1,
    'Alumbrado Público': 3,
    'Bacheo y Calzada': 5,
    'Higiene Urbana': 2,
    'Arbolado Urbano': 7,
    'General': 5
  };
  const d = new Date();
  d.setDate(d.getDate() + (dias[categoria] || 5));
  return d.toISOString();
}
