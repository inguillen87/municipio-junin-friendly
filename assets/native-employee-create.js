import { employeeDraft, EMPLOYEE_FIELDS } from './native-employee-contract.js';
import {employeeCreationBootstrap,employeeScopeKey,employeeCatalogEqual,employeeReceipt,employeeCreationFinalRefusal} from './native-employee-confirmation-model.js';
const URL_API='/api/internal-native-employees';
const catalogOrder=new Intl.Collator('es',{numeric:true,sensitivity:'base'});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function request(resource,body,key,signal,scopeKey){
 const options={method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000),headers:{Accept:'application/json'}};
 if(scopeKey)options.headers['X-MuniControl-Employee-Scope']=scopeKey;
 if(body){options.headers['Content-Type']='application/json';options.headers['Idempotency-Key']=key;options.body=JSON.stringify(body);}
 const response=await fetch(URL_API+(resource?'?'+new URLSearchParams(resource):''),options);let result;
 try{result=await response.json();}catch{throw Object.assign(Error('No se recibió una confirmación válida.'),{status:503});}
 if(!response.ok||!result?.ok)throw Object.assign(Error(result?.error||'No se completó la operación.'),{status:response.status,code:result?.code});
 return result.data;
}
const formMarkup=`<header class="ne-heading"><p>PERSONAS · ALTA PROPIA</p><h2 id="ne-title">Nuevo legajo municipal</h2><span>Registrá a la persona y su encuadre laboral en MuniControl, sin importar un archivo de GRH.</span></header>
 <div class="ne-feedback" role="status" aria-live="polite">Consultando permisos y catálogos…</div>
 <section data-ne-access-panel hidden><p>Se retiraron los datos visibles. Comprobar acceso no crea ni reenvía un legajo.</p><button class="button primary" type="button" data-ne-access>Comprobar acceso</button></section>
 <form id="nativeEmployeeForm"><fieldset class="ne-fields" disabled>
 <section><h3>1. Datos personales</h3><div class="ne-grid">
 <label class="ne-wide">Apellido y nombres<input name="fullName" required maxlength="160" autocomplete="off"></label>
 <label>DNI<input name="dni" required inputmode="numeric" maxlength="12" autocomplete="off"></label>
 <label>CUIL<input name="cuil" required inputmode="numeric" maxlength="15" placeholder="Sin puntos ni guiones" autocomplete="off"></label>
 <label>Fecha de nacimiento<input name="birthDate" type="date" required min="1900-01-01"></label>
 <label>Sexo registrado<select name="sexCode"><option value="">Sin informar</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="X">X</option></select></label>
 </div></section>
 <section><h3>2. Ingreso y encuadre</h3><div class="ne-grid">
 <label>Número de legajo<input name="legajo" inputmode="numeric" maxlength="9" placeholder="Automático al confirmar" autocomplete="off"><small data-number-help>Dejalo vacío para asignar el siguiente número disponible.</small></label>
 <label>Fecha de ingreso<input name="startDate" type="date" required min="1900-01-01" max="2099-12-31"></label>
 <label>Jurisdicción<select name="jurisdictionCode" required><option value="">Seleccioná jurisdicción</option><option value="42">Jurisdicción 42</option><option value="55">Jurisdicción 55</option></select></label>
 <label>Convenio<select name="agreementCode" required><option value="">Seleccioná convenio</option></select></label>
 <label>Categoría / clase<select name="categoryCode" required><option value="">Primero elegí convenio</option></select></label>
 <label>Sector<select name="organizationId" required><option value="">Seleccioná sector</option></select></label>
 <label>Repartición<select name="sectorCode" required><option value="">Seleccioná repartición</option></select></label>
 <label class="ne-wide">Cargo o función <small>Opcional; no modifica conceptos salariales.</small><input name="jobTitle" maxlength="120" autocomplete="off"></label>
 <label class="ne-wide">Resolución, disposición o documento de alta<input name="legalReference" required minlength="3" maxlength="180" autocomplete="off" placeholder="Identificación y fecha del documento"></label>
 </div></section><p class="ne-scope">El alta crea el legajo, no una cuenta de acceso, una liquidación ni una asociación automática con relojes.</p>
 <div class="ne-actions"><button type="submit" class="button primary">Revisar alta</button><button type="button" class="button" data-ne-cancel>Cancelar</button></div>
 </fieldset></form>
 <section data-ne-review hidden><h3>3. Revisar antes de crear</h3><dl class="ne-review"></dl><p>Al confirmar se guardarán la persona, el contrato y el registro de esta operación.</p><div class="ne-actions"><button class="button" type="button" data-ne-back>Volver a editar</button><button class="button primary" type="button" data-ne-confirm>Confirmar y crear legajo</button></div></section>
 <section data-ne-pending hidden><h3>Confirmación pendiente</h3><p>El formulario conserva la misma clave. No prepares otra alta hasta conocer el resultado.</p><small data-ne-key></small><div class="ne-actions"><button type="button" class="button primary" data-ne-recover>Consultar este intento</button><button type="button" class="button" data-ne-resend>Reenviar el mismo intento</button></div></section>
 <section data-ne-success hidden><h3>Legajo creado</h3><p data-ne-receipt></p><p>El legajo ya está guardado. Podés continuar con su carga familiar y, después, registrar los certificados de sus hijos.</p><div class="ne-actions"><a class="button primary" data-ne-family>Cargar familia</a><a class="button" data-ne-open>Abrir ficha</a><a class="button" data-ne-monthly>Preparar novedad mensual</a><a class="button" data-ne-fixed>Preparar novedad fija</a><button type="button" class="button" data-ne-close>Cerrar</button></div><p>Cada registro se confirma por separado con el permiso vigente. Las novedades requieren revisión independiente. Este alta no genera haberes.</p></section>
 <button type="button" class="ne-close" data-ne-cancel aria-label="Cerrar alta">×</button>`;
