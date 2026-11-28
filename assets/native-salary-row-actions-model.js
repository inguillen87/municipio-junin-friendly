import {SALARY_MAX_ITEMS,SALARY_UNITS,SalaryInputError,salaryDiff,salaryExact,salaryItems,salaryRowKey,salarySerialized} from './native-salary-catalog-model.js';
import {salaryBulkSelection} from './native-salary-bulk-model.js';
import {salaryEffectiveDefinitionsPlan} from './native-salary-effective-model.js';
import {salaryCoefficientPercentage} from './native-salary-percentage-model.js';
import {decimal,exactAdd,exactCompare,exactDivide,exactMultiply,exactSubtract,quantize} from './own-payroll-exact.js';

// Three reviewed actions on ONE chosen definition of the draft: give it a validity for a month or period, increase its
// amount from a month, or give an open validity its last month. Each one only returns the complete next draft and what
// changed; nothing is sent or approved here. Splitting validities and relinking dependents is the reviewed
// «Iniciar vigencia desde otro mes» plan; amounts use the shared exact arithmetic and are never rounded.
const END='9999-12';
const requireInput=(condition,message)=>{if(!condition)throw new SalaryInputError('ROW_ACTION_INVALID',message);};
const month=value=>typeof value==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(value);
const nextMonth=value=>{const [year,number]=value.split('-').map(Number);return number===12?`${year+1}-01`:`${year}-${String(number+1).padStart(2,'0')}`;};
// First month in which a validity that ends in `value` no longer applies; null while the month is incomplete.
export const salaryRowMonthAfter=value=>month(value)?nextMonth(value):null;
const definition=row=>[row.kind,row.agreementCode,row.categoryCode??'',row.code].join(':');
const until=row=>row.validUntil??END;
const name=row=>`${row.kind==='scale'?'Escala':row.kind==='auxiliary'?'Auxiliar':'Concepto'} ${row.code} · convenio ${row.agreementCode}${row.categoryCode?' · clase '+row.categoryCode:''}`;
const describe=row=>`${name(row)} · desde ${row.validFrom}`;
const several=(count,one,many)=>count===1?one:many.replace('#',String(count));
const amount=value=>value===null?'no informado':value;
export const salaryRowPeriod=(from,last)=>last===null?`desde ${from}, sin término`:from===last?`sólo ${from}`:`de ${from} a ${last}`;

// Why an action is not offered for a row, in the words shown beside the disabled button; null when it is offered.
export function salaryRowActionAvailability(row){
 const inactive=row.active?null:'Esta definición está desactivada y se conserva como antecedente. Para volver a usarla, habilitala con «Editar».';
 return {
  activate:inactive,
  increase:inactive??(row.unit!=='money'?`«Aumentar desde un mes» es sólo para valores en pesos. Esta definición está en ${SALARY_UNITS[row.unit].toLowerCase()}.`:row.value===null?'«Aumentar desde un mes» necesita un importe informado y esta definición no lo tiene. Cargalo con «Activar para un mes o período».':exactCompare(decimal(row.value),decimal('0'))===0?'«Aumentar desde un mes» no cambia un importe en cero. Cargá el importe nuevo con «Activar para un mes o período».':null),
  end:inactive??(row.validUntil!==null?`«Dar de baja desde un mes» es para vigencias sin término, y esta ya termina en ${row.validUntil}. Para cambiar ese mes usá «Editar».`:null)
 };
}

