// DRAFT: structural reader only. Not wired to a screen, identity service, or persistence API.
// Named GRH import definitions. Positions below are zero-based, as in formatoitem.
// This module never turns a DNI into a legajo and never calculates a salary.
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const profile=(id,label,width,fields,concepts=[])=>({id,label,width,fields,concepts,identity:'dni',encoding:'windows-1252'});
export const GRH_TXT_PROFILES=freeze([
 profile('junin55','Formato Junín · DNI e importe',55,[['dni',5,8,'integer'],['amount',44,11,'point']]),
 profile('mayorfull13','MAYOR y FULL · 13 posiciones',13,[['dni',0,8,'integer'],['quantity',8,5,'implied']],['44','95']),
 profile('osep-cuota185','OSEP CUOTA % · archivo original de 185 posiciones',185,[['dni',7,8,'integer'],['quantity',62,5,'implied']],['601']),
 profile('osep-vol-puros185','OSEP · VOLUN. PUROS · 185 posiciones',185,[['dni',7,8,'integer'],['quantity',82,3,'integer'],['amount',83,10,'implied']],['602']),
 profile('osep-estudiante185','OSEP · VOLUN. Estudiante · 185 posiciones',185,[['dni',7,8,'integer'],['quantity',95,3,'integer'],['amount',96,10,'implied']],['603']),
 profile('osep-ctacte185','OSEP · Cuenta corriente · 185 posiciones',185,[['dni',7,8,'integer'],['amount',161,10,'integer']]),
 profile('osep-cat-indirecto185','OSEP · Catastrófico indirecto · 185 posiciones',185,[['dni',7,8,'integer'],['quantity',120,4,'implied'],['amount',126,6,'implied']],['682']),
 profile('osep-cat-estudiante185','OSEP · Catastrófico estudiante · 185 posiciones',185,[['dni',7,8,'integer'],['quantity',147,3,'integer'],['amount',148,10,'implied']]),
 profile('osep-cat-puros185','OSEP · Catastrófico voluntarios puros · 185 posiciones',185,[['dni',7,8,'integer'],['quantity',134,3,'integer'],['amount',135,10,'implied']]),
]);
export const GRH_TXT_LIMITS=freeze({bytes:480*1024,records:2000});
export class GrhTxtInputError extends Error{constructor(code,message,issues=[]){super(message);this.name='GrhTxtInputError';this.code=code;this.issues=issues;}}
const fail=(code,message,issues)=>{throw new GrhTxtInputError(code,message,issues);};
export const grhProfile=id=>GRH_TXT_PROFILES.find(p=>p.id===id)??null;
const digits=v=>typeof v==='string'&&/^\d+$/.test(v);
function number(raw,mode,scale,amount){
 const v=raw.trim();if(v==='')return null;
 let whole,part='';
 if(mode==='point'){const m=/^(\d{1,18})\.(\d{2})$/.exec(v);if(!m)throw Error('Se esperaba un importe decimal con punto y dos decimales.');[whole,part]=m.slice(1);}
 else{if(!digits(v))throw Error('El campo debe contener dígitos, sin separadores ni signos.');const places=mode==='implied'?scale:0;const p=v.padStart(places+1,'0');whole=places?p.slice(0,-places):p;part=places?p.slice(-places):'';}
 if(amount){if(part.length>2)throw Error('El importe no puede perder decimales.');return (BigInt(whole)*100n+BigInt(part.padEnd(2,'0')||'0')).toString();}
 const out=BigInt(whole).toString()+(part?'.'+part:'');if(!/^\d{1,12}(?:\.\d{1,6})?$/.test(out))throw Error('Cantidad fuera del rango permitido.');return out;
}
export function readGrhTxt(bytes,{profileId,concept,impliedScale=null,groupByDni=false}={}){
 const p=grhProfile(profileId);if(!p)fail('GRH_PROFILE_REQUIRED','Elegí el formato GRH del archivo.');
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>GRH_TXT_LIMITS.bytes)fail('GRH_FILE_SIZE','El TXT debe tener entre 1 byte y 480 KiB.');
 if(typeof concept!=='string'||!/^\d{1,20}$/.test(concept))fail('GRH_CONCEPT_REQUIRED','Elegí el concepto de destino, como en GRH.');
 concept=BigInt(concept).toString();if(p.concepts.length&&!p.concepts.includes(concept))fail('GRH_CONCEPT_MISMATCH','El concepto no corresponde al formato elegido.');
 const implied=p.fields.some(f=>f[3]==='implied');if(implied&&(!Number.isInteger(impliedScale)||impliedScale<0||impliedScale>6||p.fields.some(f=>f[0]==='amount'&&f[3]==='implied')&&impliedScale>2))fail('GRH_SCALE_REQUIRED','Confirmá cuántos decimales tiene el campo sin punto. No se deduce una escala del nombre del archivo.');
 if(typeof groupByDni!=='boolean')fail('GRH_GROUP_INVALID','Agrupar por DNI debe ser Sí o No.');
 const text=new TextDecoder('windows-1252',{fatal:true}).decode(bytes);if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(text))fail('GRH_ENCODING','El archivo contiene caracteres binarios o de control.');
 const lines=text.replace(/\r\n?/g,'\n').split('\n');if(lines.at(-1)==='')lines.pop();
 if(!lines.length||lines.length>GRH_TXT_LIMITS.records)fail('GRH_RECORD_LIMIT','El archivo debe contener entre 1 y 2.000 registros.');
 const issues=[],rows=[],groups=new Map();
 for(let index=0;index<lines.length;index++){
  const line=lines[index],ordinal=index+1;
  try{
   if(line.length!==p.width)throw Error('El formato exige '+p.width+' posiciones; esta fila tiene '+line.length+'. No se recortó ni se completó.');
   let dni,quantityDecimal=null,amountCents=null;
   for(const [kind,start,length,mode]of p.fields){const raw=line.slice(start,start+length);if(kind==='dni'){if(!/^\d{8}$/.test(raw)||/^0+$/.test(raw))throw Error('DNI ausente o inválido. No se interpreta como legajo.');dni=BigInt(raw).toString();if(dni.length<5)throw Error('DNI fuera del formato admitido.');}else if(kind==='quantity')quantityDecimal=number(raw,mode,impliedScale,false);else amountCents=number(raw,mode,impliedScale,true);}
   if(quantityDecimal===null&&amountCents===null)throw Error('El registro no informa cantidad ni importe.');
   if(groups.has(dni)){
    if(!groupByDni)throw Error('DNI repetido en las filas '+groups.get(dni).sourceLines[0]+' y '+ordinal+'. Revisá el archivo o elegí explícitamente agrupar.');
    const prior=groups.get(dni);prior.quantityDecimal=addQuantity(prior.quantityDecimal,quantityDecimal);prior.amountCents=prior.amountCents===null?amountCents:amountCents===null?prior.amountCents:(BigInt(prior.amountCents)+BigInt(amountCents)).toString();prior.sourceLines.push(ordinal);
   }else{const r={rowOrdinal:rows.length+1,dni,conceptSourceId:concept,quantityDecimal,amountCents,sourceLines:[ordinal]};groups.set(dni,r);rows.push(r);}
  }catch(error){issues.push({line:ordinal,code:'GRH_ROW_INVALID',message:error.message});}
 }
 if(issues.length)fail('GRH_FILE_INVALID','El TXT contiene '+issues.length+' filas por revisar. No se devuelve una carga parcial.',issues);
 return freeze({version:'grh-txt-input.v1',profileId:p.id,encoding:p.encoding,concept,impliedScale:implied?impliedScale:null,groupByDni,inputRows:lines.length,outputRows:rows.length,rows,identityResolved:false,persistencePerformed:false,payrollCalculated:false});
}
function addQuantity(a,b){if(a===null)return b;if(b===null)return a;const places=Math.max(a.split('.')[1]?.length??0,b.split('.')[1]?.length??0);const scaled=x=>{const[w,f='']=x.split('.');return BigInt(w)*10n**BigInt(places)+BigInt(f.padEnd(places,'0')||'0');};const sum=scaled(a)+scaled(b),s=sum.toString().padStart(places+1,'0');const out=places?s.slice(0,-places)+'.'+s.slice(-places):s;if(!/^\d{1,12}(?:\.\d{1,6})?$/.test(out))throw Error('La suma agrupada supera la precisión de cantidades.');return out;}
