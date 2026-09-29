// Display-only checks for the existing TXT exporter. No approval, upload or payroll mutation.
import {junin638Txt} from './payroll-junin-638.js';
import {fixedPeriod,fixedCoverage,FIXED_MAX_ROWS} from './payroll-fixed-novelties-model.js';
export function junin638Readiness({list=null,canExport=false,readAllowed=false,editing=false,busy=false}={}){
 if(!readAllowed)return{ready:false,code:'access',message:'Consultá el registro con permisos vigentes para revisar el TXT 638.'};
 if(!canExport)return{ready:false,code:'permission',message:'La consulta está disponible, pero falta el permiso de exportación para descargar el TXT 638.'};
 if(editing)return{ready:false,code:'draft',message:'Terminá o cancelá la propuesta local antes de exportar el TXT 638.'};
 if(busy)return{ready:false,code:'busy',message:'Hay una operación en curso. Esperá su resultado antes de volver a descargar.'};
 if(!list)return{ready:false,code:'query',message:'Consultá el registro actualizado antes de exportar el TXT 638.'};
 if(!list.periodMonth)return{ready:false,code:'period',message:'Elegí el período y presioná Consultar para habilitar el TXT 638.'};
 const rows=list.rows.filter(r=>r.approved?.operation==='set'&&r.approved.values.conceptSourceId==='638'&&fixedCoverage(r.approved.values,list.periodMonth).intersects);
 if(!rows.length)return{ready:false,code:'empty',message:'No hay novedades 638 aprobadas y vigentes en el período consultado. Las propuestas pendientes no se exportan.'};
 if(rows.some(r=>!r.identityCurrent))return{ready:false,code:'identity',message:'Hay una identidad de legajo por revisar entre las 638 vigentes. Actualizá el vínculo antes de exportar; no se omitirán registros.'};
 return{ready:true,code:'ready',message:rows.length+' novedades 638 aprobadas y vigentes para '+list.periodMonth.slice(0,7)+'. El TXT incluye todas, aunque la búsqueda o la página muestre menos. DNI e importes se verifican al descargar.'};
}
export async function junin638FileReview(snapshot,rawBytes){
 const fail=()=>{throw Object.assign(Error('No se pudo verificar el contenido completo del TXT 638.'),{code:'PAYROLL_FIXED_CONTRACT_DRIFT'});};
 if(!(rawBytes instanceof Uint8Array)||!Array.isArray(snapshot?.rows)||snapshot.rows.length<1||snapshot.rows.length>FIXED_MAX_ROWS)fail();
 const bytes=Uint8Array.from(rawBytes),source=structuredClone(snapshot);fixedPeriod(source.periodMonth);
 const expected=junin638Txt(source);
 if(bytes.length!==expected.length||bytes.some((byte,index)=>byte!==expected[index]))fail();
 let total=0n;for(const row of source.rows)total+=BigInt(row.amountCents);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return Object.freeze({version:'junin638-file-review.v1',filename:'amaru.txt',periodMonth:source.periodMonth,records:source.rows.length,
  totalCents:String(total),byteLength:bytes.length,sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join(''),
  recordBytes:55,lineEnding:'CRLF',trailingLineEnding:false,receiverAcceptance:'not_verified'});
}
