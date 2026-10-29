// PROPOSED by Claude (source only; never imported or run by Claude).
// Target: scripts/lib/payroll-detail-october28-lot.mjs
// Pure, offline review of the payroll DETAIL lot that scripts/extract-grh-payroll-detail.py produces from the
// October 28 backup. It binds every private payload to the audited Oct28 registry profile, to the exact four
// closed current runs (F, M, O, V at 2026-10-31) and to the limits of the unchanged SQL048 writer
// (payroll_detail_delivery_v1). No file system, SQL, network or nominal value leaves this module: the review
// carries counts and hashes only. Type F is kept RAW ('F'); nothing here maps it to monthly or canonical.
// R3: the admission carries EXTERNAL CUSTODY minted by root's extraction act (SHA-256 of the manifest bytes and of
// each of the four payload files). The lot is verified against that custody, never only against the hashes the
// manifest declares about itself: a payload rewritten and re-hashed together with its manifest still fails.
import {createHash} from 'node:crypto';

export const OCT28_DETAIL_LOT_VERSION='payroll-detail-october28-lot-review.v3';
export const OCT28_DETAIL_ADMISSION_VERSION='payroll-detail-october28-lot-admission.v2';
export const OCT28_DETAIL_PROFILE_ID='grh-junin-2026-10-28';
export const OCT28_DETAIL_COMPANY='101';
export const OCT28_DETAIL_SOURCE_DATABASE='grh_junin';
// Reviewed bytes of the existing reader. Its semantics (grouping, guards, hash of the file bytes) are relied upon.
export const OCT28_DETAIL_EXTRACTOR=Object.freeze({path:'scripts/extract-grh-payroll-detail.py',sha256:'5876bd6661584fe024a827a799096315934bfeb2e7e34788e46be303fad3182c'});
// SQL048 writer limits (payroll_detail_dataset / payroll_detail_statement / payroll_detail_delivery_job).
export const SQL048_LIMITS=Object.freeze({statementsPerDataset:[1,2000],linesPerDataset:[1,30000],linesPerStatement:[1,1000],payloadBytes:[1,6000000],sourceLabelLength:[1,240],
 cipherBytesDeliveryV1:[32,1048576],cipherBytesPayloadDeliveryV1:[1,6000000]});
