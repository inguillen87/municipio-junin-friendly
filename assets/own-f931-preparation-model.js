import {salarySerialized} from './native-salary-catalog-model.js';
import {verifiedOwnReportBundle} from './own-payroll-report-model.js';
import {OWN_JURISDICTIONS,ownClosedJurisdiction,ownJurisdictionSelect} from './own-payroll-jurisdiction-model.js';
import {decimal,exactAdd,rational,quantize} from './own-payroll-exact.js';
import {F931_FIELDS,F931_REFERENCE,ownF931Params,ownF931VersionRequirement} from './own-f931-contract.js';
import {FISCAL_FACT_FIELDS,verifiedFiscalFactsCensus} from './own-fiscal-facts-model.js';
const trusted=new WeakSet(),freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const need=(v,m)=>{if(!v)throw Error(m);};
export const OWN_F931_FISCAL_STATUSES=freeze({
 not_queried:{label:'Datos fiscales sin consultar',action:'Consultá los datos fiscales completos de este período.'},
 missing:{label:'Sin revisión fiscal',action:'Abrí Datos fiscales, elegí este legajo y período y prepará su revisión independiente.'},
 stale:{label:'Fuente modificada',action:'Revisá la fuente y la identidad conservada en el cierre antes de preparar otra declaración.'},
 identity_not_captured:{label:'Sin identidad propia capturada',action:'Revisá el cierre original. No se puede asociar una declaración sustituyendo la identidad por el padrón actual.'},
 unknown_fields:{label:'Revisión vigente con datos sin informar',action:'Revisá los campos documentales pendientes de este legajo. Un dato sin informar no equivale a cero.'},
 documented:{label:'27 datos documentados con revisión vigente',action:'Conservá las constancias. Todavía se deben homologar los códigos, correspondencias y presentación fiscal.'}
});
// Jurisdicción laboral conservada por participación cerrada: código capturado (42/55),
// capturada sin informar (null) o no capturada (cierre v1). Nunca el padrón actual.
export const OWN_F931_JURISDICTION_BUCKETS=Object.freeze(['42','55','not_reported','not_captured']);
const TOTAL_KEYS=Object.freeze(['remuneration','non_remuneration','deduction','employer_contribution','gross','net']);
const emptyBuckets=()=>Object.fromEntries(OWN_F931_JURISDICTION_BUCKETS.map(k=>[k,0]));
const jurisdictionBucket=(employee,snapshotVersion)=>{const j=ownClosedJurisdiction(employee,snapshotVersion);return j.basis==='not_captured'?'not_captured':j.code===null?'not_reported':j.code;};
export async function prepareOwnF931(value,details,receipts,fiscalCensus=null){
 const params=ownF931Params(value),bundle=await verifiedOwnReportBundle({from:params.period,to:params.period,types:params.types},structuredClone(details),structuredClone(receipts));
 // Universo completo primero: distribución conservada, global y por tipo, y contratos
 // con más de un código capturado entre tipos. La selección viene después y no altera esto.
 const jurisdictionCoverage={scope:bundle.employees.length,...emptyBuckets(),contractsInSeveralJurisdictions:0},bucketsByType=new Map(),codesByContract=new Map();
 for(const {employee:e,type,source} of bundle.employees){
  const bucket=jurisdictionBucket(e,source.snapshot.version);jurisdictionCoverage[bucket]++;
  const perType=bucketsByType.get(type)??emptyBuckets();perType[bucket]++;bucketsByType.set(type,perType);
  if(bucket==='42'||bucket==='55'){const codes=codesByContract.get(e.contractId)??new Set();codes.add(bucket);codesByContract.set(e.contractId,codes);}
 }
 for(const codes of codesByContract.values())if(codes.size>1)jurisdictionCoverage.contractsInSeveralJurisdictions++;
 // 42/55 exige que todo el alcance tenga jurisdicción capturada (misma regla que reportes y
 // planillas). El rechazo lleva los desconocidos explícitos; "Todas" nunca los oculta.
 let chosen;
 try{chosen=ownJurisdictionSelect(bundle.employees,params.jurisdiction);}
 catch(error){throw Error(error.message+' Sin informar en el alta: '+jurisdictionCoverage.not_reported+'. No capturada en el cálculo: '+jurisdictionCoverage.not_captured+'. Consultá "Todas las jurisdicciones" para ver el alcance completo.');}
 const selectedIds=new Set(chosen.map(({employee:e})=>e.contractId));
 const scopeTotals=Object.fromEntries(TOTAL_KEYS.map(k=>[k,rational(0n)])),totals=Object.fromEntries(TOTAL_KEYS.map(k=>[k,rational(0n)]));
 const issues=[],coverage=[];let fractionalAmounts=0;
 for(const d of bundle.details){
  const sources=bundle.sources.filter(s=>s.snapshot.liquidationType===d.liquidationType),participations=bundle.employees.filter(e=>e.type===d.liquidationType);
  const pending=d.rows.filter(r=>r.state!=='closed').length;
  coverage.push({type:d.liquidationType,closedGroups:sources.length,closedParticipations:participations.length,selectedParticipations:chosen.filter(e=>e.type===d.liquidationType).length,jurisdictions:bucketsByType.get(d.liquidationType)??emptyBuckets(),currentRows:d.rows.length,notClosedRows:pending,reopenedGroups:d.groups.filter(g=>g.state==='reopened').length,partialGroups:sources.filter(s=>!s.snapshot.populationComplete).length});
  if(pending)issues.push({code:'UNCLOSED_PARTICIPATIONS',type:d.liquidationType,count:pending,action:'Revisar el estado de las liquidaciones del tipo elegido; la consulta no las cierra.'});
  if(!sources.length)issues.push({code:'NO_CLOSED_GROUPS',type:d.liquidationType,count:0,action:'No hay grupos propios cerrados de este tipo. Confirmar el alcance antes de preparar la declaración.'});
  if(sources.some(s=>!s.snapshot.populationComplete))issues.push({code:'PARTIAL_GROUP_COVERAGE',type:d.liquidationType,count:sources.filter(s=>!s.snapshot.populationComplete).length,action:'El cierre conserva una cobertura parcial. No acredita la población fiscal completa.'});
 }
 // Los totales del universo y la detección de fracciones de centavo recorren todas las
 // participaciones; los totales de la selección suman sólo las elegidas. Ningún importe cambia.
 for(const {employee:e} of bundle.employees)for(const k of TOTAL_KEYS){scopeTotals[k]=exactAdd(scopeTotals[k],decimal(e.totals[k]));try{quantize(decimal(e.totals[k]),{precision:2,mode:'exact'});}catch{fractionalAmounts++;}}
 for(const {employee:e} of chosen)for(const k of TOTAL_KEYS)totals[k]=exactAdd(totals[k],decimal(e.totals[k]));
 // Sub-cent monetary payroll concepts require an explicit representation,
 // even if their fractions cancel in a total. Unmapped calculation auxiliaries
 // are not earnings and do not become fiscal amounts merely by being present.
 for(const s of bundle.sources)for(const r of s.snapshot.concepts)if(r.unit==='money'&&r.nature!=='auxiliary'){try{quantize(decimal(r.amount),{precision:2,mode:'exact'});}catch{fractionalAmounts++;}}
 if(fractionalAmounts)issues.push({code:'SUBCENT_AMOUNTS',type:null,count:fractionalAmounts,action:'Revisar los valores con fracciones de centavo. Se conservan exactos; no se redondean para el F.931.'});
 const unknownJurisdictions=jurisdictionCoverage.not_reported+jurisdictionCoverage.not_captured;
 if(unknownJurisdictions)issues.push({code:'JURISDICTION_NOT_CAPTURED',type:null,count:unknownJurisdictions,action:'Falta una jurisdicción en el cierre original. No se completa desde el padrón actual ni se deduce del legajo.'});
 if(jurisdictionCoverage.contractsInSeveralJurisdictions)issues.push({code:'JURISDICTION_MIXED_CONTRACTS',type:null,count:jurisdictionCoverage.contractsInSeveralJurisdictions,action:'Un mismo contrato conserva distinta jurisdicción en participaciones de distintos tipos del período. Revisá su encuadre antes de declarar poblaciones; los contratos no se suman entre jurisdicciones.'});
 const facts=fiscalCensus===null?null:await verifiedFiscalFactsCensus(structuredClone(fiscalCensus),params.period),byContract=new Map(facts?.rows.map(r=>[r.contractId,r])??[]),captured=new Map(bundle.details.flatMap(d=>d.captures.map(c=>[d.period+':'+d.liquidationType+':'+c.id,c])));
 // El estado fiscal de cada contrato se decide con TODAS sus participaciones del período;
 // la jurisdicción elegida sólo marca pertenencia (qué contratos se muestran).
 const contracts=new Map();
 for(const {employee,type}of bundle.employees){
  const item=contracts.get(employee.contractId)??{tokens:new Set(),employeeNumbers:new Set(),types:new Set(),participations:0,selectedTypes:new Set(),selectedParticipations:0},person=captured.get(params.period+':'+type+':'+employee.runId)?.payload?.population?.employees.find(p=>p.contractId===employee.contractId);
  item.tokens.add(person?.origin==='MUNICONTROL'?person.identityToken:null);item.employeeNumbers.add(employee.employeeNumber);item.types.add(type);item.participations++;contracts.set(employee.contractId,item);
 }
 for(const {employee,type} of chosen){const item=contracts.get(employee.contractId);item.selectedTypes.add(type);item.selectedParticipations++;}
 const fiscalCoverage={queried:facts!==null,contracts:contracts.size,selectedContracts:selectedIds.size,reviewed:0,missing:0,stale:0,identityNotCaptured:0,fields:Object.fromEntries(FISCAL_FACT_FIELDS.map(n=>[n,0]))};
 const fiscalRows=[];
 for(const [id,item]of contracts){
  const {tokens}=item,row=byContract.get(id);let state,knownFields=null,unknownFields=null;
  if(tokens.has(null)){fiscalCoverage.identityNotCaptured++;state='identity_not_captured';}
  else if(!row){fiscalCoverage.missing++;state='missing';}
  else if(!row.current||tokens.size!==1||!tokens.has(row.configuration.identityToken)){fiscalCoverage.stale++;state='stale';}
  else{fiscalCoverage.reviewed++;knownFields=0;for(const n of FISCAL_FACT_FIELDS)if(row.configuration.definition.fields[n]!==null){fiscalCoverage.fields[n]++;knownFields++;}unknownFields=FISCAL_FACT_FIELDS.length-knownFields;state=unknownFields?'unknown_fields':'documented';}
  if(facts===null)state='not_queried';
  fiscalRows.push({contractId:id,employeeNumbers:[...item.employeeNumbers],types:[...item.types],participations:item.participations,selectedTypes:[...item.selectedTypes],selectedParticipations:item.selectedParticipations,state,knownFields,unknownFields,...OWN_F931_FISCAL_STATUSES[state]});
 }
 if(fiscalCoverage.missing)issues.push({code:'FISCAL_FACTS_MISSING',type:null,count:fiscalCoverage.missing,action:'Registrar y revisar los datos fiscales de los contratos cerrados para este período. No se toman del mes anterior.'});
 if(fiscalCoverage.stale)issues.push({code:'FISCAL_FACTS_STALE',type:null,count:fiscalCoverage.stale,action:'Revisar los datos fiscales cuya fuente cambió o no coincide con la identidad conservada en el cierre.'});
 if(fiscalCoverage.identityNotCaptured)issues.push({code:'FISCAL_IDENTITY_NOT_CAPTURED',type:null,count:fiscalCoverage.identityNotCaptured,action:'El cierre no conserva una identidad propia verificable para asociar datos fiscales. No se sustituye por el padrón actual.'});
 const totalPrecision=Math.max(2,...bundle.sources.map(s=>s.snapshot.precision)),amounts=(values,count)=>Object.fromEntries(Object.entries(values).map(([k,v])=>[k,count?quantize(v,{precision:totalPrecision,mode:'exact'}).amount:null]));
 const version=ownF931VersionRequirement(params);
 const requirements=[{code:'APPLICABLE_LAYOUT',action:version.label},{code:'FISCAL_FIELDS_AND_MAPPINGS',action:'Documentar y aprobar los datos fiscales, códigos vigentes y correspondencias de los 60 campos. Los totales de nómina no equivalen automáticamente a bases imponibles.'},
  {code:'DECLARATION_POPULATIONS',action:'Verificar las poblaciones fiscales General, 42 y 55. La jurisdicción laboral conservada no acredita ese encuadre; no se supone que General sea su suma.'},
  {code:'FIELD_REPRESENTATION',action:'Homologar decimales, relleno, alineación, codificación y conciliación con el receptor. No completar nulos con ceros ni extender un TXT histórico de 463 posiciones.'}];
 const result=freeze({version:'own-f931-preparation.v1',params,versionRequirement:version,reference:F931_REFERENCE,
  complete:true,closedGroups:bundle.sources.length,scopeParticipations:bundle.employees.length,participations:chosen.length,scopeContracts:new Set(bundle.employees.map(r=>r.employee.contractId)).size,contracts:selectedIds.size,
  coverage,jurisdictionCoverage,scopeTotals:amounts(scopeTotals,bundle.employees.length),totals:amounts(totals,chosen.length),issues,requirements,fiscalCoverage,fiscalRows,fieldReferences:F931_FIELDS.map(f=>({...f,status:FISCAL_FACT_FIELDS.includes(f.number)?(fiscalCoverage.queried?fiscalCoverage.fields[f.number]+' de '+fiscalCoverage.contracts+' contratos con dato revisado vigente':'Datos fiscales sin consultar'):'Correspondencia fiscal pendiente',action:FISCAL_FACT_FIELDS.includes(f.number)?'Dato documental por contrato y período. La revisión administrativa no homologa su código ni su representación fiscal.':'Documentar fuente fiscal y regla aprobada para este campo.'})),
  sourceProof:bundle.proof,sourceHashes:bundle.sources.map(s=>s.snapshotSha256).sort(),fiscalProof:facts?salarySerialized([facts.scopeVersion,facts.stateVersion]):null,canGenerate:false,canSubmit:false});
 trusted.add(result);return result;
}
export function trustedOwnF931(value){need(trusted.has(value),'Verificá nuevamente todos los cierres antes de descargar la preparación.');return value;}
export function ownF931Proof(value){const v=trustedOwnF931(value);return salarySerialized({params:v.params,sourceProof:v.sourceProof,hashes:v.sourceHashes,fiscalProof:v.fiscalProof});}
export function ownF931VisibleFields(value,search='',page=1){const v=trustedOwnF931(value);need(Number.isSafeInteger(page)&&page>0,'Página inválida.');const term=String(search).trim().toLocaleLowerCase('es'),rows=v.fieldReferences.filter(r=>!term||[r.number,r.label,r.status].some(s=>String(s).toLocaleLowerCase('es').includes(term))),pages=Math.max(1,Math.ceil(rows.length/20)),current=Math.min(page,pages);return {rows:rows.slice((current-1)*20,current*20),filtered:rows.length,total:v.fieldReferences.length,page:current,pages};}
export function ownF931VisibleContracts(value,search='',state='all',page=1){
 const v=trustedOwnF931(value);need(Number.isSafeInteger(page)&&page>0,'Página de legajos inválida.');need(['all','pending',...Object.keys(OWN_F931_FISCAL_STATUSES)].includes(state),'Elegí un estado de revisión fiscal disponible.');
 // La lista muestra los contratos con participación en la jurisdicción elegida; sus estados
 // fiscales y los conteos del universo (total/pending) no dependen de esa elección.
 const members=v.params.jurisdiction==='all'?v.fiscalRows:v.fiscalRows.filter(r=>r.selectedParticipations>0);
 const term=String(search).trim().toLocaleLowerCase('es'),rows=members.filter(r=>(state==='all'||state==='pending'&&r.state!=='documented'||r.state===state)&&(!term||[...r.employeeNumbers,r.label].some(s=>s.toLocaleLowerCase('es').includes(term)))),pages=Math.max(1,Math.ceil(rows.length/20)),current=Math.min(page,pages);
 return {rows:rows.slice((current-1)*20,current*20),filtered:rows.length,total:v.fiscalRows.length,selected:members.length,pending:v.fiscalRows.filter(r=>r.state!=='documented').length,page:current,pages};
}
const cell=value=>'"'+(/^[\s]*[=+\-@\t\r\n]/.test(String(value))?"'":'')+String(value??'').replaceAll('"','""')+'"';
export function ownF931PreparationCsv(value){
 const v=trustedOwnF931(value),scoped=v.params.jurisdiction!=='all',jc=v.jurisdictionCoverage,rows=[['PREPARACIÓN F.931 · NO ES UN TXT FISCAL','Estado','Acción sugerida','Desde','Hasta','Longitud'],
  ['Período',v.params.period,'Fecha prevista de presentación: '+v.params.presentationDate,'','',''],
  ['Jurisdicción elegida',OWN_JURISDICTIONS[v.params.jurisdiction],'Jurisdicción laboral conservada en el cierre original. No acredita la población fiscal General / 42 / 55 ni se infiere del padrón actual.','','',''],
  ['Jurisdicciones conservadas en el alcance completo','42: '+jc['42']+' · 55: '+jc['55'],'Sin informar en el alta: '+jc.not_reported+' · No capturada en el cálculo: '+jc.not_captured+' · Contratos con más de una jurisdicción: '+jc.contractsInSeveralJurisdictions+' · '+jc.scope+' participaciones del alcance completo.','','',''],
  ['Participaciones propias cerradas',String(v.participations)+(scoped?' de '+v.scopeParticipations+' del alcance completo':''),'No acredita la población fiscal completa.','','',''],
  ['Datos fiscales documentados',String(v.fiscalCoverage.reviewed)+' contratos revisados vigentes',String(v.fiscalCoverage.missing)+' sin revisión; '+String(v.fiscalCoverage.stale)+' con fuente modificada; '+String(v.fiscalCoverage.identityNotCaptured)+' sin identidad capturada.'+(scoped?' Universo completo; '+v.fiscalCoverage.selectedContracts+' de '+v.fiscalCoverage.contracts+' contratos en la jurisdicción elegida.':''),'','',''],
  ...v.coverage.map(c=>['Tipo: '+c.type,String(c.closedParticipations)+' participaciones cerradas'+(scoped?' · '+c.selectedParticipations+' en la jurisdicción elegida':''),String(c.notClosedRows)+' filas actuales sin cerrar; '+String(c.partialGroups)+' grupos parciales. Jurisdicción conservada 42: '+c.jurisdictions['42']+' · 55: '+c.jurisdictions['55']+' · sin informar: '+c.jurisdictions.not_reported+' · no capturada: '+c.jurisdictions.not_captured+'.','','','']),
  ...v.requirements.map(r=>[r.code,'Pendiente',r.action,'','','']),
  ...v.issues.map(r=>[r.code,r.type??'Conjunto completo',r.action,'','','']),
  ...v.fieldReferences.map(r=>['Campo '+r.number+' · '+r.label,r.status,r.action,r.from,r.to,r.width]),
  ['Referencia pública',F931_REFERENCE.version,F931_REFERENCE.url,'','','']];
 // Only fixed labels, validated dates/types and counts. No nominal values,
 // salaries, contract UUIDs, free text, hashes or source bytes in this CSV.
 return '﻿'+rows.map(r=>r.map(cell).join(';')).join('\r\n')+'\r\n';
}
