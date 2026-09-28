import {declareDocumentPaymentDate,documentPaymentDateLines,documentPaymentDateLongLabel,PAYMENT_DATE_KINDS} from './payroll-document-payment-date.js';
let sequence=0;
export function mountDocumentPaymentField(host,{selectionHash,onChange}={}){
 const doc=host.ownerDocument,id='document-date-'+(++sequence),make=(tag,text)=>{const el=doc.createElement(tag);if(text)el.textContent=text;return el;};
 const field=make('fieldset');field.className='pdb-payment-date';field.dataset.documentPaymentDate='';
 const legend=make('legend','Fecha de acreditación o pago para el PDF');
 const help=make('p','Dato opcional declarado por el operador. Sólo se incorpora al PDF: no cambia la liquidación ni confirma una transferencia.');help.className='pdb-hint';help.id=id+'-help';
 const grid=make('div');grid.className='pdb-payment-inputs';const kindLabel=make('label','Dato a informar'),kind=make('select');kind.setAttribute('aria-label','Dato de acreditación o pago');kind.setAttribute('aria-describedby',help.id);
 kind.append(new Option('No informar fecha','not_informed'));for(const [value,label]of Object.entries(PAYMENT_DATE_KINDS))kind.append(new Option('Fecha de '+label.toLowerCase()+' declarada',value));kindLabel.append(kind);
 const dateLabel=make('label','Fecha declarada'),date=make('input');date.type='date';date.min='1900-01-01';date.max='2099-12-31';date.autocomplete='off';date.setAttribute('aria-label','Fecha de acreditación o pago declarada');date.setAttribute('aria-describedby',help.id);dateLabel.append(date);
 const clear=make('button','Quitar fecha declarada');clear.type='button';clear.className='pdb-payment-clear';grid.append(kindLabel,dateLabel,clear);
 const preview=make('p');preview.className='pdb-payment-preview';preview.setAttribute('aria-live','polite');
 field.append(legend,help,grid,preview);host.append(field);
 function input(){return{kind:kind.value,date:date.value};}
 function update(){
  const disabled=kind.value==='not_informed';date.disabled=disabled;date.required=!disabled;dateLabel.hidden=disabled;clear.hidden=disabled;date.removeAttribute('aria-invalid');
  if(disabled){date.value='';preview.textContent='Sin fecha declarada: el PDF conservará “Fecha de pago: no informada”.';return;}
  try{const d=declareDocumentPaymentDate(input(),selectionHash);preview.textContent='Se imprimirá '+documentPaymentDateLongLabel(d)+'. '+documentPaymentDateLines(d)[0]+'. Se aplicará a todo el rango actual.';}
  catch{preview.textContent='Ingresá una fecha completa. El documento no se generará con una fecha incompleta o inválida.';}
 }
 const change=()=>{update();onChange();};kind.addEventListener('change',change);date.addEventListener('input',change);
 const remove=()=>{kind.value='not_informed';change();kind.focus({preventScroll:true});};clear.addEventListener('click',remove);update();
 return{
  capture(){try{if(kind.value!=='not_informed'&&!date.checkValidity())throw Error('invalid');return declareDocumentPaymentDate(input(),selectionHash);}catch{date.setAttribute('aria-invalid','true');date.focus({preventScroll:true});return declareDocumentPaymentDate({kind:kind.value,date:'INVALID'},selectionHash);}},
  matches(value){return value.kind===kind.value&&(value.date??'')===date.value;},
  destroy(){kind.removeEventListener('change',change);date.removeEventListener('input',change);clear.removeEventListener('click',remove);date.value='';kind.value='not_informed';field.remove();},
 };
}
