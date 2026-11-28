// Interactive synthetic lot. The real authenticated owner remains the only actor.
const captions={empty:'Sin preparar',pending:'Pendiente de revisión',approved:'Aprobada en el ensayo',rejected:'Rechazada en el ensayo'};
export function practiceAmount(value){
  if(typeof value!=='string')return null;
  const m=/^(0|[1-9][0-9]{0,7})(?:[.,]([0-9]{1,2}))?$/.exec(value.trim());
  return m?m[1]+'.'+(m[2]||'').padEnd(2,'0'):null;
}
export function mountManualNovelty(container,{request,invalidate}){
  const doc=container.ownerDocument;
  let stopped=false,busy=false,p=null,note='';
  const currency=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(v));
  const el=(tag,text,cls)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  function control(text,handler,primary=false){
    const btn=el('button',text,primary?'primary':'secondary');btn.type='button';btn.disabled=busy;btn.addEventListener('click',handler);return btn;
  }
  function draw(focus=false){
    if(stopped)return;
    const title=el('h3','Practicá con una novedad');
    const intro=el('p','Ingresá un importe de prueba y recorré la preparación y la revisión. Cada paso queda a tu nombre en esta jornada; no genera novedades en la nómina.');
    const state=el('p',p?'Estado: '+captions[p.state]+' · Revisión '+p.revision:'Consultando el ejercicio…','manual-state');
    const description=el('p',note);description.setAttribute('role','status');description.setAttribute('aria-live','polite');
    container.replaceChildren(title,intro,state);
    if(!p){container.append(description);if(!busy)container.append(control('Volver a consultar',()=>load()));return;}
    if(p.state==='empty'){
      const form=el('form'), field=el('input'),label=el('label','Importe de ensayo ($)');label.htmlFor='qa-manual-importe';
      field.id=label.htmlFor;field.inputMode='decimal';field.autocomplete='off';field.placeholder='Ej.: 1500,50';field.maxLength=11;field.disabled=busy;
      const submit=el('button','Preparar novedad','primary');submit.type='submit';submit.disabled=busy;
      const helper=el('small','Se admite cero. Ingresá el importe sin separador de miles.');helper.id='qa-manual-ayuda';
      field.setAttribute('aria-describedby',helper.id);form.append(label,field,helper,submit);form.addEventListener('submit',e=>{
        e.preventDefault();const amount=practiceAmount(field.value);if(amount===null){description.textContent='Revisá el importe: usá hasta ocho enteros y dos decimales.';field.setAttribute('aria-invalid','true');field.focus();return;}
        act('draft',amount);
      });container.append(form);
      if(focus)field.focus();
    }else{
      const val=el('p','Importe preparado: '+currency(p.amount));container.append(val);
      if(p.state==='pending'){
        const actions=el('div',undefined,'actions');
        actions.append(control('Aprobar en el ensayo',()=>act('approve',null),true),control('Rechazar en el ensayo',()=>act('reject',null)));
        container.append(actions);
      }else{
        container.append(control('Empezar otra novedad de ensayo',()=>act('reset',null)));
      }
      if(focus){state.tabIndex=-1;state.focus();}
    }
    container.append(description);
  }
  function apply(reply){
    const state=reply?.practice;
    if(!state||!Number.isSafeInteger(state.revision)||!Object.hasOwn(captions,state.state)||
       (state.state==='empty'?state.amount!==null:typeof state.amount!=='string'||practiceAmount(state.amount)!==state.amount))throw new Error('invalid_practice');
    p=state;
  }
  function failure(e){
    if(stopped)return;
    if([401,403,409,410].includes(e?.status)){invalidate();return;}
    // After an uncertain response, never re-send automatically. Reload server state.
    p=null;note='No se pudo confirmar el estado. Volvé a consultarlo antes de repetir el paso.';draw();
  }
  async function load(){if(stopped||busy)return;busy=true;draw();try{const reply=await request('practice');if(stopped)return;apply(reply);note='';}
    catch(e){if(!stopped){busy=false;failure(e);}return;}busy=false;draw();}
  async function act(step,amount){
    if(stopped||busy||!p)return;
    const revision=p.revision;busy=true;note='Guardando el paso de ensayo…';draw();
    try{const reply=await request('practice',{step,expectedRevision:revision,amount});if(stopped)return;
      apply(reply);note=step==='draft'?'Preparada. Revisá el importe antes de decidir.':step==='reset'?'Listo para otra práctica.':'Decisión guardada en la jornada de prueba.';}
    catch(e){if(!stopped){busy=false;failure(e);}return;}busy=false;draw(true);
  }
  void load();return {destroy(){stopped=true;p=null;note='';container.replaceChildren();}};
}
