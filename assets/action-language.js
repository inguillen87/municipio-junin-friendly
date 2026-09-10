/* Presentation-only Spanish labels. Original workflow values and authorizations remain unchanged. */
(function (global) {
 'use strict';
 const terms=Object.freeze({restricted:'Restringida',confidential:'Confidencial',standard:'Estándar',public:'Pública',internal:'Uso interno',pending:'Pendiente de verificación',not_provided:'Sin documentación informada',not_required:'No requerida',verified:'Verificada',provided:'Presentada',rejected:'Rechazada',not_calculable:'Cálculo pendiente',calculable:'Datos suficientes para calcular',calculated:'Calculado',special:'Licencia especial',annual:'Licencia anual',sick:'Licencia por salud',draft:'Borrador',submitted:'Enviada a revisión',under_review:'En revisión',approved:'Aprobada',cancelled:'Cancelada',canceled:'Cancelada',ready:'Lista para revisión',unknown:'No informado',unavailable:'No disponible',insufficient_data:'Faltan datos',pending_review:'Pendiente de revisión'});
 function label(value,fallback='No informado') {const key=String(value??'').trim().toLowerCase().replace(/[ -]+/g,'_');return terms[key]||fallback;}
 function policy(value){return String(value||'')==='mendoza-ley-5811-title-vi.v1'?'Régimen de licencias · Ley 5811, título VI':'Régimen pendiente de identificación';}
 function reason(labelValue,code){const text=String(labelValue||'').trim();return text||((code!==null&&code!==undefined&&String(code)!=='')?'Motivo '+String(code)+' · denominación pendiente':'Motivo no informado');}
 global.MuniControlActionLanguage=Object.freeze({label,policy,reason});
})(typeof window==='undefined'?globalThis:window);