const PAYLOAD_VERSION='payroll-detail-source.v1',HEX64=/^[a-f0-9]{64}$/,LEGAJO=/^[0-9]{1,12}$/,CODE=/^[0-9]{1,6}$/,DECIMAL=/^-?[0-9]{1,13}\.[0-9]{2}$/,INTEGER=/^[0-9]+$/,DATE=/^\d{4}-\d{2}-\d{2}$/,TYPE=/^[A-Z]$/;
const fail=(code,detail)=>{throw Object.assign(new Error(detail?code+':'+detail:code),{code});};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const freeze=v=>{if(v&&typeof v==='object'&&!ArrayBuffer.isView(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const runKey=r=>r.payrollDate+'-'+r.payrollType;
const exactKeys=(o,keys)=>object(o)&&Object.keys(o).sort().join()===[...keys].sort().join();

/** Label the extractor derives from the dump footer (extract-grh-payroll-detail.py:88). Cutoff is the declared time, no zone. */
export function expectedSourceLabel(cutoff){
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})$/.exec(cutoff??'');if(!m)fail('OCT28_DETAIL_CUTOFF_INVALID');
 return `Respaldo GRH ${m[3]}/${m[2]}/${m[1]} · cierre del archivo ${m[4]} (hora declarada)`;
}

/** The expectations are the registry profile's, never the lot's own numbers. */
export function october28DetailExpectations(profile){
 if(!object(profile)||profile.id!==OCT28_DETAIL_PROFILE_ID||profile.publicationMode!=='candidate_only'||profile.core?.schemaVersion!==2)fail('OCT28_DETAIL_PROFILE_INVALID');
 const gzip=String(profile.source?.gzipSha256??'').toLowerCase(),logical=String(profile.source?.sha256??'').toLowerCase();
 if(!HEX64.test(gzip)||!HEX64.test(logical)||gzip===logical)fail('OCT28_DETAIL_PROFILE_INVALID');
 const runs=Array.isArray(profile.core?.currentRuns)?profile.core.currentRuns:[];
 if(!runs.length)fail('OCT28_DETAIL_PROFILE_INVALID');
 for(const r of runs)if(r.companyCode!==OCT28_DETAIL_COMPANY||!DATE.test(r.payrollDate)||r.payrollDate!==profile.source.currentPayrollDate||!TYPE.test(r.payrollType)||!Number.isSafeInteger(r.period)||!Number.isSafeInteger(r.month))fail('OCT28_DETAIL_PROFILE_INVALID');
 const concepts=profile.core?.expectedCounts?.concepto;if(!Number.isSafeInteger(concepts)||concepts<1)fail('OCT28_DETAIL_PROFILE_INVALID');
 return freeze({profileId:profile.id,
  // The extractor hashes the FILE it is given. Datasets have always carried the gzip hash (Oct01: e0735632… = that
  // profile's gzipSha256), so the lot binds to gzipSha256; the logical hash identifies the core artifacts instead.
  sourceSha256:gzip,logicalSha256:logical,sourceDatabase:OCT28_DETAIL_SOURCE_DATABASE,company:OCT28_DETAIL_COMPANY,
  sourceLabel:expectedSourceLabel(profile.source.cutoff),cutoff:profile.source.cutoff,conceptCount:concepts,
  // Only CLOSED current runs are admissible for the Haberes datasets.
  closedCurrentRuns:runs.filter(r=>r.closureStatus==='closed').map(r=>({companyCode:r.companyCode,payrollDate:r.payrollDate,period:r.period,month:r.month,payrollType:r.payrollType}))});
}

/**
 * Root's admission: the exact counts of EVERY closed current run (from root's own extractor run). R2: the admitted
 * run set must equal closedCurrentRuns exactly (F, M, O and V for October): a subset, however consistent with the
 * manifest and the files, is rejected. The lot is then compared against closedCurrentRuns, not only the admission.
 * R3: the admission also carries the custody minted by the extraction act itself: SHA-256 of manifest-aggregate.json
 * and of each payload file, one per closed current run. Those hashes are the authority the lot is checked against.
 * A v1 admission (counts only) is no longer admissible.
 */
export function validateOctober28DetailAdmission(admission,expectations){
 if(!object(admission)||admission.version!==OCT28_DETAIL_ADMISSION_VERSION)fail('OCT28_DETAIL_ADMISSION_VERSION');
 if(!exactKeys(admission,['version','profileId','sourceSha256','extractorSha256','runs','custody']))fail('OCT28_DETAIL_ADMISSION_KEYS');
 if(admission.profileId!==expectations.profileId||admission.sourceSha256!==expectations.sourceSha256)fail('OCT28_DETAIL_ADMISSION_SOURCE');
 if(admission.extractorSha256!==OCT28_DETAIL_EXTRACTOR.sha256)fail('OCT28_DETAIL_ADMISSION_EXTRACTOR');
 if(!Array.isArray(admission.runs)||!admission.runs.length)fail('OCT28_DETAIL_ADMISSION_RUNS');
 const seen=new Set();
 for(const r of admission.runs){
  if(!exactKeys(r,['payrollDate','payrollType','statements','lines']))fail('OCT28_DETAIL_ADMISSION_RUNS');
  const key=runKey(r);if(seen.has(key))fail('OCT28_DETAIL_ADMISSION_RUNS');seen.add(key);
  if(!expectations.closedCurrentRuns.some(c=>runKey(c)===key))fail('OCT28_DETAIL_ADMISSION_RUN_NOT_CLOSED_CURRENT',key);
  for(const n of [r.statements,r.lines])if(!Number.isSafeInteger(n)||n<1)fail('OCT28_DETAIL_ADMISSION_RUNS');
 }
 const expectedKeys=expectations.closedCurrentRuns.map(runKey).sort(),admittedKeys=[...seen].sort();
 if(expectedKeys.join()!==admittedKeys.join())fail('OCT28_DETAIL_ADMISSION_RUN_SET',expectedKeys.join('|')+' vs '+admittedKeys.join('|'));
 const custody=october28DetailCustody(admission.custody,expectedKeys);
 return freeze({runs:admission.runs.map(r=>({...r})),custody});
}

/**
 * External custody minted by root's extraction act: {manifestSha256, payloads:{'<date>-<type>':sha256}} with exactly
 * one payload hash per closed current run. Every hash must be a distinct lowercase SHA-256; nothing is derived from
 * the lot directory here. The admission file itself is pinned by the CLI (--admission-sha256).
 */
export function october28DetailCustody(custody,expectedKeys){
 if(!exactKeys(custody,['manifestSha256','payloads'])||!HEX64.test(custody.manifestSha256)||!object(custody.payloads))fail('OCT28_DETAIL_ADMISSION_CUSTODY');
 const keys=Object.keys(custody.payloads).sort();if(keys.join()!==[...expectedKeys].sort().join())fail('OCT28_DETAIL_ADMISSION_CUSTODY',keys.join('|'));
 const all=[custody.manifestSha256,...keys.map(k=>custody.payloads[k])];
 if(!all.every(h=>HEX64.test(h))||new Set(all).size!==all.length)fail('OCT28_DETAIL_ADMISSION_CUSTODY');
 return freeze({manifestSha256:custody.manifestSha256,payloads:Object.fromEntries(keys.map(k=>[k,custody.payloads[k]]))});
}

function reviewPayload(bytes,entry,expectations,admitted,custodySha256){
 const label=runKey({payrollDate:entry.date,payrollType:entry.type});
 if(!(bytes instanceof Uint8Array)||!bytes.length)fail('OCT28_DETAIL_PAYLOAD_MISSING',label);
 if(bytes.length>SQL048_LIMITS.payloadBytes[1])fail('OCT28_DETAIL_PAYLOAD_TOO_LARGE',label);
 // The file bytes are hashed here and compared FIRST with the external custody, then with the manifest entry.
 const payloadSha256=sha256(bytes);if(payloadSha256!==custodySha256)fail('OCT28_DETAIL_CUSTODY_PAYLOAD',label);
 if(payloadSha256!==entry.payloadSha256)fail('OCT28_DETAIL_MANIFEST_PAYLOAD_SHA',label);
 let p;try{p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('OCT28_DETAIL_PAYLOAD_UNREADABLE',label);}
 if(!exactKeys(p,['version','sourceSha256','sourceDatabase','sourceLabel','company','period','month','date','type','closedFlag','concepts','statements']))fail('OCT28_DETAIL_PAYLOAD_KEYS',label);
 if(p.version!==PAYLOAD_VERSION)fail('OCT28_DETAIL_PAYLOAD_VERSION',label);
 if(p.sourceSha256!==expectations.sourceSha256)fail('OCT28_DETAIL_SOURCE_SHA',label);
 if(p.sourceDatabase!==expectations.sourceDatabase||p.company!==expectations.company)fail('OCT28_DETAIL_SOURCE_IDENTITY',label);
 if(p.sourceLabel!==expectations.sourceLabel)fail('OCT28_DETAIL_SOURCE_LABEL',label);
 if(p.date!==entry.date||p.type!==entry.type)fail('OCT28_DETAIL_RUN_IDENTITY',label);
 const run=expectations.closedCurrentRuns.find(c=>runKey(c)===label);if(!run)fail('OCT28_DETAIL_RUN_NOT_CLOSED_CURRENT',label);
 if(p.period!==run.period||p.month!==run.month)fail('OCT28_DETAIL_RUN_IDENTITY',label);
 // The run must be closed in the dump itself (histocal flag), not only in the profile.
 if(p.closedFlag!=='1')fail('OCT28_DETAIL_RUN_NOT_CLOSED',label);
 if(!object(p.concepts)||Object.keys(p.concepts).length!==expectations.conceptCount)fail('OCT28_DETAIL_CONCEPT_CATALOG',label);
 for(const [code,c] of Object.entries(p.concepts))if(!CODE.test(code)||!exactKeys(c,['code','description','shortDescription','calculationClass','type','totalGroup','unit'])||c.code!==code)fail('OCT28_DETAIL_CONCEPT_CATALOG',label);
 if(!Array.isArray(p.statements))fail('OCT28_DETAIL_STATEMENTS',label);
 const [minS,maxS]=SQL048_LIMITS.statementsPerDataset,[minL,maxL]=SQL048_LIMITS.linesPerDataset,[minLS,maxLS]=SQL048_LIMITS.linesPerStatement;
 if(p.statements.length<minS||p.statements.length>maxS)fail('OCT28_DETAIL_STATEMENT_LIMIT',label);
 let lines=0,previousLegajo=-1;const legajos=new Set();
 for(const s of p.statements){
  if(!exactKeys(s,['legajo','lines'])||!LEGAJO.test(s.legajo)||!Array.isArray(s.lines))fail('OCT28_DETAIL_STATEMENT_SHAPE',label);
  const legajo=Number(s.legajo);if(legajo<=previousLegajo||legajos.has(s.legajo))fail('OCT28_DETAIL_STATEMENT_ORDER',label);previousLegajo=legajo;legajos.add(s.legajo);
  if(s.lines.length<minLS||s.lines.length>maxLS)fail('OCT28_DETAIL_LINE_LIMIT',label);
  let previousCode=-1;const codes=new Set();
  for(const l of s.lines){
   if(!exactKeys(l,['code','quantity','amount','agreement','costCenter','paymentPlace','sector'])||!CODE.test(l.code))fail('OCT28_DETAIL_LINE_SHAPE',label);
   if(codes.has(l.code)||Number(l.code)<=previousCode)fail('OCT28_DETAIL_LINE_ORDER',label);codes.add(l.code);previousCode=Number(l.code);
   if(!Object.hasOwn(p.concepts,l.code))fail('OCT28_DETAIL_LINE_CONCEPT_UNKNOWN',label);
   for(const k of ['quantity','amount'])if(l[k]!==null&&(typeof l[k]!=='string'||!DECIMAL.test(l[k])))fail('OCT28_DETAIL_LINE_DECIMAL',label);
   for(const k of ['agreement','costCenter','paymentPlace','sector'])if(l[k]!==null&&(typeof l[k]!=='string'||!INTEGER.test(l[k])))fail('OCT28_DETAIL_LINE_INTEGER',label);
  }
  lines+=s.lines.length;
 }
 if(lines<minL||lines>maxL)fail('OCT28_DETAIL_LINES_LIMIT',label);
 if(p.statements.length!==entry.statements||lines!==entry.lines)fail('OCT28_DETAIL_MANIFEST_COUNTS',label);
 if(p.statements.length!==admitted.statements||lines!==admitted.lines)fail('OCT28_DETAIL_ADMISSION_COUNTS',label);
 return{payrollDate:p.date,payrollType:p.type,period:p.period,month:p.month,closedFlag:p.closedFlag,statements:p.statements.length,lines,payloadBytes:bytes.length,payloadSha256,
  deliveryV1CipherCeilingBytes:SQL048_LIMITS.cipherBytesDeliveryV1[1]};
}

/** Optional cross-check with the core acceptance receipt of verify-grh-multirun-candidate.mjs for the same profile. */
function checkCoreAcceptance(core,expectations,runs){
 if(core===undefined||core===null)return{present:false};
 if(!object(core)||core.version!=='grh-multirun-candidate-acceptance.v1'||core.accepted!==true||core.profileId!==expectations.profileId||core.databaseWrites!==0||core.sourcePromoted!==false)fail('OCT28_DETAIL_CORE_ACCEPTANCE');
 if(String(core.sourceSha256).toLowerCase()!==expectations.logicalSha256||core.sourceCutoff!==expectations.cutoff)fail('OCT28_DETAIL_CORE_SOURCE');
 const current=Array.isArray(core.currentRuns)?core.currentRuns:[];
 for(const r of runs){const c=current.find(x=>x.payrollDate===r.payrollDate&&x.payrollType===r.payrollType&&x.companyCode===expectations.company);
  if(!c||c.closureStatus!=='closed'||c.period!==r.period||c.month!==r.month)fail('OCT28_DETAIL_CORE_RUN_MISMATCH',runKey(r));}
 return{present:true,manifestSha256:core.manifestSha256??null};
}

/**
 * directoryFiles: names present in the private output directory (root lists it; nothing else is read).
 * read(name): bytes of a file in that directory. profile: the Oct28 registry profile (B). admission: root's.
 */
export function verifyOctober28DetailLot({directoryFiles,read,profile,admission,coreAcceptance}={}){
 if(!Array.isArray(directoryFiles)||typeof read!=='function')fail('OCT28_DETAIL_INPUT');
 const expectations=october28DetailExpectations(profile),admitted=validateOctober28DetailAdmission(admission,expectations);
 const manifestBytes=read('manifest-aggregate.json');if(!(manifestBytes instanceof Uint8Array)||!manifestBytes.length)fail('OCT28_DETAIL_MANIFEST_MISSING');
 // Custody of the manifest bytes precedes any reading of what the manifest declares about itself.
 const manifestSha256=sha256(manifestBytes);if(manifestSha256!==admitted.custody.manifestSha256)fail('OCT28_DETAIL_CUSTODY_MANIFEST');
 let manifest;try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifestBytes));}catch{fail('OCT28_DETAIL_MANIFEST_UNREADABLE');}
 if(!Array.isArray(manifest)||!manifest.length)fail('OCT28_DETAIL_MANIFEST_SHAPE');
 const entries=new Map();
 for(const e of manifest){
  if(!exactKeys(e,['date','type','lines','statements','sourceSha256','payloadSha256'])||!DATE.test(e.date)||!TYPE.test(e.type)||!HEX64.test(e.payloadSha256))fail('OCT28_DETAIL_MANIFEST_SHAPE');
  if(e.sourceSha256!==expectations.sourceSha256)fail('OCT28_DETAIL_SOURCE_SHA',runKey({payrollDate:e.date,payrollType:e.type}));
  const key=e.date+'-'+e.type;if(entries.has(key))fail('OCT28_DETAIL_MANIFEST_DUPLICATE',key);entries.set(key,e);
 }
 // Exactly the closed current runs of the profile (F, M, O, V): nothing extra (another date, type or stray file) and
 // nothing missing. The comparison is against the profile, so omitting a run from admission, manifest and files
 // together still fails; the admission was already required to equal the same set.
 const expectedKeys=expectations.closedCurrentRuns.map(runKey).sort(),manifestKeys=[...entries.keys()].sort();
 if(expectedKeys.join()!==manifestKeys.join())fail('OCT28_DETAIL_RUN_SET',expectedKeys.join('|')+' vs '+manifestKeys.join('|'));
 const admittedKeys=admitted.runs.map(runKey).sort();if(admittedKeys.join()!==expectedKeys.join())fail('OCT28_DETAIL_ADMISSION_RUN_SET');
 const expectedFiles=['manifest-aggregate.json',...manifestKeys.map(k=>k+'.private.json')].sort();
 if([...directoryFiles].sort().join()!==expectedFiles.join())fail('OCT28_DETAIL_DIRECTORY_FILES');
 const runs=[];
 for(const key of manifestKeys){
  const entry=entries.get(key),a=admitted.runs.find(r=>runKey(r)===key),custodySha256=admitted.custody.payloads[key];
  if(!HEX64.test(custodySha256??''))fail('OCT28_DETAIL_CUSTODY_PAYLOAD',key);
  runs.push(reviewPayload(read(key+'.private.json'),entry,expectations,a,custodySha256));
 }
 const core=checkCoreAcceptance(coreAcceptance,expectations,runs);
 const totals=runs.reduce((t,r)=>({statements:t.statements+r.statements,lines:t.lines+r.lines,payloadBytes:t.payloadBytes+r.payloadBytes}),{statements:0,lines:0,payloadBytes:0});
 if(runs.length!==expectations.closedCurrentRuns.length)fail('OCT28_DETAIL_RUN_SET');
 return freeze({version:OCT28_DETAIL_LOT_VERSION,profileId:expectations.profileId,sourceSha256:expectations.sourceSha256,logicalSha256:expectations.logicalSha256,expectedRuns:expectations.closedCurrentRuns.map(runKey),
  sourceLabel:expectations.sourceLabel,extractor:{...OCT28_DETAIL_EXTRACTOR},manifestSha256,conceptCatalogCount:expectations.conceptCount,
  custody:{source:'root_extraction_act_admission',manifestSha256:admitted.custody.manifestSha256,payloadsVerified:manifestKeys.length,payloads:{...admitted.custody.payloads}},
  runs,payrollTypes:runs.map(r=>r.payrollType).sort(),canonicalMapping:'none',typeFKeptRaw:runs.some(r=>r.payrollType==='F'),totals,coreAcceptance:core,
  writer:{sql:'scripts/migrations/048-payroll-detail-source.sql',function:'payroll_detail_delivery_v1(uuid,bytea)',changed:false},
  consumersActivated:false,databaseWrites:0,nominalValuesIncluded:false,
  note:'Offline review only. Incorporation stays the private, root-run delivery-job transaction of the September precedent; each run needs its own job and cipher.'});
}
