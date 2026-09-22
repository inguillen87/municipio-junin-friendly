import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {readAndVerifySources} from './import-rrhh-neon.mjs';
import {getGrhSourceProfile,defaultGrhSourceProfile} from './lib/grh-source-profile.mjs';
import {createRrhhReportSnapshot} from '../assets/rrhh-report-pack.js';

export const FRIENDLY_AGGREGATE_GENERATOR_VERSION='friendly-source-aggregate.v1';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const MIN_GROUP=10,ANALYSIS_FROM='2019-12-10',PREVIOUS_TO='2023-12-08',CURRENT_FROM='2023-12-09';
const SECTORS=Object.freeze([
 ['OBRERO','Obrero'],['TEMPORARIOS','Temporarios'],['ADMINISTRATIVO','Administrativo'],
 ['DOCENTES JARDINES MATERNALES','Docentes de jardines maternales'],['HS. CATEDRAS CULTURA','Horas cátedra Cultura'],
 ['HS. CATEDRAS DEPORTES','Horas cátedra Deportes'],['FUNCIONARIOS','Funcionarios'],
]);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fold=value=>String(value??'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleUpperCase('es');
function date(value,{nullable=false}={}){
 if(value===null&&nullable)return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('FRIENDLY_SOURCE_DATE_INVALID');
 const d=new Date(value+'T00:00:00.000Z');
 if(Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==value)fail('FRIENDLY_SOURCE_DATE_INVALID');
 return value;
}
function employeeKey(row){
 const k=row?.sourceKey;
 if(!k||!['companyCode','employeeNumber'].every(n=>typeof k[n]==='string'&&k[n].length>0))fail('FRIENDLY_SOURCE_KEY_INVALID');
 return JSON.stringify([k.companyCode,k.employeeNumber]);
}
const within=(value,from,to)=>value!==null&&value>=from&&value<=to;
function privacyCount(value){if(value>0&&value<MIN_GROUP)fail('FRIENDLY_AGGREGATE_SMALL_GROUP');return value;}
function period(rows,label,from,to,partial=false){
 const hires=rows.filter(r=>within(r.hireDate,from,to)).length,exits=rows.filter(r=>within(r.exitDate,from,to)).length;
 return {label,from,to,hires,exits,balance:hires-exits,...(partial?{partial:true}:{})};
}

/** Pure projection. Production callers must obtain source with readAndVerifySources;
 * the public CLI below always verifies every artifact before using this function. */
export function buildFriendlySourceAggregate(source){
 const profile=getGrhSourceProfile(source?.profileId),manifest=source?.manifest,d=source?.datasets;
 if(manifest?.profile!==profile.curated.profileId||manifest.source?.sha256?.toUpperCase()!==profile.source.sha256
  ||manifest.source?.dumpCompletedAt?.replace(' ','T')!==profile.source.cutoff||manifest.source?.database!==profile.source.database
  ||manifest.validation?.strictSnapshot!==true)fail('FRIENDLY_SOURCE_PROFILE_MISMATCH');
 for(const [key,count]of Object.entries(profile.curated.expectedOutputCounts))if(!Array.isArray(d?.[key])||d[key].length!==count)fail('FRIENDLY_SOURCE_COUNT_MISMATCH');
 const cutoff=date(profile.source.cutoff.slice(0,10)),lastYear=Number(cutoff.slice(0,4));
 if(lastYear<2021||lastYear>2100)fail('FRIENDLY_SOURCE_DATE_INVALID');
 const employeeKeys=new Set(),rows=d.employees.map(e=>{
  const key=employeeKey(e);if(employeeKeys.has(key))fail('FRIENDLY_SOURCE_DUPLICATE_EMPLOYEE');employeeKeys.add(key);
  const hireDate=date(e.employment?.hireDate,{nullable:true}),exitDate=date(e.employment?.exitDate,{nullable:true});
  if(typeof e.employment?.activeProxy!=='boolean'||e.employment.activeProxy!==(exitDate===null))fail('FRIENDLY_SOURCE_ACTIVE_PROXY_MISMATCH');
  return {key,hireDate,exitDate,active:e.employment.activeProxy,sector:fold(e.employment.sectorName),sex:e.identity?.sexCode};
 });
 const active=rows.filter(r=>r.active),genderActive=[{label:'Masculino',value:0},{label:'Femenino',value:0}];
 const sectors=new Map(SECTORS.map(([key])=>[key,0]));let other=0,unmatched=0;
 for(const r of active){
  if(!['M','F'].includes(r.sex))fail('FRIENDLY_SOURCE_GENDER_UNCLASSIFIED');genderActive[r.sex==='M'?0:1].value++;
  if(!r.sector)unmatched++;else if(sectors.has(r.sector))sectors.set(r.sector,sectors.get(r.sector)+1);else other++;
 }
 const activeSectors=SECTORS.map(([key,label])=>({label,value:sectors.get(key)}));
 // Publish no small sector separately. A pooled remainder still must reach ten.
 for(let i=activeSectors.length-1;i>=0;i--)if(activeSectors[i].value>0&&activeSectors[i].value<MIN_GROUP){other+=activeSectors[i].value;activeSectors.splice(i,1);}
 activeSectors.push({label:'Otros sectores',value:other},{label:'Sin sector homologado',value:unmatched});
 [...activeSectors,...genderActive].forEach(r=>privacyCount(r.value));
 const years=Array.from({length:lastYear-2018},(_,i)=>2019+i);
 const yearly=years.map(year=>{
  const from=year===2019?ANALYSIS_FROM:year+'-01-01',to=year===lastYear?cutoff:year+'-12-31';
  return {year,hires:rows.filter(r=>within(r.hireDate,from,to)).length,exits:rows.filter(r=>within(r.exitDate,from,to)).length,...(year===2019||year===lastYear?{partial:true}:{})};
 });
 let absenceOrphans=0,before=0,after=0,latest=null;
 const absenceByYear=new Map(years.map(year=>[year,{events:0,affected:new Set()}]));
 for(const a of d.absences){
  const key=employeeKey(a),when=date(a.absenceDate);if(!employeeKeys.has(key))absenceOrphans++;
  if(when<'1900-01-01')before++;else if(when>cutoff)after++;else if(!latest||when>latest)latest=when;
  if(when>='2019-01-01'&&when<=cutoff){const group=absenceByYear.get(Number(when.slice(0,4)));group.events++;group.affected.add(key);}
 }
 // v1 equates latest observed valid event with source cutoff. Never fabricate an
 // event date merely to satisfy it; a different source needs a contract revision.
 if(latest!==cutoff)fail('FRIENDLY_SOURCE_ABSENCE_COVERAGE_MISMATCH');
 const sourcePersons=manifest.validation.sourceCounts?.persona;
 if(sourcePersons?.actual!==profile.curated.expectedCounts.persona||sourcePersons.expected!==sourcePersons.actual
   ||sourcePersons.distinctPrimaryKeys!==sourcePersons.actual||sourcePersons.duplicatePrimaryKeyRows!==0
   ||absenceOrphans!==manifest.validation.joins?.absenceEmployee?.orphanRows)fail('FRIENDLY_SOURCE_QUALITY_MISMATCH');
 const leaveDates=d.leaves.flatMap(l=>[date(l.startDate,{nullable:true}),date(l.endDate,{nullable:true})]).filter(v=>v&&v>='1900-01-01'&&v<=cutoff).sort();
 const latestLeave=leaveDates.at(-1);if(!latestLeave||latestLeave.slice(0,4)!=='2009')fail('FRIENDLY_SOURCE_LEAVE_COVERAGE_CHANGED');
 const result={schemaVersion:1,jurisdiction:{municipality:'Junín',province:'Mendoza',country:'Argentina'},
  source:{dataset:'Sistema GRH municipal',snapshotAt:profile.source.cutoff,timezone:'not_recorded_in_dump',sha256:profile.source.sha256,
   method:'Agregación reproducible de artefactos curados con huellas verificadas del respaldo municipal, sin registros nominales',
   scope:'Legajos históricos y eventos de ausencia; actividad aproximada por ausencia de fecha de egreso',limitations:[
    'Activo es un indicador aproximado (proxy): no tiene fecha de egreso en la fuente; no acredita vigencia laboral ni liquidación.',
    'Se cuentan legajos, no personas únicas. Una persona puede tener más de un legajo; afectados se deduplica por empresa y legajo dentro de cada año.',
    'Este agregado no publica ni calcula importes salariales.',
    'Licencias tiene última fecha válida en 2009 y no representa el estado actual.',
    `Los datos ${lastYear} están cortados al ${cutoff} y no equivalen a un año completo ni a información en tiempo real.`,
    'La comparación descriptiva conserva ventanas de distinta duración: gestión anterior desde el 10 de diciembre de 2019; gestión actual desde el 9 de diciembre de 2023. No mide rendimiento ni causalidad.',
    'El mínimo de 10 se aplica a género, sectores y legajos afectados por año. Los totales temporales de altas y bajas y los conteos de incidencias de calidad no tienen desglose nominal.',
   ]},privacy:{grain:'aggregate',containsPersonRows:false,minimumPublishedGroupSize:MIN_GROUP},
  workforce:{historicalRecords:rows.length,active:active.length,inactive:rows.length-active.length,activeSharePct:Math.round(active.length*100/rows.length),genderActive,activeSectors},
  management:{previous:period(rows,'Gestión anterior',ANALYSIS_FROM,PREVIOUS_TO),current:period(rows,'Gestión actual',CURRENT_FROM,cutoff,true),yearly},
  absence:{totalEvents:d.absences.length,latestValidDate:latest,yearly:years.map(year=>{const g=absenceByYear.get(year);return {year,events:g.events,employeesAffected:privacyCount(g.affected.size),...(year===lastYear?{partial:true}:{})};}),unit:'eventos registrados',warning:'No se suman días ni se calcula tasa hasta homologar la semántica de los campos con RRHH.'},
  quality:{employeeKeyDuplicates:0,activeGenderCoveragePct:100,activeWithoutMatchedSector:unmatched,missingHireDate:rows.filter(r=>r.hireDate===null).length,
   hireDatePlaceholders:rows.filter(r=>r.hireDate!==null&&r.hireDate<'1900-01-01').length,absenceOrphans,absenceDatesBefore1900:before,absenceDatesAfterSnapshot:after,
   catalogCounts:Object.fromEntries(['sectors','categories','unions','agreements'].map(key=>[key,d[key].length])),sourceCounts:{employeeRecords:rows.length,personRecords:sourcePersons.actual,absenceEvents:d.absences.length,leaveRecords:d.leaves.length}},
  availability:{workforce:'verified',managementComparison:'derived',absenceEvents:'verified',payrollAmounts:'internal_closed_runs_only',budgetExecution:'unavailable',currentLeaves:'unavailable'}};
 createRrhhReportSnapshot(result,{generatedAt:'2000-01-01T00:00:00.000Z'}); // Validation only; no timestamp is published in candidate bytes.
 return result;
}

export async function generateFriendlySourceAggregate({dataDir,profileId=defaultGrhSourceProfile().id}){
 getGrhSourceProfile(profileId); // Reject an unknown profile before reading a directory.
 if(!(dataDir instanceof URL)||dataDir.protocol!=='file:')fail('FRIENDLY_SOURCE_DIRECTORY_INVALID');
 const source=await readAndVerifySources(dataDir,{profileId}),aggregate=buildFriendlySourceAggregate(source),text=JSON.stringify(aggregate,null,2)+'\n';
 const report={version:FRIENDLY_AGGREGATE_GENERATOR_VERSION,profileId,sourceSha256:aggregate.source.sha256.toLowerCase(),sourceCutoff:aggregate.source.snapshotAt,
  manifestSha256:source.manifestSha256.toLowerCase(),aggregateSha256:sha(text),aggregateBytes:Buffer.byteLength(text),published:false,
  artifactEvidence:Object.fromEntries(Object.entries(source.manifest.outputs).map(([name,v])=>[name,{sha256:v.sha256.toLowerCase(),bytes:v.bytes,count:v.records}])),
  conventions:{activity:'no exit date; source proxy only',unit:'employment records, not unique people',affectedKey:'company and employee number',managementFrom:ANALYSIS_FROM,previousTo:PREVIOUS_TO,currentFrom:CURRENT_FROM,
   annualWindowChange:false,absenceAnnualFrom:'2019-01-01',smallGroupPolicy:'positive sector, gender and affected-employee groups must be at least ten; temporal totals and quality incidences have no personal breakdown'},
  totals:{historical:aggregate.workforce.historicalRecords,activeProxy:aggregate.workforce.active,inactive:aggregate.workforce.inactive,absenceEvents:aggregate.absence.totalEvents},
  validatedContracts:['friendly-data.schemaVersion1','rrhh-report-pack.v1'],containsPersonRows:false};
 return {aggregate,text,report};
}
export function parseFriendlyAggregateArgs(argv){
 const result={};for(const arg of argv){const match=/^--(data-dir|profile|output)=(.+)$/.exec(arg);if(!match||Object.hasOwn(result,match[1]))fail('FRIENDLY_AGGREGATE_ARGUMENT_INVALID');result[match[1]]=match[2];}
 const profileId=result.profile??defaultGrhSourceProfile().id;getGrhSourceProfile(profileId);
 if(!path.isAbsolute(result['data-dir']??'')||!result.output)fail('FRIENDLY_AGGREGATE_ARGUMENT_INVALID');
 const output=path.resolve(ROOT,result.output),relative=path.relative(path.join(ROOT,'verification'),output);
 if(relative.startsWith('..')||path.isAbsolute(relative)||!relative||!output.endsWith('.json'))fail('FRIENDLY_AGGREGATE_CANDIDATE_ONLY');
 return {profileId,dataDir:pathToFileURL(path.resolve(result['data-dir'])+path.sep),output};
}
async function main(){
 try{const args=parseFriendlyAggregateArgs(process.argv.slice(2)),result=await generateFriendlySourceAggregate(args);
  await mkdir(path.dirname(args.output),{recursive:true});await writeFile(args.output,result.text,{flag:'wx'});
  await writeFile(args.output.replace(/\.json$/,'.report.json'),JSON.stringify(result.report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({ok:true,...result.report}));
 }catch(error){const safe=/^(?:FRIENDLY_|RRHH_)/.test(error?.code??'')?error.code:error?.code==='EEXIST'?'FRIENDLY_AGGREGATE_OUTPUT_EXISTS':'FRIENDLY_AGGREGATE_FAILED';console.error(JSON.stringify({ok:false,code:safe}));process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
