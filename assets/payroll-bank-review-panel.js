import {bankMoney} from './payroll-bank-generator-model.js';
export function renderBankReview(host,review){
 host.replaceChildren();if(!review)return;
 const doc=host.ownerDocument,add=(parent,tag,text,cls)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;parent.append(el);return el;};
 const head=add(host,'header');add(head,'p','CONCILIACIÓN · LIQUIDACIÓN COMPLETA','pbg-review-kicker');add(head,'h3','Controles antes de preparar la entrega');
 add(head,'p','Estos controles consideran las '+review.rows+' filas autorizadas, aunque hayas filtrado la tabla. No modifican cuentas ni importes y no aprueban pagos.');
 const metrics=add(host,'div',undefined,'pbg-review-grid');
 for(const [label,value,note] of [['CBU compartidos',review.sharedCbuGroups,review.sharedCbuRows+' legajos involucrados. Requieren revisión; no implica una irregularidad.'],['Netos sin informar',review.missingAmounts,'Un importe ausente no se interpreta como cero.'],['Netos cero o negativos',review.zeroNetRows+review.negativeNetRows,review.zeroNetRows+' en cero · '+review.negativeNetRows+' negativos. Se conservan sin ajustar.']]){const card=add(metrics,'div');add(card,'span',label);add(card,'strong',String(value));add(card,'small',note);}
 const details=add(host,'details');add(details,'summary','Conciliar totales por banco y jurisdicción');
 add(details,'p','Son dos agrupaciones de la misma población: no se suman entre sí. Cada una conserva las filas y la suma exacta de netos informados de la liquidación completa.');
 const wrap=add(details,'div',undefined,'rc-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Conciliación agrupada, desplazable');
 const table=add(wrap,'table',undefined,'rc-table'),thead=add(table,'thead'),tr=add(thead,'tr');
 for(const label of ['Agrupación','Grupo','Filas','Netos ausentes','Neto total'])add(tr,'th',label).scope='col';
 const body=add(table,'tbody');for(const [kind,groups] of [['Banco',review.banks],['Jurisdicción',review.jurisdictions]])for(const group of groups){const row=add(body,'tr');add(row,'td',kind);add(row,'th',group.label).scope='row';add(row,'td',String(group.rows));add(row,'td',String(group.missingAmounts));add(row,'td',group.total===null?'No evaluable; suma informada '+bankMoney(group.knownTotal):bankMoney(group.total));}
 add(details,'p',review.total===null?'Total completo no evaluable: hay netos ausentes. Suma informada: '+bankMoney(review.knownTotal):'Neto completo conciliado entre ambas agrupaciones: '+bankMoney(review.total));
 add(host,'p','El paquete reúne Excel, PDF, conciliación, observaciones y un manifiesto SHA-256. No incluye TXT de acreditación bancaria.','pbg-note');
}