// The chosen row is the one the person saw when the panel opened; the shared selection check verifies it again.
function pick(raw,selection,action){
 requireInput(salaryExact(selection,['key','before'])&&typeof selection.key==='string'&&selection.before&&typeof selection.before==='object'&&selection.key===salaryRowKey(selection.before),'No se pudo verificar la definición elegida. Cerrá y volvé a abrir «Acciones» en esa fila.');
 const row=salaryItems(raw).find(item=>salaryRowKey(item)===selection.key);
 requireInput(row&&salarySerialized(row)===salarySerialized(selection.before),'Esta definición cambió en el borrador después de abrir «Acciones». Cerrá y volvé a abrirla para ver sus datos actuales.');
 const unavailable=salaryRowActionAvailability(row)[action];
 requireInput(unavailable===null,unavailable);
 const {current,chosen}=salaryBulkSelection(raw,[selection],{unit:row.unit,precision:row.precision,value:row.value,ruleReference:row.ruleReference});
 return {current,chosen,row:chosen.get(selection.key)};
}
const reference=text=>{requireInput(typeof text==='string'&&text===text.trim()&&text===text.normalize('NFC')&&text.length>=3&&text.length<=180&&!/[<>\u0000-\u001f\u007f]/.test(text),'Escribí el documento que respalda el cambio: entre 3 y 180 caracteres, sin los signos < y >.');return text;};
// Zeros are completed up to the decimals the definition declares (240000 is 240000.00). Extra decimals are never cut.
function declaredValue(row,text){
 if(text===null||text===''){requireInput(row.kind!=='scale','Una escala necesita un importe. No puede quedar sin informar.');return null;}
 requireInput(typeof text==='string'&&/^-?(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,8})?$/.test(text),'Escribí el valor sólo con números, sin puntos de miles; la coma separa los decimales. Por ejemplo 240000 o 240000,50.');
 const [whole,fraction='']=text.split('.');
 requireInput(fraction.length<=row.precision,`Esta definición declara ${row.precision} decimales y el valor tiene más. No se redondea: revisá el valor.`);
 const value=row.precision?`${whole}.${fraction.padEnd(row.precision,'0')}`:whole;
 requireInput(!/^-0(?:\.0+)?$/.test(value),'Para declarar cero escribí 0, sin signo.');
 return value;
}
// Active definitions that refer to this validity and would still be in force after its last month.
const lateDependents=(current,key,from,last)=>current.filter(item=>item.active&&item.dependencies.includes(key)&&until(item)>=from&&until(item)>last);
const lateMessage=(late,last,advice)=>`${describe(late[0])}${late.length>1?several(late.length-1,' y otra definición',' y otras # definiciones'):''} ${late.length>1?'dependen':'depende'} de esta y ${late.length>1?'siguen':'sigue'} vigente${late.length>1?'s':''} después de ${last}. ${advice}`;
// First month without any enabled validity of the definition after `last`, or null when another one follows.
const gapAfter=(items,row,last)=>{if(last===null)return null;const next=nextMonth(last);return items.some(item=>item.active&&definition(item)===definition(row)&&item.validFrom<=next&&until(item)>=next)?null:next;};
const related=count=>count?[several(count,'Una definición que depende de esta pasa a la vigencia nueva con su mismo valor; está en la comparación.','# definiciones que dependen de esta pasan a la vigencia nueva con sus mismos valores; están en la comparación.')]:[];
const SAVED='Todavía no se guardó ni aprobó la versión.';

