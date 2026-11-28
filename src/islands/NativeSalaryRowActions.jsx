import {useEffect,useId,useRef,useState} from 'react';
import {SALARY_UNITS,salaryRowKey,salarySerialized} from '../../assets/native-salary-catalog-model.js';
import {salaryCoefficientPercentage} from '../../assets/native-salary-percentage-model.js';
import {salaryRowActionAvailability,salaryRowActivatePlan,salaryRowEndPlan,salaryRowIncreasePlan,salaryRowMonthAfter,salaryRowPeriod} from '../../assets/native-salary-row-actions-model.js';
import {salaryDefinitionTitle as title} from './NativeSalaryDefinition.jsx';

const ACTIONS=[['activate','Activar para un mes o período'],['increase','Aumentar desde un mes'],['end','Dar de baja desde un mes']];
const shown=value=>value===null?'No informado':value;
const months=row=>`${row.validFrom} a ${row.validUntil??'sin término'}`;

// «Acciones» of one definition of the draft, opened from its row as a modal dialog: choose → declare → compare → incorporate.
// It only hands a reviewed complete draft to onApply. It never sends or approves a version.
export default function NativeSalaryRowActions({row,items,origin,disabled,individualEditing=false,onApply,onNotice,onClose}){
 const id=useId(),dialog=useRef(null),stepHeading=useRef(null),moved=useRef(false),finished=useRef(false);
 const [action,setAction]=useState(null),[review,setReview]=useState(null),[problem,setProblem]=useState('');
 const [startMonth,setStartMonth]=useState(''),[endMonth,setEndMonth]=useState(''),[value,setValue]=useState(row.value??''),[reference,setReference]=useState('');
 // The increase can be typed as a percentage (2) or as a coefficient (1,02): both are the same exact increase.
 const [increaseForm,setIncreaseForm]=useState('percentage'),[increase,setIncrease]=useState(''),[precision,setPrecision]=useState(String(row.precision));
 const name=title(row),available=salaryRowActionAvailability(row),reasons=[...new Set(ACTIONS.map(([key])=>available[key]).filter(Boolean))],selection={key:salaryRowKey(row),before:row};
 const blocked=individualEditing?'Terminá la edición de la fila, o usá «Limpiar fila», antes de usar las acciones. Lo que escribiste se conserva.':disabled?'En este momento el borrador no se puede cambiar. Cerrá, revisá el aviso de arriba de la pantalla y volvé a intentar.':null;
 const typed=increase.trim().replace(',','.'),equivalent=(()=>{if(increaseForm!=='coefficient'||typed==='')return null;try{return salaryCoefficientPercentage(typed);}catch{return null;}})();
 const after=salaryRowMonthAfter(endMonth);
 // Closing returns the keyboard to the «Acciones» button of the row (or to the grid when that row left the page).
 useEffect(()=>{const node=dialog.current;node.showModal();onNotice(`Acciones de ${name} abiertas. El borrador no cambia hasta que incorpores una.`);return()=>{if(node.open)node.close();(origin?.isConnected?origin:document.querySelector('[data-native-salary] .sc-grid-wrap'))?.focus();};},[]);
 useEffect(()=>{setReview(null);},[items,disabled]);
 // The comparison replaces the form (and back): the keyboard follows to the heading of what is now on screen.
 useEffect(()=>{if(moved.current)stepHeading.current?.focus();moved.current=true;},[!!review]);
 const plan=()=>{
  const document=reference.trim().normalize('NFC');
  return action==='activate'?salaryRowActivatePlan(items,selection,{validFrom:startMonth,validUntil:endMonth||null,value:value.trim()===''?null:value.trim().replace(',','.'),ruleReference:document})
   :action==='increase'?salaryRowIncreasePlan(items,selection,{validFrom:startMonth,increaseForm,increase:typed,precision:Number(precision),ruleReference:document})
   :salaryRowEndPlan(items,selection,{validUntil:endMonth});
 };
 const edit=(setter,next)=>{setter(next);setProblem('');};
 function choose(next){setAction(next);setReview(null);setProblem('');setStartMonth('');setEndMonth('');setValue(row.value??'');setReference('');setIncreaseForm('percentage');setIncrease('');setPrecision(String(row.precision));}
 function compare(){if(blocked)return;try{setReview(plan());setProblem('');}catch(error){setReview(null);setProblem(error.message);}}
 function apply(){if(blocked||!review)return;try{const next=plan();if(salarySerialized(next)!==salarySerialized(review))throw Error('Cambió lo que se comparó. Volvé a comparar antes de incorporar.');finished.current=true;onApply(next.items);onNotice(next.done);onClose();}catch(error){setReview(null);setProblem(error.message);}}
 function leave(){if(finished.current)return;finished.current=true;onNotice('Acciones cerradas. El borrador no cambió.');onClose();}
 const byKey=review?new Map(review.items.map(item=>[salaryRowKey(item),item])):null;
 const depends=item=>item.dependencies.length?item.dependencies.map(key=>byKey.has(key)?title(byKey.get(key)):key).join('; '):'Ninguna';
 const facts=[['Valor',item=>shown(item.value),()=>true],['Decimales',item=>String(item.precision),change=>(change.before??row).precision!==change.after.precision],['Vigencia',months,()=>true],['Documento',item=>item.ruleReference,()=>true],['Depende de',depends,change=>change.before?depends(change.before)!==depends(change.after):change.after.dependencies.length>0]];
 // On a phone each fact is a line with «Antes» and «Después» below it, so an amount is never cut to fit three columns. The
 // roles are written out because the rows are laid out as a grid there, and some browsers then stop announcing a table.
 const comparison=change=><table key={change.key} role="table" className="sc-row-compare" aria-labelledby={id+change.key}><caption id={id+change.key}>{title(change.after)} · {!change.before?'Vigencia nueva':change.before.validUntil!==change.after.validUntil?`Se cierra en ${change.after.validUntil}`:'Pasa a referirse a la vigencia nueva'}</caption><thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Dato</th><th role="columnheader" scope="col">Antes</th><th role="columnheader" scope="col">Después</th></tr></thead><tbody role="rowgroup">{facts.filter(([,,applies])=>applies(change)).map(([label,read])=>{const was=change.before?read(change.before):'No existía',now=read(change.after);return <tr role="row" key={label}><th role="rowheader" scope="row">{label}</th><td role="cell">{was}</td><td role="cell" className={was===now?undefined:'sc-row-changed'}>{now}</td></tr>;})}</tbody></table>;
 const own=review?review.changes.filter(change=>change.key===review.key||change.key===review.newKey):[],others=review?review.changes.filter(change=>!own.includes(change)):[];
 return <dialog ref={dialog} className="sc-row-actions" data-salary-row-actions-panel aria-labelledby={id+'title'} onClose={leave}><style>{css}</style>
  <h3 id={id+'title'}>Acciones · {name}</h3>
  <p className="sc-row-facts">{row.label} · valor {shown(row.value)} ({SALARY_UNITS[row.unit]}, {row.precision} decimales) · rige {salaryRowPeriod(row.validFrom,row.validUntil)}</p>
  {blocked&&<p className="sc-row-problem">{blocked}</p>}
  <fieldset disabled={!!blocked}>
  {!review&&<>
   <div className="sc-row-choice" role="group" aria-label="Qué querés hacer con esta definición">{ACTIONS.map(([key,label])=><button key={key} type="button" aria-pressed={action===key} disabled={available[key]!==null} onClick={()=>choose(key)}>{label}</button>)}</div>
   {reasons.length>0&&<ul className="sc-row-reasons">{reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
   {action==='activate'&&<><h4 ref={stepHeading} tabIndex={-1}>Activar para un mes o período</h4>
    <p>Crea una vigencia nueva de esta definición con sus meses, su valor y su documento. {row.validUntil===null?`Esta vigencia no tiene término: si la nueva empieza después de ${row.validFrom}, esta se cierra el mes anterior.`:'No puede pisar meses de otra vigencia de esta definición.'}</p>
    <div className="sc-row-form">
     <label>Mes inicial<input type="month" min="1900-01" max="2099-12" value={startMonth} onChange={event=>edit(setStartMonth,event.target.value)}/></label>
     <label>Mes final<input type="month" min="1900-01" max="2099-12" aria-label="Mes final" aria-describedby={id+'end'} value={endMonth} onChange={event=>edit(setEndMonth,event.target.value)}/><small id={id+'end'}>Último mes en que vale. Para un solo mes, repetí el inicial. Vacío: sin término.</small></label>
     <label>Valor<input inputMode="decimal" maxLength={28} aria-label="Valor" aria-describedby={id+'value'} value={value} onChange={event=>edit(setValue,event.target.value)}/><small id={id+'value'}>{SALARY_UNITS[row.unit]}, {row.precision} decimales. Sin puntos de miles.{row.kind==='scale'?'':' Vacío: no informado.'}</small></label>
     <label>Documento que respalda la vigencia<input maxLength={180} value={reference} onChange={event=>edit(setReference,event.target.value)}/></label>
    </div></>}
   {action==='increase'&&<><h4 ref={stepHeading} tabIndex={-1}>Aumentar desde un mes</h4>
    <p>El importe de hoy es {row.value}. El aumento se aplica exacto, sin redondear, y la vigencia de hoy se cierra el mes anterior.</p>
    <div className="sc-row-form">
     <label>Mes inicial del aumento<input type="month" min="1900-01" max="2099-12" value={startMonth} onChange={event=>edit(setStartMonth,event.target.value)}/></label>
     <label>Cómo informás el aumento<select aria-label="Cómo informás el aumento" value={increaseForm} onChange={event=>{setIncreaseForm(event.target.value);setIncrease('');setProblem('');}}><option value="percentage">Porcentaje (2 es un 2 %)</option><option value="coefficient">Coeficiente (1,02 es un 2 %)</option></select></label>
     {increaseForm==='coefficient'
      ?<label>Coeficiente de aumento<input inputMode="decimal" maxLength={12} aria-label="Coeficiente de aumento" aria-describedby={id+'increase'} value={increase} onChange={event=>edit(setIncrease,event.target.value)}/><small id={id+'increase'}>{equivalent===null?'Mayor que 1, con coma o punto decimal. Por ejemplo 1,02.':`Equivale a un aumento del ${equivalent.replace('.',',')} %. Se aplica exacto, sin redondear.`}</small></label>
      :<label>Porcentaje de aumento<input inputMode="decimal" maxLength={27} aria-label="Porcentaje de aumento" aria-describedby={id+'increase'} value={increase} onChange={event=>edit(setIncrease,event.target.value)}/><small id={id+'increase'}>Mayor que cero, con coma o punto decimal. Por ejemplo 2 o 2,5.</small></label>}
     <label>Decimales del importe nuevo<select aria-label="Decimales del importe nuevo" aria-describedby={id+'precision'} value={precision} onChange={event=>edit(setPrecision,event.target.value)}>{Array.from({length:9},(_,number)=><option key={number} value={number}>{number} decimales</option>)}</select><small id={id+'precision'}>Si no alcanzan para el resultado exacto, la comparación se detiene sin redondear.</small></label>
     <label>Documento que respalda el aumento<input maxLength={180} value={reference} onChange={event=>edit(setReference,event.target.value)}/></label>
    </div></>}
   {action==='end'&&<><h4 ref={stepHeading} tabIndex={-1}>Dar de baja desde un mes</h4>
    <p>Elegí el último mes en que vale. Desde el mes siguiente deja de regir. Su valor, su documento y su historia se conservan.</p>
    <div className="sc-row-form"><label>Último mes en que vale<input type="month" min={row.validFrom} max="2099-12" aria-label="Último mes en que vale" aria-describedby={id+'last'} value={endMonth} onChange={event=>edit(setEndMonth,event.target.value)}/><small id={id+'last'}>{after?`Deja de regir desde ${after}.`:'Es el último mes que se liquida con esta definición.'}</small></label></div></>}
   <div role="alert">{problem&&<p className="sc-row-problem">{problem}</p>}</div>
   {action&&<div className="sc-actions"><button type="button" className="sc-primary" onClick={compare}>Comparar antes y después</button></div>}
  </>}
  {review&&<section data-salary-row-impact aria-labelledby={id+'review'}>
   <h4 id={id+'review'} ref={stepHeading} tabIndex={-1}>Antes y después · {ACTIONS.find(([key])=>key===review.action)[1]}</h4>
   <ul className="sc-row-summary">{review.summary.map(line=><li key={line}>{line}</li>)}</ul>
   {own.map(comparison)}
   {others.length>0&&<details><summary>Ver los {others.length} cambios en definiciones que dependen de esta</summary>{others.map(comparison)}</details>}
   <p className="sc-note">Al incorporar, el cambio queda sólo en el borrador. Falta enviar la versión y que otra persona la apruebe.</p>
   <div className="sc-actions"><button type="button" className="sc-primary" onClick={apply}>Incorporar al borrador</button><button type="button" onClick={()=>setReview(null)}>Volver a corregir</button></div>
  </section>}
  </fieldset>
  <div className="sc-actions sc-row-close"><button type="button" onClick={()=>dialog.current.close()}>Cerrar sin cambios</button></div>
 </dialog>;
}
// Controls inherit the 44 px minimum of the workspace; nothing here lowers it. On a phone every group is one column.
const css=`.sc-row-actions h3{margin:0 0 6px;overflow-wrap:anywhere}.sc-row-actions h4{margin:18px 0 8px;overflow-wrap:anywhere}.sc-row-actions p,.sc-row-actions li{overflow-wrap:anywhere}.sc-row-facts{margin:0 0 14px;color:#4d6973}.sc-row-choice{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.sc-workspace .sc-row-choice button{text-align:left;font-weight:600;white-space:normal}.sc-workspace .sc-row-choice button[aria-pressed=true]{border-color:#007d75;background:#e3f3f0;box-shadow:inset 0 0 0 2px #007d75}.sc-row-reasons{margin:10px 0 0;padding-left:18px;color:#4d6973;font-size:.92em}.sc-row-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:12px 0}.sc-row-form input,.sc-row-form select{width:100%}.sc-row-actions small{display:block;font-weight:400;color:#4d6973}.sc-row-problem{margin:12px 0;padding:10px 12px;border-left:4px solid #a5660d;background:#fff6e3;color:#5a3600}.sc-row-summary{margin:0 0 12px;padding-left:18px}.sc-row-summary li{margin:4px 0}.sc-row-compare{width:100%;table-layout:fixed;border-collapse:collapse;margin:0 0 14px;font-size:.94em}.sc-row-compare caption{text-align:left;font-weight:700;padding:6px 0;overflow-wrap:anywhere}.sc-row-actions .sc-row-compare th,.sc-row-actions .sc-row-compare td{border:1px solid #dce9e5;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere;font-size:inherit;letter-spacing:0;text-transform:none;color:inherit}.sc-row-actions .sc-row-compare thead th{background:#eef7f4;font-weight:700}.sc-row-actions .sc-row-compare tbody th{background:#f7fbfa;font-weight:600;overflow-wrap:normal}.sc-row-compare th:first-child{width:7.4em}.sc-row-actions .sc-row-compare .sc-row-changed{background:#fff6e3;font-weight:700}.sc-row-close{justify-content:flex-end;margin-bottom:0}@media(max-width:700px){.sc-workspace .sc-row-actions{padding:16px}.sc-row-choice,.sc-row-form{grid-template-columns:minmax(0,1fr)}.sc-row-compare,.sc-row-compare caption,.sc-row-compare thead,.sc-row-compare tbody{display:block}.sc-row-compare tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border:1px solid #dce9e5;border-top:0}.sc-row-compare thead tr{border-top:1px solid #dce9e5}.sc-row-actions .sc-row-compare th,.sc-row-actions .sc-row-compare td{border:0}.sc-row-actions .sc-row-compare tr>:last-child{border-left:1px solid #dce9e5}.sc-row-actions .sc-row-compare tbody th{grid-column:1/-1;width:auto;border-bottom:1px solid #dce9e5}.sc-row-actions .sc-row-compare thead th:first-child{position:absolute;clip-path:inset(100%)}}`;
