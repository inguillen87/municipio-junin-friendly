import {CURATED_REVIEW_DOMAINS,CURATED_REVIEW_SCHEMA,isCoordinatedReview} from './grh-curated-review-model.js';
import {coreReviewCutoff} from './grh-core-review-model.js';
import {renderSuccessorReview} from './grh-successor-review-ui.js';
const n=(tag,text,cls)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=String(text);if(cls)element.className=cls;return element;};
const shown=value=>value.toLocaleString('es-AR');
const label=name=>CURATED_REVIEW_SCHEMA[name][1];
const fields={employment:'Datos laborales',identity:'Identificación',relatedRecordCounts:'Cantidades de registros relacionados',unionMemberships:'Afiliaciones gremiales',reason:'Motivo',reasonCode:'Código de motivo',endDate:'Fecha de fin',baseSalary:'Sueldo básico',address:'Domicilio',days:'Días',quantity:'Cantidad',startDate:'Fecha de inicio',sourceFields:'Valores originales conservados',sourceProvenance:'Procedencia del registro original',sourceReferences:'Referencia al departamento original'};
function rows(data,onlyChanges=false){return CURATED_REVIEW_DOMAINS.filter(name=>!onlyChanges||data.artifacts[name].added+data.artifacts[name].removed+data.artifacts[name].changed>0).map(name=>{
 const row=data.artifacts[name],tr=n('tr'),th=n('th',label(name));th.scope='row';tr.append(th);
 for(const key of ['before','after','unchanged','added','removed','changed'])tr.append(n('td',shown(row[key])));return tr;
});}
function totals(data){return Object.fromEntries(['added','removed','changed'].map(key=>[key,CURATED_REVIEW_DOMAINS.reduce((sum,name)=>sum+BigInt(data.artifacts[name][key]),0n)]));}
export function renderCuratedSourceReview(host,report,fingerprint){
 const joint=isCoordinatedReview(report.version),data=joint?report.curated:report,$=s=>host.querySelector(s),sum=totals(data);
 const changed=CURATED_REVIEW_DOMAINS.filter(name=>{const r=data.artifacts[name];return r.added+r.removed+r.changed>0;});
 if(joint){renderSuccessorReview(host,report.core,fingerprint);$('[data-br-verdict]').textContent='Núcleo salarial y datos de personal revisados contra los mismos dos respaldos. No se incorporaron datos ni se autorizó ningún pago.';}
 else{
  $('[data-br-verdict]').textContent=changed.length?'Comparación de datos de personal con diferencias para revisar. No se incorporaron registros.':'Sin diferencias en los quince archivos de personal. Esto no certifica el núcleo salarial ni autoriza incorporar datos.';
  $('[data-br-baseline]').textContent=coreReviewCutoff(data.baseline.sourceCutoff);$('[data-br-candidate]').textContent=coreReviewCutoff(data.candidate.sourceCutoff);
  for(const [key,text]of [['added','Registros nuevos'],['removed','Registros ausentes'],['changed','Registros modificados']]){$('[data-br-'+key+']').textContent=shown(sum[key]);$('[data-br-'+key+'-label]').textContent=text+' · 15 archivos de personal';}
  $('[data-br-caption]').textContent='Comparación completa de los quince archivos de personal';$('[data-br-domain-label]').textContent='Archivo';
  $('[data-br-table-region]').setAttribute('aria-label','Diferencias de datos de personal, desplazable');$('[data-br-domains]').replaceChildren(...rows(data));
  $('[data-br-core-corrections]').hidden=true;$('[data-br-core-corrections]').textContent='';
  $('[data-br-issues-help]').textContent='Los cambios de un legajo pueden corresponder a sus registros relacionados, no necesariamente a su situación laboral.';
  $('[data-br-issues]').replaceChildren(n('li','Se conservaron las claves de origen y se comparó el contenido completo de cada registro.'),n('li','Nulo, cero y dato ausente son diferentes. Los números del archivo se comparan sin redondeo binario adicional.'));
  $('[data-br-trace]').replaceChildren();
 }
 let section=$('[data-br-curated]');if(!section){section=n('section',undefined,'br-curated');section.dataset.brCurated='';$('[data-br-trace]').closest('details').before(section);}section.hidden=false;section.replaceChildren();
 section.append(n('h3','Datos de personal · 15 archivos'),n('p',shown(changed.length)+' archivos con diferencias y '+shown(15-changed.length)+' sin diferencias. Los conteos son registros, no personas únicas.','br-notice'));
 if(data.employeeSourceFacts){
  const facts=n('section');facts.dataset.brEmployeeFacts='';facts.append(n('h4','Departamento original y situación laboral'));
  const candidate=data.employeeSourceFacts.candidate,base=data.employeeSourceFacts.baseline;
  facts.append(n('p',`${shown(candidate.retainedFacts)} de ${shown(candidate.total)} legajos del candidato conservan su procedencia y valores originales. En la base comparada: ${shown(base.retainedFacts)} de ${shown(base.total)}.`));
  const wrap=n('div',undefined,'br-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Departamento original por situación laboral, desplazable');
  const table=n('table'),head=n('thead'),line=n('tr'),body=n('tbody');table.append(n('caption','Candidato completo · referencia del departamento original'));
  for(const text of ['Situación en la fuente','Total','042','055','Otra referencia','Sin referencia']){const th=n('th',text);th.scope='col';line.append(th);}head.append(line);
  for(const [key,label]of [['active','Activo por fecha de egreso'],['inactive','Inactivo por fecha de egreso'],['notDeclared','Situación no informada']]){const tr=n('tr'),th=n('th',label);th.scope='row';tr.append(th);for(const field of ['total','original042','original055','otherReference','notDeclared'])tr.append(n('td',shown(candidate.states[key][field])));body.append(tr);}
  table.append(head,body);wrap.append(table);facts.append(wrap);
  facts.append(n('p',`Sin referencia de departamento: ${shown(candidate.states.active.notDeclared)} activos y ${shown(candidate.states.inactive.notDeclared)} históricos inactivos. Estos antecedentes permanecen sin una asignación inventada.`));
  const indicator=candidate.liquidationIndicator;
  facts.append(n('p',`Indicador original «liquida»: ${shown(indicator.zero)} valores 0; ${shown(indicator.one)} valores 1; ${shown(indicator.null)} nulos; ${shown(indicator.blank)} vacíos; ${shown(indicator.absent)} no conservados; ${shown(indicator.other)} otros valores.`));
  facts.append(n('p','La fecha de egreso y el indicador de liquidación son datos distintos. Los valores 0/1 no se traducen a permiso para liquidar. Una referencia faltante permanece pendiente; estos datos no asignan jurisdicciones ni habilitan haberes.','br-notice'));section.append(facts);
 }
 let body=$('[data-br-domains]');
 if(joint){
  const counts=n('div',undefined,'br-counts');section.append(counts);
  for(const [key,text]of [['added','Nuevos · personal'],['removed','Ausentes · personal'],['changed','Modificados · personal']]){const box=n('div');box.append(n('span',text),n('strong',shown(sum[key])));counts.append(box);}
  const wrap=n('div',undefined,'br-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Diferencias de datos de personal, desplazable');
  const table=n('table'),head=n('thead'),line=n('tr');table.append(n('caption','Quince archivos de personal; separados del núcleo salarial'));
  for(const text of ['Archivo','Base','Candidato','Sin cambios','Nuevos','Ausentes','Modificados']){const th=n('th',text);th.scope='col';line.append(th);}
  head.append(line);body=n('tbody');body.dataset.brCuratedRows='';table.append(head,body);wrap.append(table);section.append(wrap);body.replaceChildren(...rows(data));
 }
 const filterLabel=n('label','Archivos a mostrar '),filter=n('select');filter.setAttribute('aria-label','Archivos de personal a mostrar');
 for(const [value,text]of [['all','Todos (15)'],['changed','Sólo con diferencias ('+changed.length+')']]){const option=n('option',text);option.value=value;filter.append(option);}
 filterLabel.append(filter);section.children[1].after(filterLabel);const filterStatus=n('p','Mostrando 15 archivos de personal.');filterStatus.setAttribute('role','status');section.append(filterStatus);
 filter.addEventListener('change',()=>{body.replaceChildren(...rows(data,filter.value==='changed'));filterStatus.textContent='Mostrando '+(filter.value==='changed'?changed.length:15)+' archivos de personal.';});
 const details=n('details',undefined,'br-details');details.append(n('summary','Qué cambió en los datos de personal'));section.append(details);
 for(const name of changed){const row=data.artifacts[name],p=n('p');p.append(n('strong',label(name)+': '),n('span',shown(row.added)+' nuevos, '+shown(row.removed)+' ausentes y '+shown(row.changed)+' modificados.'));details.append(p);
  for(const [key,count]of Object.entries(row.changedFields))details.append(n('p',(fields[key]??'Campo de origen '+key)+': '+shown(count)+' registros.'));
 }
 if(!changed.length)details.append(n('p','No se detectaron diferencias en estos quince archivos.'));
 details.append(n('p','Un mismo registro puede cambiar en más de un campo. No sumes estos campos como personas diferentes.'));
 const trace=[['Respaldo base de personal · SHA-256',data.baseline.sourceSha256],['Respaldo candidato de personal · SHA-256',data.candidate.sourceSha256],['Informe generado',data.generatedAt],['Perfil base de personal',data.baseline.profileId],['Perfil candidato de personal',data.candidate.profileId],['Manifiesto de personal · base',data.baseline.manifestSha256],['Manifiesto de personal · candidato',data.candidate.manifestSha256],['Informe local leído · SHA-256',fingerprint],['Contrato del informe leído',report.version]];
 if(joint)trace.push(['Informe salarial de referencia · SHA-256',report.coreReportSha256]);
 for(const [text,value]of trace){const p=n('p');p.append(n('strong',text+': '),n('span',value));$('[data-br-trace]').append(p);}
 $('[data-br-limit]').textContent=joint?'Comparación coordinada de cinco conjuntos salariales y quince archivos de personal. El núcleo proviene del informe previo validado; se releyeron los archivos de personal. No se contrastaron los registros incorporados en MuniControl ni las fichadas, documentos y acciones propias. Esta revisión no actualiza la fuente ni autoriza pagos, altas o bajas.':'Comparación en este equipo de quince archivos de personal. No se compararon la base operativa, el núcleo salarial ni las fichadas, documentos y acciones propias. Esta revisión no autoriza incorporar ni reemplazar registros.';
 $('[data-br-result]').hidden=false;$('[data-br-status]').textContent=joint?'Revisión coordinada abierta: núcleo salarial y datos de personal de los mismos respaldos. No se incorporaron datos.':'Quince archivos de personal revisados. El informe permanece en este navegador; no se incorporaron datos.';
}