// «Activar para un mes o período»: a new validity of the same definition, with its own months, value and document.
export function salaryRowActivatePlan(raw,selection,change){
 requireInput(salaryExact(change,['validFrom','validUntil','value','ruleReference']),'Completá el mes inicial, el valor y el documento de la vigencia nueva.');
 const {current,chosen,row}=pick(raw,selection,'activate'),key=selection.key;
 requireInput(month(change.validFrom),'Elegí el mes inicial de la vigencia nueva.');
 requireInput(change.validUntil===null||month(change.validUntil),'Revisá el mes final. Si la vigencia no tiene término, dejalo vacío.');
 requireInput(change.validUntil===null||change.validUntil>=change.validFrom,'El mes final no puede ser anterior al mes inicial.');
 const value=declaredValue(row,change.value),ruleReference=reference(change.ruleReference),last=change.validUntil??END;
 // An open source that starts earlier is closed the month before, exactly as «Iniciar vigencia desde otro mes» does.
 const closesSource=row.validUntil===null&&change.validFrom>row.validFrom;
 const siblings=current.filter(item=>definition(item)===definition(row)),sameStart=siblings.find(item=>item.validFrom===change.validFrom);
 requireInput(!sameStart,sameStart===row?`Esta vigencia ya empieza en ${change.validFrom}. Para cambiar su valor o su mes final usá «Editar».`:`Ya hay una vigencia de esta definición que empieza en ${change.validFrom}${sameStart?.active===false?', desactivada':''}. Elegí otro mes inicial o revisala con «Editar».`);
 const overlap=siblings.find(item=>item.active&&!(closesSource&&item===row)&&item.validFrom<=last&&until(item)>=change.validFrom);
 requireInput(!overlap,overlap&&overlap!==row&&overlap.validUntil===null&&overlap.validFrom<change.validFrom?`Ese período cae dentro de otra vigencia de esta definición, la que rige ${salaryRowPeriod(overlap.validFrom,null)}. Abrí «Acciones» en la fila de esa vigencia y activá el período desde ahí.`:`Ese período se superpone con la vigencia de esta misma definición que rige ${overlap?salaryRowPeriod(overlap.validFrom,overlap.validUntil):''}. Elegí meses que no se pisen, o cambiá primero el mes final de esa vigencia con «Editar».`);
 let plan,relinked=0;
 if(closesSource){
  const late=change.validUntil===null?[]:lateDependents(current,key,change.validFrom,last);
  requireInput(!late.length,late.length?lateMessage(late,change.validUntil,'Dejá la vigencia nueva sin mes final, o poneles antes un mes final a esas definiciones.'):'');
  plan=salaryEffectiveDefinitionsPlan(current,chosen,()=>({value,ruleReference,validUntil:change.validUntil}),change.validFrom);
 }else{
  // A definition it depends on may have newer validities: the new period refers to the one in force during all of it.
  const covers=item=>item.active&&item.validFrom<=change.validFrom&&until(item)>=last,byKey=new Map(current.map(item=>[salaryRowKey(item),item]));
  const dependencies=[...new Set(row.dependencies.map(dependency=>{
   const source=byKey.get(dependency);if(covers(source))return dependency;
   const inForce=current.find(item=>definition(item)===definition(source)&&covers(item));
   requireInput(inForce,`Esta definición depende de ${name(source)}, que no tiene una vigencia que cubra todo el período elegido. Activá primero esa definición para esos meses.`);
   relinked++;return salaryRowKey(inForce);
  }))].sort();
  requireInput(current.length+1<=SALARY_MAX_ITEMS,`La versión completa tendría ${current.length+1} definiciones y el límite es ${SALARY_MAX_ITEMS}. No se recorta ni se divide.`);
  const items=salaryItems([...current,{...row,validFrom:change.validFrom,validUntil:change.validUntil,value,ruleReference,dependencies}]);
  plan={items,changes:salaryDiff(current,items),previousUntil:null,relatedDefinitionsCount:0};
 }
 const gap=gapAfter(plan.items,row,change.validUntil),period=salaryRowPeriod(change.validFrom,change.validUntil);
 return {action:'activate',items:plan.items,changes:plan.changes,key,newKey:salaryRowKey({...row,validFrom:change.validFrom}),validFrom:change.validFrom,validUntil:change.validUntil,value,previousUntil:plan.previousUntil,relatedDefinitionsCount:plan.relatedDefinitionsCount,gapFrom:gap,
  summary:[`Vigencia nueva de ${name(row)}: ${period}, con valor ${amount(value)}.`,
   closesSource?`La vigencia anterior (desde ${row.validFrom}) se cierra en ${plan.previousUntil} y conserva su valor.`:`La vigencia de origen (${salaryRowPeriod(row.validFrom,row.validUntil)}) no cambia.`,
   ...(relinked?['Sus dependencias pasan a referirse a las vigencias que rigen en ese período.']:[]),...related(plan.relatedDefinitionsCount),
   ...(gap?[`Desde ${gap} esta definición queda sin vigencia, hasta que la actives otra vez.`]:[])],
  done:`Vigencia nueva de ${name(row)} (${period}) incorporada al borrador. ${SAVED}`};
}

