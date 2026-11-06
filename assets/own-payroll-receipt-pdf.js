import {encodePayrollPages} from './payroll-detail-export.js';
import {ownReceiptBatch,ownReceiptSelf,ownReceiptSnapshot,ownReceiptType} from './own-payroll-receipt-model.js';
import {OWN_RUN_NATURES,formatOwnRunDecimal} from './own-payroll-run-workspace-model.js';
const mapping={0x20ac:128,0x2013:150,0x2014:151,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149,0x2212:45};
function hex(value){return '<'+[...String(value)].map(c=>{const n=c.codePointAt(0);if(!(n>=32&&n<=255||mapping[n]!==undefined))throw Error('El PDF no admite un carácter de la identidad o etiqueta original. No se reemplazó ni omitió el recibo.');return(mapping[n]??n).toString(16).padStart(2,'0');}).join('')+'>';}
function wrap(value,max=91){const result=[];let line='';for(let word of String(value).split(/\s+/)){while(word.length>max){if(line)result.push(line);line='';result.push(word.slice(0,max));word=word.slice(max);}if((line+' '+word).trim().length>max){if(line)result.push(line);line=word;}else line=(line+' '+word).trim();}if(line)result.push(line);return result.length?result:[''];}
// One readable page for an ordinary receipt: identity and context together, one line per concept, totals side by side,
// origin grouped at the end. Long receipts continue on more pages repeating legajo and context; nothing is hidden.
const UNIT_LABELS={hours:'horas',minutes:'minutos',days:'días',percent:'%',units:'unidades',coefficient:'coeficiente',years:'años',months:'meses'};
const unitText=unit=>unit==='money'?'':(UNIT_LABELS[unit]??unit);
export function ownReceiptPages(record,params,source,{state='prepared',batchId='Previa sin conservar'}={}){
 const L=38,R=557,BOTTOM=74,INK='0.07 0.20 0.25',MUTED='0.33 0.42 0.47';
 const pages=[];let ops=[],y,continued=false;
 const put=(x,y,t,size=9,bold=false,color=INK)=>ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm ${hex(t)} Tj ET`);
 const right=(xr,y,t,size=9,bold=false,color=INK)=>put(Math.max(L,+(xr-String(t).length*size*0.53).toFixed(1)),y,t,size,bold,color);
 const rule=(yy,shade='0.80 0.85 0.86')=>ops.push(`${shade} RG 0.6 w ${L} ${yy} m ${R} ${yy} l S`);
 const page=()=>{
  if(ops.length)pages.push(ops);ops=[];y=800;
  put(L,y,'MuniControl · Recibo propio para revisión',12,true);right(R,y,`${source.period} · ${ownReceiptType(source.type)}`,9,true);y-=19;
  const names=wrap(record.name,64);names.forEach((part,i)=>{put(L,y,part,12,true);if(i===0)right(R,y,'Legajo '+record.employeeNumber+(continued?' · continuación':''),10,true);y-=15;});
  for(const part of wrap(`DNI ${record.dni} · CUIL ${record.cuil} · Convenio ${record.agreementCode} · Repartición ${record.departmentCode} · Versión ${record.liquidationVersion}`,112)){put(L,y,part,8.5,false,MUTED);y-=12;}
  y-=2;rule(y);y-=15;continued=true;
 };
 const ensure=h=>{if(y-h<BOTTOM)page();};
 const text=(value,{size=8.5,bold=false,color=MUTED,max=112}={})=>{for(const part of wrap(value,max)){ensure(size+4);put(L,y,part,size,bold,color);y-=size+3.5;}};
 page();
 text(`Emisor: ${params.issuer.name} · CUIT ${params.issuer.taxId} · ${params.issuer.address}`,{color:INK});
 text('Fecha de pago/acreditación declarada: '+(params.paymentDate??'No informada')+'.',{color:INK});
 text('La fecha declarada no acredita pago. Firma digital pendiente.');
 text(state==='approved'?'Disponibilidad revisada por otra persona.':'Preparación para revisión; aún no disponible para el agente.',{bold:true,color:INK});
 if(params.legend)text(params.legend);
 y-=6;
 // Concepts: one line each (label wraps only when long), value right-aligned; units in plain Spanish, money without label.
 ensure(30);put(L,y,'Código',8,true,MUTED);put(L+50,y,'Concepto',8,true,MUTED);right(R,y,'Importe / valor',8,true,MUTED);y-=5;rule(y);y-=12;
 for(const nature of Object.keys(OWN_RUN_NATURES)){
  const rows=record.concepts.filter(c=>c.nature===nature);if(!rows.length)continue;
  const note=nature==='employer_contribution'?'A cargo del empleador; no se descuenta otra vez del neto.':nature==='auxiliary'?'Valor técnico: no se suma como haber ni retención.':'';
  ensure(16+(note?11:0)+Math.min(rows.length,2)*13);
  put(L,y,OWN_RUN_NATURES[nature],9,true);if(note)right(R,y,note,7.5,false,MUTED);y-=13;
  for(const c of rows){
   const parts=wrap(c.label,66),unit=unitText(c.unit);ensure(parts.length*12+2);
   put(L,y,c.code,9,true);parts.forEach((part,i)=>put(L+50,y-i*12,part,9));
   right(R,y,formatOwnRunDecimal(c.amount,c.unit==='money')+(unit?' '+unit:''),9,true);
   y-=parts.length*12+2;
  }
  y-=4;
 }
 // Totals side by side; net on its own line. Totals and origin stay together on the last page.
 const origin=['Origen: identidad del registro municipal verificado; conceptos del catálogo conservado en el cálculo.',`Emisión: ${batchId} · Grupo cerrado: ${source.id}`,'Huella del cierre: '+source.snapshotSha256,'No acredita firma digital, imputación ni ejecución de pago.'].flatMap(v=>wrap(v,118));
 ensure(78+origin.length*10.5+16);rule(y+4);y-=10;put(L,y,'Totales exactos de la liquidación cerrada',9,true);y-=14;
 const pairs=[[['remuneration','Remunerativos'],['non_remuneration','No remunerativos']],[['deduction','Retenciones'],['employer_contribution','Aportes patronales']],[['gross','Bruto'],null]];
 for(const pair of pairs){pair.forEach((item,i)=>{if(!item)return;const [key,label]=item,x=i?306:L,xr=i?R:286;put(x,y,label,9,false,MUTED);right(xr,y,formatOwnRunDecimal(record.totals[key]),9,true);});y-=13;}
 y-=3;rule(y+9,'0.55 0.62 0.65');put(L,y-4,'Neto',11,true);right(R,y-4,formatOwnRunDecimal(record.totals.net),11,true);y-=24;
 // Origin and document state, kept together so a page never starts with a stray word.
 put(L,y,'Origen y estado del documento',8.5,true,MUTED);y-=11;for(const part of origin){put(L,y,part,7.5,false,MUTED);y-=10.5;}
 pages.push(ops);
 for(const [i,operations]of pages.entries()){ops=operations;rule(64);put(L,52,'SIN FIRMA DIGITAL · COPIA PARA REVISIÓN',8,true);put(L,40,`Legajo ${record.employeeNumber} · ${source.period} · ${ownReceiptType(source.type)}`,7.5,false,MUTED);right(R,46,`${i+1} / ${pages.length}`,8);}
 return pages;
}
export async function createOwnReceiptPdf(value,{signal,preview=false,self=false,index=0}={}){
 const pages=[];let records,params,sources,state,batchId;
 if(self){ownReceiptSelf(value);const item=value.items[index];if(!item)throw Error('Elegí un recibo propio vigente.');records=[item.record];params=item.params;sources=[item.source];state='approved';batchId=item.batchId;}
 else if(preview){ownReceiptSnapshot(value);records=value.records;params=value.params;sources=value.sources;state='prepared';}
 else{ownReceiptBatch(value);if(!value.permissions.canDownload)throw Error('La emisión no admite una descarga vigente.');records=value.snapshot.records;params=value.snapshot.params;sources=value.snapshot.sources;state=value.state;batchId=value.id;}
 if(!records.length)throw Error('No hay recibos en este alcance; no se inventó una liquidación en cero.');
 for(const [i,record]of records.entries()){signal?.throwIfAborted();pages.push(...ownReceiptPages(record,params,sources.find(s=>s.id===record.sourceGroupId),{state,batchId}));if(pages.length>8000)throw Error('El conjunto supera la capacidad de PDF. No se exportó una parte.');if(i%10===0)await new Promise(resolve=>setTimeout(resolve,0));}
 signal?.throwIfAborted();const bytes=encodePayrollPages(pages);await new Promise(resolve=>setTimeout(resolve,0));if(signal?.aborted){bytes.fill(0);signal.throwIfAborted();}return {bytes,recordCount:records.length,pageCount:pages.length};
}
export function saveOwnReceiptPdf(result,name){
 let url=null;
 try{
  const blob=new Blob([result.bytes],{type:'application/pdf'});
  url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=name;link.click();
 }finally{
  try{result?.bytes?.fill(0);}
  finally{if(url!==null)setTimeout(()=>URL.revokeObjectURL(url),1000);}
 }
}
