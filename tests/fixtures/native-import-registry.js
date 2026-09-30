// Invented identities and values. This registry does not need any migration or external source.
export const id=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
export function registryFixture(count=12){
 const tenantId=id(1),contracts=Array.from({length:count},(_,i)=>({id:id(100+i),personId:id(20000+i),tenantId,number:String(1001+i),dni:String(99000001+i),name:'Agente sintético '+(i+1),startDate:'2020-01-01',endDate:null,status:'active',revision:1}));
 const registry={tenantId,version:1,contracts,concepts:[{code:'614',name:'Descuento de prueba',startMonth:'2020-01-01',endMonth:null}]};
 const rows=contracts.map((c,i)=>({rowOrdinal:i+1,dni:c.dni,conceptCode:'614',quantityDecimal:null,amountCents:String(10000+i),sourceLines:[i+1]}));
 const file=new TextEncoder().encode(rows.map(r=>' '.repeat(5)+r.dni+' '.repeat(31)+(BigInt(r.amountCents)/100n).toString().padStart(8,'0')+'.'+(BigInt(r.amountCents)%100n).toString().padStart(2,'0')).join('\r\n'));
 return {registry,rows,file,options:{profileId:'junin55',concept:'614',periodMonth:'2026-10-01'},input:{registry,periodMonth:'2026-10-01',inputRows:count,rows,choices:[]}};
}
