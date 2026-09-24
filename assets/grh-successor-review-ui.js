import {SUCCESSOR_LABELS,successorReviewTotals} from './grh-successor-review-model.js';
import {CORE_REVIEW_DOMAINS,coreReviewCutoff} from './grh-core-review-model.js';
const shown=n=>n.toLocaleString('es-AR');
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const closureLabel={open:'Abierta',closed:'Cerrada',unknown:'Sin cierre confirmado'};
export function renderSuccessorReview(host,data,fingerprint){
 const $=selector=>host.querySelector(selector),totals=successorReviewTotals(data),changes=totals.added+totals.removed+totals.changed;
 $('[data-br-verdict]').textContent=changes>0n?'Comparación multiliquidación con diferencias para revisar. No se incorporaron datos ni se autorizó ningún pago.':'Sin diferencias de proyección en los cinco conjuntos. Esto no certifica todo GRH ni autoriza incorporar datos.';
 $('[data-br-baseline]').textContent=coreReviewCutoff(data.baseline.sourceCutoff);$('[data-br-candidate]').textContent=coreReviewCutoff(data.candidate.sourceCutoff);
 for(const [field,label]of [['added','Registros nuevos'],['removed','Registros ausentes'],['changed','Registros modificados']]){
  $('[data-br-'+field+']').textContent=shown(totals[field]);$('[data-br-'+field+'-label]').textContent=label+' · 5 conjuntos';
 }
 $('[data-br-caption]').textContent='Diferencias del núcleo GRH por clave y contenido operativo';$('[data-br-domain-label]').textContent='Conjunto de registros';
 $('[data-br-table-region]').setAttribute('aria-label','Diferencias en cinco conjuntos, desplazable');
 const rows=CORE_REVIEW_DOMAINS.map(name=>{const r=data.entities[name],tr=node('tr'),th=node('th',SUCCESSOR_LABELS[name]);th.scope='row';tr.append(th);
  for(const key of ['before','after','unchanged','added','removed','changed'])tr.append(node('td',shown(r[key])));return tr;});
 $('[data-br-domains]').replaceChildren(...rows);
 const snapshot=data.entities.payrollSnapshot,contracts=snapshot.contracts;
 $('[data-br-core-corrections]').hidden=false;$('[data-br-core-corrections]').textContent='Historial mensual: '+shown(data.entities.payrollMonthly.changed)+' resúmenes modificados; no equivale necesariamente a esa cantidad de personas. Asignaciones del candidato: '+shown(snapshot.after)+' para '+shown(contracts.after)+' contratos distintos.';
 $('[data-br-issues-help]').textContent='Se distinguen cambios de contenido y cambios exclusivos de la evidencia original. Una misma fila puede cambiar en varios campos; no sumes esos campos como personas distintas.';
 const issues=[shown(snapshot.evidenceOnlyChanges)+' asignaciones conservan sus datos operativos y cambian sólo su evidencia original; no se convierten en altas o bajas.',shown(contracts.afterWithMultipleAssignments)+' contratos tienen más de una asignación. Cada liquidación se conserva por separado.','Los decimales se compararon sin redondearlos a Number. Un importe no informado no se reemplaza por cero.'];
 $('[data-br-issues]').replaceChildren(...issues.map(t=>node('li',t)));
 let extra=$('[data-br-successor]');if(!extra){extra=node('section',undefined,'br-successor');extra.dataset.brSuccessor='';$('[data-br-issues]').closest('details').after(extra);}extra.replaceChildren();extra.hidden=false;
 extra.append(node('h3','Cierres por tipo de liquidación'),node('p','Una liquidación cerrada no cierra las demás del mismo mes. El informe conserva el estado de cada corrida.'));
 const wrap=node('div',undefined,'br-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Cierres declarados, desplazable');extra.append(wrap);
 const table=node('table');wrap.append(table);table.append(node('caption','Corridas actuales de cada fuente'));
 const headings=node('tr');for(const title of ['Fuente','Empresa','Fecha','Período / mes','Tipo','Cierre']){const th=node('th',title);th.scope='col';headings.append(th);}const thead=node('thead');thead.append(headings);table.append(thead);const tbody=node('tbody');table.append(tbody);
 for(const [side,label]of [['baseline','Base'],['candidate','Candidato']])for(const r of data.runEvidence[side].currentRuns){
  const tr=node('tr');for(const value of [label,r.companyCode,r.payrollDate,r.period+' / '+r.month,r.payrollType,closureLabel[r.closureStatus]])tr.append(node('td',value));tbody.append(tr);
 }
 const latest=node('p',undefined,'br-notice');latest.textContent='Última mensual cerrada (tipo M): base '+(data.runEvidence.baseline.latestClosedByType.M??'no informada')+' · candidato '+(data.runEvidence.candidate.latestClosedByType.M??'no informada')+'. No se infiere el cierre mensual a partir de vacaciones u otros tipos.';extra.append(latest);
 const details=node('details',undefined,'br-details');details.append(node('summary','Contenido modificado y evidencia conservada'));extra.append(details);
 for(const name of CORE_REVIEW_DOMAINS){const row=data.entities[name],p=node('p');p.append(node('strong',SUCCESSOR_LABELS[name]+': '),node('span',shown(row.changed)+' registros con contenido distinto; '+shown(row.evidenceOnlyChanges)+' con cambios exclusivos de evidencia.'));details.append(p);}
 details.append(node('p','La comparación conserva las claves empresa / legajo / fecha / período / mes / tipo. Los cambios exclusivos de evidencia no se suman otra vez a los registros modificados.'));
 const trace=[['Perfil base',data.baseline.profileId],['Perfil candidato',data.candidate.profileId],['Huella del respaldo base',data.baseline.sourceSha256],['Huella del respaldo candidato',data.candidate.sourceSha256],['Manifiesto base',data.baseline.manifestSha256],['Manifiesto candidato',data.candidate.manifestSha256],['Huella SHA-256 del informe local',fingerprint],['Contrato',data.version],['Informe generado',data.generatedAt]];
 $('[data-br-trace]').replaceChildren(...trace.map(([label,value])=>{const p=node('p');p.append(node('strong',label+': '),node('span',value));return p;}));
 const limits=node('p',undefined,'br-limit');limits.textContent='Antes de incorporar: selección sucesora versionada, conciliación de datos de personal con el núcleo salarial, preservación de operaciones nativas y prueba de capacidad y restauración.';extra.append(limits);
 $('[data-br-limit]').textContent='Comparación en este equipo de cinco conjuntos del núcleo. No se contrastó la base operativa ni los datos curados de personal, las fichadas, documentos y acciones propias. Esta pantalla no actualiza la fuente ni autoriza pagos, altas o bajas.';
 $('[data-br-result]').hidden=false;$('[data-br-status]').textContent='Informe multiliquidación abierto completo. Los registros y la fuente activa no fueron modificados.';
}
