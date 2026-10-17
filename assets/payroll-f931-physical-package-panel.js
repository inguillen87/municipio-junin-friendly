import {F931_PHYSICAL_SCOPES,F931_PHYSICAL_LABELS,F931_PHYSICAL_MAX_BYTES,compareF931PhysicalPackage,f931PhysicalProof,f931PhysicalCsv} from './payroll-f931-physical-package-model.js';
const mounted=new WeakMap();
const messages={F931_PHYSICAL_PERIOD_INVALID:'Elegí un período declarado válido.',F931_PHYSICAL_THREE_FILES_REQUIRED:'Seleccioná los tres TXT completos.',F931_PHYSICAL_BYTES_INVALID:'Cada archivo debe tener contenido y no superar 8 MiB. No se recortó ninguno.',F931_PHYSICAL_TOO_MANY_ROWS:'Un archivo supera 100.000 filas físicas. Se retiró el conjunto completo; no se omitieron filas.',F931_PHYSICAL_CRYPTO_REQUIRED:'No se pudo verificar la identidad de los tres archivos en este navegador.'};
const defaultDownload=(bytes,period,doc)=>{const url=URL.createObjectURL(new Blob([bytes],{type:'text/csv;charset=utf-8'})),a=doc.createElement('a');a.href=url;a.download='municontrol_control_fisico_F931_'+period+'.csv';a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

export function mountF931PhysicalPackage(parent,options={}){
 if(mounted.has(parent))return mounted.get(parent);
 const doc=parent.ownerDocument,win=doc.defaultView,node=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 if(!doc.querySelector('link[data-f931-physical-css]')){const link=node('link');link.rel='stylesheet';link.href=new URL('./payroll-f931-physical-package.css',import.meta.url).href;link.dataset.f931PhysicalCss='true';doc.head.append(link);}
 const host=node('section');host.className='f931-physical';host.dataset.f931Physical='';host.setAttribute('aria-label','Comparación física de los tres TXT F.931');
 host.append(node('h3','Comparar los tres TXT'),node('p','Revisá cuántas filas se repiten exactamente dentro de cada archivo y entre General, J42 y J55. Se comparan bytes completos, sin interpretar personas ni importes.'));
 const form=node('form'),periodLabel=node('label','Período declarado');periodLabel.className='fp-period';const period=node('input');period.type='month';period.min='1900-01';period.max='2099-12';period.required=true;period.dataset.fpPeriod='';periodLabel.append(period);form.append(periodLabel);
 const help=node('p','Seleccioná un TXT por ámbito. Hasta 8 MiB y 100.000 filas por archivo. El nombre y el contenido no se muestran ni se envían. Se comparan todos los anchos; este control no valida un formato fiscal.');help.id='f931PhysicalHelp';help.className='fp-note';form.append(help);
 const fileGrid=node('div');fileGrid.className='fp-files';const inputs=new Map(),fileStates=new Map();
 for(const scope of F931_PHYSICAL_SCOPES){const group=node('div');group.className='fp-file';group.append(node('h4',F931_PHYSICAL_LABELS[scope]));const input=node('input');input.type='file';input.accept='.txt,text/plain';input.required=true;input.id='f931Physical-'+scope;input.dataset.fpScope=scope;input.setAttribute('aria-describedby',help.id);const label=node('label','Elegir TXT');label.htmlFor=input.id;label.className='fp-file-label';const state=node('p','Sin archivo');state.dataset.fpFileState=scope;group.append(input,label,state);fileGrid.append(group);inputs.set(scope,input);fileStates.set(scope,state);}
 form.append(fileGrid);const actions=node('div');actions.className='fp-actions';const review=node('button','Comparar archivos completos');review.type='submit';review.dataset.fpReview='';const clear=node('button','Limpiar archivos');clear.type='button';clear.dataset.fpClear='';actions.append(review,clear);form.append(actions);host.append(form);
 const status=node('p','Elegí el período y los tres archivos para comparar.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.dataset.fpStatus='';host.append(status);
 const result=node('div');result.hidden=true;result.dataset.fpResult='';host.append(result);const download=node('button','Descargar control completo CSV');download.type='button';download.dataset.fpCsv='';download.hidden=true;host.append(download);
 const note=node('p','Las diferencias y coincidencias pueden ser esperables. No indican personas duplicadas ni errores fiscales. Se conservan todas las filas. La generación del TXT fiscal y su presentación siguen pendientes.');note.className='fp-note';host.append(note);parent.append(host);
 let revision=0,busy=false,report=null,disposed=false,capabilityEpoch=0,capabilityResult=null;
 const hasFiles=()=>[...inputs.values()].some(input=>input.files?.length);
 // Inherit the existing Reportes route authority; this local control grants no
 // separate capability. An empty capability event stays denied, even when the
 // page's earlier DOM state is still "ready".
 const reportRequirement=win.MuniControlCapabilityGate?.requirements?.['reportes-rrhh.html']??{any:['workforce.summary.read','management.analytics.read','workforce.employee.read']};
 const access=()=>{try{const raw=capabilityResult?.tenantCapabilities,caps=raw instanceof Set||Array.isArray(raw)?new Set(raw):new Set();const routeAllowed=Array.isArray(reportRequirement.any)&&reportRequirement.any.some(cap=>caps.has(cap));return routeAllowed&&(!options.hasAccess||options.hasAccess())&&!['checking','denied'].includes(doc.documentElement.getAttribute('data-mc-capability-state'))&&!host.closest('[data-mc-capability-denied="true"]');}catch{return false;}};
 const visible=()=>{if(doc.hidden||!host.isConnected||host.closest('[hidden]'))return false;for(let p=host;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open)return false;return true;};
 const available=()=>!disposed&&access()&&visible();
 const refreshFiles=()=>{for(const [scope,input]of inputs)fileStates.get(scope).textContent=input.files?.length===1?'Archivo seleccionado':'Sin archivo';};
 const controls=()=>{const blocked=busy||!available();period.disabled=blocked;for(const input of inputs.values())input.disabled=blocked;review.disabled=blocked;clear.disabled=busy||disposed;download.disabled=blocked||!report;download.hidden=!report;host.setAttribute('aria-busy',String(busy));};
 const say=(text,state='')=>{status.textContent=text;status.dataset.state=state;};
 function withdraw(text,{eraseFiles=false}={}){revision++;busy=false;report=null;result.replaceChildren();result.hidden=true;download.hidden=true;if(eraseFiles)for(const input of inputs.values())input.value='';refreshFiles();if(text)say(text);controls();}
 const selected=()=>F931_PHYSICAL_SCOPES.map(scope=>inputs.get(scope).files?.[0]);
 async function read(files,declared,valid){
  const artifacts=[];
  for(let i=0;i<files.length;i++){
   if(!valid())throw Object.assign(Error('WITHDRAWN'),{name:'AbortError'});
   const file=files[i];if(!file||typeof file.arrayBuffer!=='function')throw Object.assign(Error(),{code:'F931_PHYSICAL_THREE_FILES_REQUIRED'});
   if(file.size<1||file.size>F931_PHYSICAL_MAX_BYTES)throw Object.assign(Error(),{code:'F931_PHYSICAL_BYTES_INVALID'});
   const bytes=new Uint8Array(await (options.readFile?options.readFile(file):file.arrayBuffer()));
   if(!valid())throw Object.assign(Error('WITHDRAWN'),{name:'AbortError'});
   if(bytes.length!==file.size)throw Object.assign(Error(),{code:'F931_PHYSICAL_BYTES_INVALID'});
   artifacts.push({scope:F931_PHYSICAL_SCOPES[i],bytes});
  }
  return compareF931PhysicalPackage({period:declared,artifacts},{cryptoImpl:options.cryptoImpl??win.crypto,valid});
 }
 function list(parent,entries){const dl=node('dl');for(const [label,value]of entries)dl.append(node('dt',label),node('dd',String(value)));parent.append(dl);}
 function render(value){
  result.replaceChildren();const intro=node('p',value.physicalRowCountSum+' filas físicas revisadas en tres archivos completos. Esa suma no representa personas.');intro.dataset.fpTotal='';result.append(intro);
  const summaries=node('div');summaries.className='fp-summaries';
  for(const a of value.artifacts){const card=node('article');card.className='fp-card';card.dataset.fpArtifact=a.scope;card.append(node('h4',F931_PHYSICAL_LABELS[a.scope]));list(card,[['Filas físicas',a.physicalRows],['Filas distintas por bytes',a.distinctRows],['Repeticiones adicionales de filas idénticas',a.repeatedOccurrences]]);const details=node('details');details.append(node('summary','Ver estructura física'));list(details,[['Filas distintas con repetición',a.repeatedRowKinds],['Filas vacías',a.blankRows],['Bytes completos',a.byteLength],['Anchos de fila (bytes)',a.minRowBytes+' a '+a.maxRowBytes],['Terminaciones CRLF / LF / CR',a.lineEndings.crlf+' / '+a.lineEndings.lf+' / '+a.lineEndings.cr],['Filas sin terminación final',a.lineEndings.unterminated]]);card.append(details);summaries.append(card);}result.append(summaries);
  const comparisons=node('details');comparisons.className='fp-comparisons';comparisons.append(node('summary','Consultar coincidencias y diferencias de los tres archivos'));
  const intersections=node('article');intersections.className='fp-card';intersections.append(node('h4','Coincidencias entre archivos'),node('p','Cada fila distinta se cuenta una vez. Para comparar filas se excluye únicamente su terminación CRLF, LF o CR; los demás bytes se conservan.'));
  for(const p of value.pairs)list(intersections,[[F931_PHYSICAL_LABELS[p.left]+' / '+F931_PHYSICAL_LABELS[p.right]+' · filas distintas idénticas',p.sharedDistinctRows],['Archivos idénticos byte a byte',p.identicalFileBytes?'Sí':'No']]);comparisons.append(intersections);
  const union=node('article');union.className='fp-card';union.append(node('h4','General frente a las filas reunidas de J42 y J55'));const u=value.generalVersusJurisdictionUnion;list(union,[['Filas distintas de General',u.generalDistinctRows],['Filas distintas reunidas de J42 y J55',u.jurisdictionUnionDistinctRows],['Filas distintas compartidas',u.sharedDistinctRows],['Filas distintas sólo en General',u.generalOnlyDistinctRows],['Filas distintas sólo en J42/J55',u.jurisdictionOnlyDistinctRows]]);comparisons.append(union);result.append(comparisons);result.hidden=false;
 }
 async function perform(exporting=false){
  if(busy||!available()||exporting&&!report)return;
  const previous=report,files=selected(),declared=period.value;withdraw();const token=revision;
  const valid=()=>revision===token&&available()&&period.value===declared&&selected().every((file,i)=>file===files[i]);
  busy=true;controls();say(exporting?'Comprobando de nuevo los tres archivos antes de descargar…':'Comparando todas las filas en este navegador…');
  try{const fresh=await read(files,declared,valid);if(!valid())return;report=fresh;render(fresh);
   if(exporting&&f931PhysicalProof(previous)!==f931PhysicalProof(fresh)){say('Cambió un archivo. Revisá la comparación completa actualizada antes de descargar.','warning');return;}
   if(exporting){const csv=f931PhysicalCsv(fresh);if(!valid())return;(options.download??defaultDownload)(csv,fresh.period,doc);say('Control completo descargado. Contiene sólo cantidades y límites de la comparación física.');}
   else say('Comparación completa. Las diferencias no acreditan errores fiscales; no se generó ni presentó un TXT.');
  }catch(error){if(revision===token){withdraw();say(messages[error?.code]??'No se pudo completar el control. Revisá los tres archivos y volvé a compararlos.','error');}}
  finally{if(revision===token){busy=false;controls();}}
 }
 form.addEventListener('submit',event=>{event.preventDefault();void perform();});
 for(const input of inputs.values())input.addEventListener('change',()=>withdraw('Cambió un archivo. Compará de nuevo los tres TXT completos.'));
 period.addEventListener('input',()=>withdraw('Cambió el período declarado. Compará de nuevo los tres TXT completos.'));
 clear.addEventListener('click',()=>withdraw('Archivos retirados. Elegí el período y los tres TXT para comparar.',{eraseFiles:true}));download.addEventListener('click',()=>void perform(true));
 const hidden=()=>{if(doc.hidden)withdraw('Se retiró el control al ocultar la página. Elegí nuevamente los tres TXT.',{eraseFiles:true});};
 const capabilities=event=>{capabilityEpoch++;capabilityResult=event?.detail??null;withdraw(access()?'Cambió el acceso. Elegí nuevamente los tres TXT para comparar.':'Tu acceso actual no habilita Reportes. Se retiraron los archivos y el control.',{eraseFiles:true});};
 const pagehide=()=>withdraw('Se retiró el control al salir de la página.',{eraseFiles:true});
 doc.addEventListener('visibilitychange',hidden);doc.addEventListener('municontrol:capabilities-ready',capabilities);win.addEventListener('pagehide',pagehide);
 const observer=new win.MutationObserver(records=>{if(host.isConnected&&!records.some(record=>record.target===doc.documentElement||record.target.contains?.(host)))return;if(!available()&&(report||busy||hasFiles()))withdraw('Se retiró el control al ocultar la tarea o cambiar el acceso. Elegí nuevamente los tres TXT.',{eraseFiles:true});else controls();});
 observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open','data-mc-capability-state','data-mc-capability-denied']});
 const api=Object.freeze({clear:()=>withdraw('Control retirado.',{eraseFiles:true}),refreshAccess:capabilities,getState:()=>({busy,hasResult:report!==null,revision}),destroy(){withdraw('',{eraseFiles:true});disposed=true;observer.disconnect();doc.removeEventListener('visibilitychange',hidden);doc.removeEventListener('municontrol:capabilities-ready',capabilities);win.removeEventListener('pagehide',pagehide);host.remove();mounted.delete(parent);}});
 const epoch=capabilityEpoch,ready=win.MuniControlCapabilityGate?.ready;
 if(ready)void Promise.resolve(ready).then(value=>{if(disposed||capabilityEpoch!==epoch)return;capabilityResult=value;withdraw(access()?'Acceso a Reportes verificado. Elegí el período y los tres TXT.':'Tu acceso actual no habilita Reportes. Se retiraron los archivos y el control.',{eraseFiles:true});}).catch(()=>{if(!disposed&&capabilityEpoch===epoch){capabilityResult=null;withdraw('No se verificó el acceso a Reportes.',{eraseFiles:true});}});
 else say('Verificá tu acceso a Reportes antes de seleccionar los tres TXT.');
 mounted.set(parent,api);controls();return api;
}