// «Aumentar desde un mes»: only an amount in pesos; the increase is a percentage (2) or its coefficient (1.02).
export function salaryRowIncreasePlan(raw,selection,change){
 requireInput(salaryExact(change,['validFrom','increaseForm','increase','precision','ruleReference'])&&['percentage','coefficient'].includes(change.increaseForm),'Elegí si informás el aumento como porcentaje o como coeficiente.');
 const {current,chosen,row}=pick(raw,selection,'increase');
 requireInput(month(change.validFrom),'Elegí el mes desde el que rige el aumento.');
 requireInput(change.validFrom>row.validFrom,`El aumento tiene que empezar después de ${row.validFrom}, el mes en que empieza esta vigencia. Para corregir su importe desde el primer mes usá «Editar».`);
 requireInput(until(row)>=change.validFrom,`Esta vigencia termina en ${row.validUntil}: en ${change.validFrom} ya no rige. Para ese mes usá «Activar para un mes o período».`);
 const percentage=change.increaseForm==='coefficient'?salaryCoefficientPercentage(change.increase):change.increase;
 requireInput(typeof percentage==='string'&&/^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,8})?$/.test(percentage)&&exactCompare(decimal(percentage),decimal('0'))>0,'Informá un porcentaje mayor que cero, sin separador de miles. Por ejemplo 2 o 2,5.');
 requireInput(Number.isInteger(change.precision)&&change.precision>=0&&change.precision<=8,'Elegí cuántos decimales tiene el importe nuevo, de 0 a 8.');
 const ruleReference=reference(change.ruleReference),increased=exactMultiply(decimal(row.value),exactAdd(decimal('1'),exactDivide(decimal(percentage),decimal('100'))));
 const exact=precision=>{try{return quantize(increased,{precision,mode:'exact'}).amount;}catch(error){if(error.code!=='ROUNDING_NEEDED')throw error;return null;}};
 const value=exact(change.precision);
 if(value===null){
  const enough=Array.from({length:8-change.precision},(_,step)=>change.precision+step+1).find(precision=>exact(precision)!==null);
  throw new SalaryInputError('ROW_ACTION_PRECISION_REQUIRED',`El importe nuevo no se puede escribir exacto con ${change.precision} decimales, y no se redondea. ${enough?`Con ${enough} decimales da exacto: ${exact(enough)}.`:'Tampoco da exacto con 8 decimales: revisá el aumento.'}`);
 }
 requireInput(value.replace(/^-/,'').split('.')[0].length<=18,'El importe nuevo supera los 18 dígitos enteros que admite el maestro. No se recorta.');
 const plan=salaryEffectiveDefinitionsPlan(current,chosen,()=>({value,precision:change.precision,ruleReference}),change.validFrom);
 const incrementPrecision=Math.max(row.precision,change.precision),increment=quantize(exactSubtract(decimal(value),decimal(row.value)),{precision:incrementPrecision,mode:'exact'}).amount;
 const said=`${percentage.replace('.',',')} %${change.increaseForm==='coefficient'?` (coeficiente ${change.increase.replace('.',',')})`:''}`;
 return {action:'increase',items:plan.items,changes:plan.changes,key:selection.key,newKey:salaryRowKey({...row,validFrom:change.validFrom}),validFrom:change.validFrom,validUntil:row.validUntil,percentage,before:row.value,value,increment,precision:change.precision,previousUntil:plan.previousUntil,relatedDefinitionsCount:plan.relatedDefinitionsCount,gapFrom:null,
  summary:[`Aumento del ${said} para ${name(row)}: de ${row.value} a ${value} desde ${change.validFrom}. Incremento exacto: ${increment}.`,
   `La vigencia anterior (desde ${row.validFrom}) se cierra en ${plan.previousUntil} y conserva su importe.`,
   ...(row.validUntil===null?[]:[`La vigencia nueva termina en ${row.validUntil}, como la anterior.`]),...related(plan.relatedDefinitionsCount)],
  done:`Aumento del ${said} de ${name(row)} desde ${change.validFrom} incorporado al borrador. ${SAVED}`};
}

// «Dar de baja desde un mes»: the open validity gets its last month. Value, document and history stay as they are.
export function salaryRowEndPlan(raw,selection,change){
 requireInput(salaryExact(change,['validUntil']),'Elegí el último mes en que vale esta definición.');
 const {current,row}=pick(raw,selection,'end');
 requireInput(month(change.validUntil),'Elegí el último mes en que vale esta definición.');
 requireInput(change.validUntil>=row.validFrom,`El último mes no puede ser anterior a ${row.validFrom}, el mes en que empieza esta vigencia.`);
 const late=lateDependents(current,selection.key,row.validFrom,change.validUntil);
 requireInput(!late.length,late.length?lateMessage(late,change.validUntil,late.length>1?'Dalas de baja primero, o quitales la dependencia con «Editar».':'Dala de baja primero, o quitale la dependencia con «Editar».'):'');
 // An open validity has no later one, so the month after the last one is always left without validity.
 const items=salaryItems(current.map(item=>item===row?{...item,validUntil:change.validUntil}:item)),gap=nextMonth(change.validUntil);
 return {action:'end',items,changes:salaryDiff(current,items),key:selection.key,newKey:null,validFrom:row.validFrom,validUntil:change.validUntil,value:row.value,previousUntil:change.validUntil,relatedDefinitionsCount:0,gapFrom:gap,
  summary:[`${name(row)} vale hasta ${change.validUntil} inclusive. Su valor y su documento no cambian.`,`Desde ${gap} queda sin vigencia, hasta que la actives otra vez.`],
  done:`${name(row)} queda con último mes ${change.validUntil} en el borrador. ${SAVED}`};
}
