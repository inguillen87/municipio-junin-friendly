import {OWN_RUN_TYPES,OWN_RUN_NATURES,formatOwnRunDecimal} from './own-payroll-run-workspace-model.js';
import {ownRunDateLabel} from './own-payroll-run-date.js';
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const states={calculated:'Pendiente de confirmación',confirmed:'Confirmada',annulled:'Histórico anulado',cancelled:'Preparación cancelada'};
export function mountOwnPayrollIndividual(host,{id,canUse,returnFocus}){
 const href=new URL('own-payroll-individual-panel.css',import.meta.url).href;
 if(![...document.querySelectorAll('link[rel=stylesheet]')].some(l=>l.href===href)){const link=node('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
 host.className='own-individual';host.hidden=true;host.setAttribute('aria-labelledby',id+'Title');
 let selected=null,opener=null;
 const clear=()=>{selected=null;opener=null;host.hidden=true;host.replaceChildren();};
 function close(){const target=opener;clear();if(target?.isConnected&&!target.disabled&&target.getClientRects().length)target.focus();else returnFocus?.()?.focus();}
 function show(value,trigger,focus=true){
  clear();if(!canUse())return;selected=value.contractId;opener=trigger;
  const header=node('header'),title=node('h4','Resumen individual · Legajo '+value.employeeNumber);title.id=id+'Title';title.tabIndex=-1;
  const button=node('button','Cerrar resumen');button.type='button';button.className='button';button.dataset.individualClose='';button.addEventListener('click',close);header.append(title,button);
  const status=node('p',value.period+' · '+OWN_RUN_TYPES[value.liquidationType]+' · '+ownRunDateLabel(value.liquidationDate)+' · '+states[value.state]+(value.liquidationVersion===null?'':' · versión '+value.liquidationVersion));status.dataset.individualState='';
  const notice=node('p',value.state==='annulled'?'Estos importes se conservan como histórico. Esta versión está anulada y no tiene un neto vigente.':value.state==='cancelled'?'Se conserva el cálculo cancelado como histórico. No es una liquidación vigente.':value.state==='confirmed'?'Resultado de la versión confirmada. No acredita contabilización, firma ni pago.':'Resultado calculado pendiente de confirmación y cierre. No es un recibo emitido ni una orden de pago.');notice.className='own-individual-notice';
  const totals=node('dl');totals.dataset.individualTotals='';
  const netLabel=value.state==='annulled'||value.state==='cancelled'?'Neto histórico':value.state==='confirmed'?'Neto de esta versión':'Neto calculado';
  for(const [key,label]of [['remuneration','Remunerativos'],['non_remuneration','No remunerativos'],['gross','Bruto'],['deduction','Retenciones'],['net',netLabel],['employer_contribution','Aportes patronales']]){const dd=node('dd',formatOwnRunDecimal(value.totals[key]));dd.dataset.individualAmount=key;totals.append(node('dt',label),dd);}
  const list=node('ol');list.dataset.individualConcepts='';
  for(const row of value.rows){const item=node('li'),heading=node('h5','Concepto '+row.conceptCode),amount=node('p',formatOwnRunDecimal(row.amount,row.unit==='money')+(row.unit==='money'?'':' · '+row.unit));amount.className='own-individual-amount';item.append(heading,node('p',OWN_RUN_NATURES[row.nature]),amount);const source=node('details');source.append(node('summary','Respaldo del concepto'),node('p',row.ruleReference));item.append(source);list.append(item);}
  const trace=node('details');trace.append(node('summary','Ver decisiones y trazabilidad'));
  for(const event of value.events)trace.append(node('p',({confirm:'Confirmar',annul:'Anular',cancel:'Cancelar'}[event.command])+' · '+event.actorLabel+' · '+new Date(event.recordedAt).toLocaleString('es-AR')+' · '+event.reason));
  trace.append(node('p','Integridad del resultado: '+value.resultSha256));
  host.append(header,status,notice,totals,node('p',value.rows.length+' conceptos del legajo completo. La búsqueda y la página de la corrida no recortan este resumen.'),list,trace);host.hidden=false;if(focus)title.focus();
 }
 host.addEventListener('keydown',event=>{if(event.key==='Escape'&&!host.hidden){event.preventDefault();close();}});
 return {show,clear,get selected(){return selected;}};
}
