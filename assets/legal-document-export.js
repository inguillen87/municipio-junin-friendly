import {verifyLegalResponse, LEGAL_KINDS, LEGAL_ISSUERS} from './legal-registry-model.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validRecord=r=>verifyLegalResponse('detail',{version:'legal-registry.v1',record:r}).record;
function instant(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('EXPORT_TIME_INVALID');return value;}
export function assertSameLegalRecord(before,after){
 validRecord(before);validRecord(after);
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('La ficha cambió. Actualizala antes de exportar.');
 return after;
}
function cell(value){let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
export function legalPageCsv(data,{q='',kind='',year=''}={},exportedAt){
 verifyLegalResponse('list',data);instant(exportedAt);
 if(typeof q!=='string'||q.length>160||typeof kind!=='string'||(kind&&!Object.hasOwn(LEGAL_KINDS,kind))||!/^$|^(?:17|18|19|20|21|22)\d{2}$/.test(String(year)))throw Error('EXPORT_FILTERS_INVALID');
 const rows=[['Tipo','Número','Año','Órgano emisor','Título','Clase','Versión documental','Vigencia','Referencia interna','Página exportada','Resultados totales','Filtro texto','Filtro tipo','Filtro año','Consulta UTC']];
 for(const r of data.rows)rows.push([LEGAL_KINDS[r.kind],r.number,r.year,LEGAL_ISSUERS[r.issuer],r.title,r.stage==='proyecto'?'Proyecto':'Acto registrado',r.current_version,'No determinada',`/juridica?norma=${r.id}&version=${r.current_version}`,data.page,data.total,q,kind,year,exportedAt]);
 return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n';
}
export function legalDossierHtml(record,exportedAt){
 const r=validRecord(record);instant(exportedAt);
 const row=(label,value)=>`<dt>${esc(label)}</dt><dd>${esc(value||'Sin informar')}</dd>`;
 const articles=r.metadata.articles.map((a,i)=>`<article id="articulo-${i+1}"><h3>${esc(a.label)} <small>PDF · página ${a.page}</small></h3><p>${esc(a.text)}</p></article>`).join('');
 const history=r.history.map(h=>`<tr><td>${h.version}</td><td>${esc(h.recordedAt)}</td><td>${esc(h.recordedBy)}</td><td>${esc(h.reason)}</td></tr>`).join('');
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Ficha documental · ${esc(r.number)}/${r.year} · v${r.version}</title>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:960px;margin:32px auto;padding:0 24px;color:#183447}h1{line-height:1.2}h2{border-bottom:2px solid #cee0e4;padding-bottom:8px}small{font-weight:normal}aside{padding:16px;background:#f2f6f6;border-left:4px solid #176f64}dt{font-weight:700;margin-top:12px}dd{margin:0;overflow-wrap:anywhere}article{border-top:1px solid #d6e1e2;padding:12px 0}article p,.summary{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px;border:1px solid #d6e1e2;text-align:left;vertical-align:top;overflow-wrap:anywhere}footer{border-top:1px solid #d6e1e2;margin-top:24px;padding-top:12px;font-size:13px}@media print{body{font-size:11pt;margin:0;padding:0}h2,h3{break-after:avoid}tr{break-inside:avoid}aside{background:transparent}}@page{size:A4;margin:18mm}</style></head><body>
<header><p>MUNICONTROL · FICHA DOCUMENTAL DE CONSULTA</p><h1>${esc(LEGAL_KINDS[r.kind])} ${esc(r.number)}/${r.year}</h1><h2>${esc(r.metadata.title)}</h2><p>Versión documental ${r.version} de ${r.currentVersion} · ${r.version<r.currentVersion?'VERSIÓN HISTÓRICA':'Última versión consultada'}</p></header>
<aside>Documento de consulta interna generado desde una ficha revalidada. No es el PDF original, una copia certificada ni un documento firmado. No acredita vigencia, derogación, dictamen o aprobación. Podés imprimir esta ficha desde el navegador; las transcripciones deben contrastarse con el original.</aside>
<dl>${row('Clase',r.metadata.stage==='proyecto'?'Proyecto — no acredita sanción':'Acto registrado')}${row('Órgano emisor',LEGAL_ISSUERS[r.issuer])}${row('Procedencia',r.metadata.sourceReference)}${row('Temas',r.metadata.topics)}${row('Emisión o sanción',r.metadata.issueDate)}${row('Publicación',r.metadata.publicationDate)}${row('Fecha de efectos declarada',r.metadata.effectiveDate)}${row('PDF original',r.document.filename)}${row('SHA-256 del original',r.document.sha256)}${row('Incorporado por',r.recordedBy)}${row('Fecha de incorporación',r.recordedAt)}${row('Fundamento',r.reason)}</dl>
${r.metadata.summary?`<h2>Resumen documental</h2><p class="summary">${esc(r.metadata.summary)}</p>`:''}<h2>Artículos transcritos · ${r.metadata.articles.length}</h2>${articles||'<p>Esta versión no contiene artículos transcritos.</p>'}<h2>Historial documental</h2><table><thead><tr><th>Versión</th><th>Fecha UTC</th><th>Responsable</th><th>Fundamento</th></tr></thead><tbody>${history}</tbody></table><footer>Exportación UTC: ${esc(exportedAt)}<br>Referencia interna: /juridica?norma=${r.id}&amp;version=${r.version}<br>La exportación no concede permisos de acceso. Conservar y compartir únicamente dentro del circuito autorizado.</footer></body></html>`;
}