export function mountEmployeeCreate(button){
 if(!button||button.dataset.employeeCreateMounted)return;button.dataset.employeeCreateMounted='true';
 const dialog=document.createElement('dialog');dialog.className='native-employee-dialog';dialog.setAttribute('aria-labelledby','ne-title');dialog.innerHTML=formMarkup;document.body.append(dialog);
 const $=s=>dialog.querySelector(s),form=$('form'),fields=$('.ne-fields'),feedback=$('.ne-feedback');
 let context=null,prepared=null,pending=null,busy=false,blocked=false,generation=0,controller=null;
 const message=(text,error=false)=>{feedback.textContent=text;feedback.dataset.error=String(error);};
 const toggleBusy=value=>{busy=value;dialog.querySelectorAll('button').forEach(b=>b.disabled=value);fields.disabled=value||blocked||context?.canCreate!==true;
  for(const selector of ['[data-ne-confirm]','[data-ne-recover]','[data-ne-resend]'])$(selector).disabled=value||blocked||document.hidden;
  $('[data-ne-access-panel]').hidden=!blocked;$('[data-ne-access]').disabled=value||document.hidden;
  dialog.querySelectorAll('[data-ne-cancel],[data-ne-close]').forEach(b=>b.disabled=false);
 };
 const show=part=>{form.hidden=part!=='form';for(const name of ['review','pending','success'])$(`[data-ne-${name}]`).hidden=part!==name;};
 const live=token=>token===generation&&dialog.open&&!document.hidden;
 const begin=()=>{controller?.abort();controller=new AbortController();return ++generation;};
 function clearVisible(){form.reset();$('.ne-review').replaceChildren();$('[data-ne-receipt]').textContent='';for(const name of ['open','family','monthly','fixed'])$('[data-ne-'+name+']').removeAttribute('href');}
 function withdraw(text='Tu sesión o permiso cambió. Se retiraron los datos visibles. Comprobá el acceso para continuar.'){
  generation++;controller?.abort();context=null;prepared=null;blocked=true;if(pending)pending.uncertain=true;clearVisible();show(pending?'pending':'form');message(text,true);toggleBusy(false);
 }
 function denied(e){if([401,403].includes(e.status)||e.code==='NATIVE_EMPLOYEE_SCOPE_CHANGED'){withdraw(e.code==='NATIVE_EMPLOYEE_SCOPE_CHANGED'?e.message:undefined);return true;}return false;}
 function selectOptions(name,items,hint){const select=form.elements[name];select.replaceChildren(new Option(hint,''));for(const item of [...items].sort((a,b)=>catalogOrder.compare(a.code,b.code)||catalogOrder.compare(a.label,b.label)))select.add(new Option(item.code+' · '+item.label,item.code));}
 const catalog=kind=>context.catalog.items.filter(x=>x.kind===kind);
 function fillCatalog(preserve=false){
  const saved=Object.fromEntries(['agreementCode','categoryCode','organizationId','sectorCode'].map(name=>[name,form.elements[name].value]));
  for(const [name,kind,hint]of [['agreementCode','agreements','Seleccioná convenio'],['organizationId','organizations','Seleccioná sector'],['sectorCode','sectors','Seleccioná repartición']]){selectOptions(name,catalog(kind),hint);if(preserve)form.elements[name].value=saved[name];}
  selectOptions('categoryCode',catalog('categories').filter(x=>x.agreementCode===form.elements.agreementCode.value),'Primero elegí convenio');if(preserve)form.elements.categoryCode.value=saved.categoryCode;
  form.elements.birthDate.max=context.today;$('[data-number-help]').textContent='Siguiente sugerido: '+context.suggestedLegajo+'. Dejalo vacío para que se asigne al confirmar; la sugerencia no reserva el número.';
 }
 async function initialize(){
  const token=begin();context=null;prepared=null;blocked=false;clearVisible();show('form');message('Consultando permisos y catálogos…');toggleBusy(true);
  try{const value=employeeCreationBootstrap(await request({resource:'bootstrap'},null,null,controller.signal));if(!live(token))return;
   context=value;fillCatalog();
   message(context.canCreate?'Completá los datos y revisá el alta antes de confirmar.':'Tu cuenta puede consultar Personas, pero no tiene habilitada la creación de legajos.',!context.canCreate);

  }catch(e){if(live(token)&&!denied(e))message(e.message,true);}finally{if(token===generation){toggleBusy(false);if(context?.canCreate)form.elements.fullName.focus();}}
 }
 const close=()=>{generation++;controller?.abort();if(pending)pending.uncertain=true;context=null;prepared=null;clearVisible();dialog.close();toggleBusy(false);button.textContent=pending?'Resolver alta pendiente':'Nuevo legajo';button.focus();};
 button.addEventListener('click',()=>{if(dialog.open)return;dialog.showModal();if(pending){blocked=true;show('pending');message('Hay un alta sin confirmación. Se conserva el intento original; comprobá el acceso antes de consultarlo.',true);toggleBusy(false);}else initialize();});
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.querySelectorAll('[data-ne-cancel],[data-ne-close]').forEach(b=>b.addEventListener('click',close));
 form.elements.agreementCode.addEventListener('change',()=>selectOptions('categoryCode',catalog('categories').filter(x=>x.agreementCode===form.elements.agreementCode.value),'Seleccioná categoría'));
 form.addEventListener('submit',e=>{e.preventDefault();if(busy||blocked||!context?.canCreate)return;
  try{const draft=employeeDraft(Object.fromEntries(EMPLOYEE_FIELDS.map(k=>[k,form.elements[k].value])),context.today,{requireJurisdiction:true});prepared={draft,catalogVersion:context.catalog.version};
   const rows=[['Persona',draft.fullName],['DNI / CUIL',draft.dni+' / '+draft.cuil],['Nacimiento',draft.birthDate],['Sexo registrado',draft.sexCode||'Sin informar'],['Legajo',draft.legajo||'Asignación automática'],['Ingreso',draft.startDate],['Jurisdicción',draft.jurisdictionCode],['Convenio',form.elements.agreementCode.selectedOptions[0].text],['Categoría',form.elements.categoryCode.selectedOptions[0].text],['Sector',form.elements.organizationId.selectedOptions[0].text],['Repartición',form.elements.sectorCode.selectedOptions[0].text],['Cargo o función',draft.jobTitle||'Sin informar'],['Documento de alta',draft.legalReference]];
   $('.ne-review').innerHTML=rows.map(([label,value])=>'<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>').join('');show('review');message('Todavía no se guardó. Verificá DNI, CUIL, fecha y encuadre.');$('[data-ne-confirm]').focus();
  }catch(error){message(error.message,true);if(error.field)form.elements[error.field]?.focus();}
 });
 $('[data-ne-back]').addEventListener('click',()=>{if(!pending){show('form');form.elements.fullName.focus();}});
 function accepted(receipt){
  if(!receipt||receipt.origin!=='MUNICONTROL'||receipt.accountCreated!==false||receipt.payrollCalculated!==false)throw Object.assign(Error('La respuesta no confirma un alta municipal sin efectos salariales.'),{status:503});
  if(!pending)throw Error('Falta el intento original.');employeeReceipt(receipt,pending.body.draft);
  if(employeeScopeKey(context?.scope)!==pending.scopeKey)throw Error('El recibo requiere verificar el acceso original.');
  pending=null;prepared=null;form.reset();show('success');$('[data-ne-receipt]').textContent=receipt.name+' · Legajo '+receipt.legajo+' · Ingreso '+receipt.startDate+' · Jurisdicción '+receipt.jurisdictionCode;
  $('.ne-review').replaceChildren();button.textContent='Nuevo legajo';
  $('[data-ne-open]').href='/personal?contractId='+encodeURIComponent(receipt.contractId)+'#legajos';message('Alta guardada en Neon. Ya podés abrir su ficha.');
  $('[data-ne-fixed]').href='/novedades-nomina.html?fixedContractId='+encodeURIComponent(receipt.contractId)+'#fixedNovelties';
  $('[data-ne-monthly]').href='/novedades-nomina.html?monthlyContractId='+encodeURIComponent(receipt.contractId)+'#nativeMonthlyPanel';
  $('[data-ne-family]').href='/personal?contractId='+encodeURIComponent(receipt.contractId)+'&section=family#legajos';
  document.dispatchEvent(new CustomEvent('mc:native-employee-created',{detail:{contractId:receipt.contractId,legajo:receipt.legajo}}));
 }
 async function dispatch(attempt,recovery,token){
  try{const r=await request(recovery?{resource:'attempt',key:attempt.key}:null,recovery?null:attempt.body,attempt.key,controller.signal,attempt.scopeKey);if(!live(token)||pending!==attempt)return;accepted(r);}
  catch(e){if(!live(token)||pending!==attempt)return;if(denied(e))return;
   if(!recovery&&!attempt.uncertain&&employeeCreationFinalRefusal(e)){pending=null;prepared=null;show('form');message(e.message,true);}
   else{attempt.uncertain=true;show('pending');message(e.message||'La respuesta no llegó; se conserva el intento.',true);}
  }
 }
 async function checkedBootstrap(token,scopeKey){
  const fresh=employeeCreationBootstrap(await request({resource:'bootstrap'},null,null,controller.signal));if(!live(token))return null;
  if(employeeScopeKey(fresh.scope)!==scopeKey){withdraw('Este intento corresponde a otro municipio o membresía. Volvé al acceso que lo inició; no se enviaron datos.');return null;}
  if(!fresh.canCreate){withdraw('El acceso vigente no permite confirmar el alta. Se conserva cualquier intento pendiente.');return null;}return fresh;
 }
 async function send(recovery=false){if(busy||blocked||!pending||document.hidden)return;const attempt=pending,token=begin();toggleBusy(true);message(recovery?'Consultando el resultado del mismo intento…':'Reenviando exactamente el mismo intento…');
  try{const fresh=await checkedBootstrap(token,attempt.scopeKey);if(!fresh||pending!==attempt)return;context=fresh;await dispatch(attempt,recovery,token);}
  catch(e){if(live(token)&&!denied(e))message(e.message,true);}finally{if(token===generation)toggleBusy(false);}
 }
 $('[data-ne-confirm]').addEventListener('click',async()=>{if(busy||blocked||document.hidden||!prepared||pending||!context)return;const candidate=prepared,old=context,token=begin();toggleBusy(true);message('Comprobando el acceso y el catálogo antes de crear…');
  try{const fresh=await checkedBootstrap(token,employeeScopeKey(old.scope));if(!fresh||prepared!==candidate)return;
   context=fresh;if(!employeeCatalogEqual(old.catalog,fresh.catalog)){prepared=null;fillCatalog(true);show('form');message('El catálogo cambió. Tus datos se conservan; revisá nuevamente el encuadre antes de confirmar.',true);return;}
   employeeDraft(candidate.draft,fresh.today,{requireJurisdiction:true});pending={key:crypto.randomUUID(),body:Object.freeze({draft:Object.freeze({...candidate.draft}),catalogVersion:candidate.catalogVersion}),scopeKey:employeeScopeKey(fresh.scope),uncertain:false};$('[data-ne-key]').textContent='Referencia del intento: '+pending.key;show('pending');await dispatch(pending,false,token);
  }catch(e){if(live(token)&&!denied(e))message(e.message,true);}finally{if(token===generation)toggleBusy(false);}
 });
 $('[data-ne-recover]').addEventListener('click',()=>send(true));$('[data-ne-resend]').addEventListener('click',()=>send(false));
 $('[data-ne-access]').addEventListener('click',async()=>{if(busy||document.hidden)return;const token=begin();toggleBusy(true);message('Comprobando el acceso sin crear ni reenviar…');
  try{const fresh=employeeCreationBootstrap(await request({resource:'bootstrap'},null,null,controller.signal));if(!live(token))return;
   if(pending&&employeeScopeKey(fresh.scope)!==pending.scopeKey){withdraw('Este intento corresponde a otro municipio o membresía. Volvé al acceso que lo inició; no se enviaron datos.');return;}
   context=fresh;blocked=!fresh.canCreate;if(blocked){message('Tu cuenta no tiene habilitada la creación de legajos. El intento pendiente se conserva.',true);return;}
   if(!pending)fillCatalog();show(pending?'pending':'form');message(pending?'Acceso comprobado. Consultá este intento o reenviá exactamente el mismo; no se enviaron datos.':'Acceso comprobado. Elegí y revisá nuevamente los datos del alta.');
  }catch(e){if(live(token)&&!denied(e))message(e.message,true);}finally{if(token===generation)toggleBusy(false);}
 });
 window.addEventListener('beforeunload',e=>{if(busy||pending){e.preventDefault();e.returnValue='';}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)withdraw('Se retiraron los datos visibles al ocultar la pantalla. Comprobá el acceso para continuar.');else toggleBusy(busy);});
 window.addEventListener('pagehide',()=>withdraw());
 document.addEventListener('municontrol:capabilities-ready',event=>{const caps=event.detail?.tenantCapabilities;if(caps instanceof Set&&(!caps.has('workforce.employee.read')||!caps.has('employee.record.create')))withdraw();});
 document.getElementById('logoutButton')?.addEventListener('click',()=>{withdraw();dialog.close();button.textContent=pending?'Resolver alta pendiente':'Nuevo legajo';});
}
if(typeof document!=='undefined')mountEmployeeCreate(document.querySelector('[data-employee-create]'));
