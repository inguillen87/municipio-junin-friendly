import { employeeDraft, EMPLOYEE_FIELDS } from './native-employee-contract.js';
const URL_API='/api/internal-native-employees';
const catalogOrder=new Intl.Collator('es',{numeric:true,sensitivity:'base'});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function request(resource,body,key){
 const options={method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json'}};
 if(body){options.headers['Content-Type']='application/json';options.headers['Idempotency-Key']=key;options.body=JSON.stringify(body);}
 const response=await fetch(URL_API+(resource?'?'+new URLSearchParams(resource):''),options);let result;
 try{result=await response.json();}catch{throw Object.assign(Error('No se recibió una confirmación válida.'),{status:503});}
 if(!response.ok||!result?.ok)throw Object.assign(Error(result?.error||'No se completó la operación.'),{status:response.status,code:result?.code});
 return result.data;
}
const formMarkup=`<header class="ne-heading"><p>PERSONAS · ALTA PROPIA</p><h2 id="ne-title">Nuevo legajo municipal</h2><span>Registrá a la persona y su encuadre laboral en MuniControl, sin importar un archivo de GRH.</span></header>
 <div class="ne-feedback" role="status" aria-live="polite">Consultando permisos y catálogos…</div>
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
 <section data-ne-success hidden><h3>Legajo creado</h3><p data-ne-receipt></p><div class="ne-actions"><a class="button primary" data-ne-open>Abrir ficha</a><a class="button" data-ne-monthly>Preparar novedad mensual</a><a class="button" data-ne-fixed>Preparar novedad fija</a><button type="button" class="button" data-ne-close>Cerrar</button></div><p>La novedad requiere permiso vigente y revisión independiente. Este alta no genera haberes.</p></section>
 <button type="button" class="ne-close" data-ne-cancel aria-label="Cerrar alta">×</button>`;
export function mountEmployeeCreate(button){
 if(!button||button.dataset.employeeCreateMounted)return;button.dataset.employeeCreateMounted='true';
 const dialog=document.createElement('dialog');dialog.className='native-employee-dialog';dialog.setAttribute('aria-labelledby','ne-title');dialog.innerHTML=formMarkup;document.body.append(dialog);
 const $=s=>dialog.querySelector(s),form=$('form'),fields=$('.ne-fields'),feedback=$('.ne-feedback');
 let context=null,prepared=null,pending=null,busy=false,blocked=false,generation=0;
 const message=(text,error=false)=>{feedback.textContent=text;feedback.dataset.error=String(error);};
 const toggleBusy=value=>{busy=value;dialog.querySelectorAll('button').forEach(b=>b.disabled=value);fields.disabled=value||blocked||context?.canCreate!==true;};
 const show=part=>{form.hidden=part!=='form';for(const name of ['review','pending','success'])$(`[data-ne-${name}]`).hidden=part!==name;};
 function denied(e){if([401,403].includes(e.status)){blocked=true;generation++;context=null;prepared=null;pending=null;form.reset();$('.ne-review').replaceChildren();$('[data-ne-receipt]').textContent='';show('form');fields.disabled=true;message('Tu sesión o permiso cambió. Cerrá el formulario y volvé a ingresar antes de continuar.',true);return true;}return false;}
 function selectOptions(name,items,hint){const select=form.elements[name];select.replaceChildren(new Option(hint,''));for(const item of [...items].sort((a,b)=>catalogOrder.compare(a.code,b.code)||catalogOrder.compare(a.label,b.label)))select.add(new Option(item.code+' · '+item.label,item.code));}
 const catalog=kind=>context.catalog.items.filter(x=>x.kind===kind);
 async function initialize(){
  const token=++generation;context=null;prepared=null;pending=null;blocked=false;form.reset();show('form');message('Consultando permisos y catálogos…');toggleBusy(true);
  try{const value=await request({resource:'bootstrap'});if(token!==generation)return;
   if(value?.version!=='native-employee.v1'||typeof value.canCreate!=='boolean'||!Array.isArray(value.catalog?.items))throw Error('El catálogo no pudo verificarse.');
   context=value;for(const [name,kind,hint]of [['agreementCode','agreements','Seleccioná convenio'],['organizationId','organizations','Seleccioná sector'],['sectorCode','sectors','Seleccioná repartición']])selectOptions(name,catalog(kind),hint);
   selectOptions('categoryCode',[],'Primero elegí convenio');form.elements.birthDate.max=context.today;
   $('[data-number-help]').textContent='Siguiente sugerido: '+context.suggestedLegajo+'. Dejalo vacío para que se asigne al confirmar; la sugerencia no reserva el número.';
   message(context.canCreate?'Completá los datos y revisá el alta antes de confirmar.':'Tu cuenta puede consultar Personas, pero no tiene habilitada la creación de legajos.',!context.canCreate);

  }catch(e){if(!denied(e))message(e.message,true);}finally{toggleBusy(false);if(token===generation&&context?.canCreate)form.elements.fullName.focus();}
 }
 const close=()=>{if(busy||pending){message('Primero resolvé la confirmación del alta pendiente.',true);return;}generation++;dialog.close();form.reset();prepared=null;context=null;$('.ne-review').replaceChildren();$('[data-ne-receipt]').textContent='';button.focus();};
 button.addEventListener('click',()=>{if(dialog.open)return;dialog.showModal();initialize();});
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.querySelectorAll('[data-ne-cancel],[data-ne-close]').forEach(b=>b.addEventListener('click',close));
 form.elements.agreementCode.addEventListener('change',()=>selectOptions('categoryCode',catalog('categories').filter(x=>x.agreementCode===form.elements.agreementCode.value),'Seleccioná categoría'));
 form.addEventListener('submit',e=>{e.preventDefault();if(busy||blocked||!context?.canCreate)return;
  try{const draft=employeeDraft(Object.fromEntries(EMPLOYEE_FIELDS.map(k=>[k,form.elements[k].value])),context.today,{requireJurisdiction:true});prepared={draft,catalogVersion:context.catalog.version};
   const rows=[['Persona',draft.fullName],['DNI / CUIL',draft.dni+' / '+draft.cuil],['Legajo',draft.legajo||'Asignación automática'],['Ingreso',draft.startDate],['Jurisdicción',draft.jurisdictionCode],['Convenio',form.elements.agreementCode.selectedOptions[0].text],['Categoría',form.elements.categoryCode.selectedOptions[0].text],['Sector',form.elements.organizationId.selectedOptions[0].text],['Repartición',form.elements.sectorCode.selectedOptions[0].text],['Documento de alta',draft.legalReference]];
   $('.ne-review').innerHTML=rows.map(([label,value])=>'<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>').join('');show('review');message('Todavía no se guardó. Verificá DNI, CUIL, fecha y encuadre.');$('[data-ne-confirm]').focus();
  }catch(error){message(error.message,true);if(error.field)form.elements[error.field]?.focus();}
 });
 $('[data-ne-back]').addEventListener('click',()=>{if(!pending){show('form');form.elements.fullName.focus();}});
 function accepted(receipt){
  if(!pending||!['42','55'].includes(receipt?.jurisdictionCode)||receipt.jurisdictionCode!==pending.body.draft.jurisdictionCode)throw Object.assign(Error('La jurisdicción confirmada necesita verificación. Consultá el intento original.'),{status:503});
  if(receipt?.version!=='native-employee.v1'||!/^[a-f0-9-]{36}$/.test(receipt.contractId||'')||!/^[1-9]\d{0,8}$/.test(receipt.legajo||'')||receipt.origin!=='MUNICONTROL'||receipt.accountCreated!==false||receipt.payrollCalculated!==false)throw Object.assign(Error('La respuesta necesita verificación. Consultá el intento original.'),{status:503});
  pending=null;prepared=null;form.reset();show('success');$('[data-ne-receipt]').textContent=receipt.name+' · Legajo '+receipt.legajo+' · Ingreso '+receipt.startDate+' · Jurisdicción '+receipt.jurisdictionCode;
  $('[data-ne-open]').href='/personal?contractId='+encodeURIComponent(receipt.contractId)+'#legajos';message('Alta guardada en Neon. Ya podés abrir su ficha.');
  $('[data-ne-fixed]').href='/novedades-nomina.html?fixedContractId='+encodeURIComponent(receipt.contractId)+'#fixedNovelties';
  $('[data-ne-monthly]').href='/novedades-nomina.html?monthlyContractId='+encodeURIComponent(receipt.contractId)+'#nativeMonthlyPanel';
  document.dispatchEvent(new CustomEvent('mc:native-employee-created',{detail:{contractId:receipt.contractId,legajo:receipt.legajo}}));
 }
 async function send(recovery=false){if(busy||blocked||!pending)return;const attempt=pending,token=generation;toggleBusy(true);message(recovery?'Consultando el resultado del mismo intento…':'Guardando el alta…');
  try{const r=await request(recovery?{resource:'attempt',key:attempt.key}:null,recovery?null:attempt.body,attempt.key);if(token!==generation)return;accepted(r);}
  catch(e){if(token!==generation)return;if(denied(e))return;
   if(recovery||!e.status||e.status>=500){show('pending');message(e.message||'La respuesta no llegó; se conserva el intento.',true);}
   else{pending=null;show('form');message(e.message,true);}
  }finally{toggleBusy(false);}
 }
 $('[data-ne-confirm]').addEventListener('click',()=>{if(busy||!prepared||pending)return;pending={key:crypto.randomUUID(),body:prepared};$('[data-ne-key]').textContent='Referencia del intento: '+pending.key;show('pending');send();});
 $('[data-ne-recover]').addEventListener('click',()=>send(true));$('[data-ne-resend]').addEventListener('click',()=>send(false));
 window.addEventListener('beforeunload',e=>{if(busy||pending){e.preventDefault();e.returnValue='';}});
 document.getElementById('logoutButton')?.addEventListener('click',()=>{generation++;pending=null;prepared=null;context=null;blocked=true;dialog.close();form.reset();$('.ne-review').replaceChildren();$('[data-ne-receipt]').textContent='';});
}
if(typeof document!=='undefined')mountEmployeeCreate(document.querySelector('[data-employee-create]'));
