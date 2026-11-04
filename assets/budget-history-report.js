// Read-only presentation of a locally verified historical file; never certifies budget quotas.
import {verifiedBudgetHistory,historyFail} from './budget-historical-evidence.js';
import {encodePayrollPages} from './payroll-detail-export.js';
const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function historyRows(evidence,{query='',order='number'}={}){
 const e=verifiedBudgetHistory(evidence);
 if(typeof query!=='string'||query.length>120||/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(query)||!['number','role'].includes(order))historyFail('HISTORY_FILTER');
 const q=fold(query.trim()),rows=e.rows.filter(r=>!q||fold([r.number,r.recordId,r.role,r.structure,r.detail].join(' ')).includes(q));
 const col=new Intl.Collator('es-AR',{sensitivity:'base',numeric:true});rows.sort((a,b)=>order==='role'?col.compare(a.role??'',b.role??'')||col.compare(a.number,b.number):col.compare(a.number,b.number));return rows;
}
const shown=v=>v===null?'No informado':v===''?'Vacío en origen':v;
const cell=v=>'"'+String(v).replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"';
export function historyCsv(evidence,options={}){const e=verifiedBudgetHistory(evidence),rows=historyRows(e,options);return '\ufeff'+[['Legajo','Registro histórico','Cargo histórico','Estructura histórica','Detalle histórico','Fecha corrida','Tipo','SHA-256 archivo'],...rows.map(r=>[r.number,r.recordId,shown(r.role),shown(r.structure),shown(r.detail),e.descriptor.date,e.descriptor.type,e.descriptor.packageSha256])].map(r=>r.map(cell).join(';')).join('\r\n')+'\r\n';}
const codes={0x20ac:128,0x2013:150,0x2014:151,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149};
const hex=s=>'<'+[...String(s)].map(c=>{const n=c.codePointAt(0),value=n>=32&&n<=255?n:codes[n];if(value===undefined)historyFail('HISTORY_TEXT_UNSUPPORTED');return value.toString(16).padStart(2,'0');}).join('')+'>';
function wrap(value,size=8,width=515){const max=Math.floor(width/size),out=[];let current='';for(const part of String(value).split(/\s+/)){for(const word of part.match(new RegExp('.{1,'+max+'}','g'))??['']){if(current&&(current+' '+word).length>max){out.push(current);current=word;}else current=(current+' '+word).trim();}}if(current)out.push(current);return out.length?out:[''];}
export function historyPdf(evidence,options={}){
 const e=verifiedBudgetHistory(evidence),d=e.descriptor,rows=historyRows(e,options),pages=[];let ops,y;
 const text=(x,top,s,size=8,bold=false,color='0.08 0.22 0.29')=>ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${842-top} Tm ${hex(s)} Tj ET`);
 const rect=(x,top,w,h,color)=>ops.push(`${color} rg ${x} ${842-top-h} ${w} ${h} re f`);
 function head(){ops=[];pages.push(ops);rect(0,0,595,70,'0.045 0.15 0.20');text(38,24,'MuniControl | Módulo 10',11,true,'1 1 1');text(38,50,'Cargos del archivo histórico',16,true,'1 1 1');y=94;
  for(const note of ['Corrida: '+d.date+' · Tipo '+d.type+' · Período '+d.period+'-'+String(d.month).padStart(2,'0'),'Filas: '+rows.length+' de '+e.rows.length+' · Búsqueda: '+(options.query?.trim()||'Sin filtro'),'Fuente: histolegajo · Respaldo '+d.sourceFooter,'Archivo local cotejado por huella. No sustituye el presupuesto anual aprobado.'])for(const line of wrap(note)){text(38,y,line,8);y+=11;}
  y+=14;text(38,805,'Archivo histórico de consulta · No acredita aprobación, asignación vigente ni pago.',7);text(38,819,d.packageSha256,6);text(494,831,'Página '+pages.length,7);
 }
 head();if(!rows.length){text(38,y,'Sin filas para este filtro.',10,true);}
 for(const r of rows){let continued=false;const title=()=>{rect(38,y,519,23,'0.90 0.95 0.95');text(45,y+15,'Legajo '+r.number+' · Registro '+r.recordId+(continued?' · continuación':''),9,true);y+=35;};if(y>734)head();title();
  for(const [label,value]of [['Cargo',r.role],['Estructura',r.structure],['Detalle',r.detail]])for(const line of wrap(label+': '+shown(value),8,507)){if(y>778){head();continued=true;title();}text(44,y,line);y+=11;}
  y+=16;
 }
 if(pages.length>1000)historyFail('HISTORY_LIMIT');return encodePayrollPages(pages);
}
