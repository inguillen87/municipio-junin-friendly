// Offline business-model exercises only. No session, domain command, browser or repository is available here.
import { employeeDraft } from '../assets/native-employee-contract.js';
import { employeeReceipt } from '../assets/native-employee-confirmation-model.js';
import { LIFECYCLE_VERSION, lifecycleAfter, lifecycleActivity } from '../assets/native-employment-lifecycle-model.js';
import { reviewedLifecycleAttempt, assertLifecycleAttemptFresh } from '../assets/native-employment-lifecycle-review.js';
import { ownNoveltyBatch, ownNoveltyCommand, ownNoveltyReceipt, prepareOwnNoveltyReview } from '../assets/own-payroll-novelties-model.js';
import { createHash } from 'node:crypto';
import { changeDiff, validateChangeReceipt } from '../assets/native-employment-change-model.js';
import { reviewedChangeAttempt, assertChangeAttemptFresh } from '../assets/native-employment-change-review.js';
import { salarySerialized } from '../assets/native-salary-catalog-model.js';
import { ownRunWorkspaceCsv } from '../assets/own-payroll-run-workspace-model.js';
import { normalizeOwnPayrollInput, calculateOwnPayroll } from '../assets/own-payroll-engine.js';
import { ownLiquidationCommand } from '../assets/own-payroll-liquidation-model.js';
import { ownCloseCommand } from '../assets/own-payroll-close-model.js';

const registry = [
  ['alta-preparar','preparation','Preparar un alta','Verifica los datos del alta y que el comprobante corresponda al borrador.',testRegistration],
  ['legajo-modificar','preparation','Modificar el encuadre de un legajo','Verifica qué campo cambió, controla catálogo y versión de origen y conserva el historial.',testChange],
  ['baja-revisar','review','Revisar una baja','Comprueba que una solicitud revisada no pueda sustituirse o enviarse al cambiar el ámbito.',testTermination],
  ['novedad-preparar','preparation','Preparar una novedad','Distingue un importe de cero de una fila sin datos y valida identidad y permiso.',testNoveltyPreparation],
  ['novedad-revisar','review','Revisar un lote de novedades','Contrasta la revisión ordinaria y la revisión de importes forzados.',testNoveltyReview],
  ['calculo-verificar','control','Calcular un ejemplo verificable','Ejecuta el motor de cálculo; comprueba importes, vigencia y datos ausentes con reglas de ensayo.',testCalculation],
  ['liquidacion-revisar','review','Confirmar o anular: validar la solicitud','Verifica la forma del comando, el motivo y el alcance individual antes del envío.',testLiquidation],
  ['reportes-validar','control','Exportar el informe de una corrida','Genera el CSV real del detalle de cálculo de ensayo y coteja identificadores, centavos y cobertura.',testReport],
  ['cierre-verificar','control','Cerrar o reabrir: validar la solicitud','Verifica las condiciones de un comando de cierre y el grupo completo de reapertura.',testClosure],
];
export const HOMOLOGATION_CASES = Object.freeze(registry.map(([id,role,label,description])=>Object.freeze({id,role,label,description})));
const trialById = new Map(registry.map(([id,,,description,run])=>[id,{description,run}]));
const observation = 'Ensayo con valores ficticios. Se ejecuta el modelo del producto; no hay operación municipal ni prueba de autorización de una sesión.';
const uid = n=>'eeeeeeee-eeee-4eee-8eee-'+String(n).padStart(12,'0');
const hash = ch=>ch.repeat(64);
const cycleDay = '2030-01-15';

export function runHomologationTrial(caseId) {
  const item=trialById.get(caseId);
  if (!item) throw Object.assign(new RangeError('El caso de homologación no existe.'),{code:'HOMOLOGATION_CASE_UNKNOWN'});
  const checks=[];
  // Uniform result, including failures; never expose internal exception messages or parameters.
  function check(label,evaluate) {
    let passed=false;
    try { passed=evaluate()===true; } catch {}
    checks.push({label,passed});
  }
  try { item.run(check); } catch { checks.push({label:'Preparar el caso con los modelos nativos.',passed:false}); }
  return {id:caseId,status:checks.length>0&&checks.every(c=>c.passed)?'passed':'failed',checks,detail:observation};
}
function refuses(fn,predicate) { try { fn(); } catch(e) { return Boolean(predicate(e)); } return false; }
const code = expected=>err=>err?.code===expected;

function testRegistration(check) {
  // Fictional identifiers. The values are never returned, sent or allocated to a person.
  const draft={legajo:'900000001',fullName:'PERSONA DE ENSAYO',dni:'00000001',cuil:'20000000019',birthDate:'2000-01-01',sexCode:'',startDate:'2030-01-01',agreementCode:'99',categoryCode:'991',organizationId:'999',sectorCode:'998',jobTitle:'Prueba técnica',legalReference:'Documento ficticio de homologación',jurisdictionCode:'42'};
  const prepare=(x)=>employeeDraft(x,cycleDay,{requireJurisdiction:true});
  const receipt={version:'native-employee.v1',registrationId:uid(1),contractId:uid(2),legajo:draft.legajo,name:draft.fullName,startDate:draft.startDate,createdAt:'2030-01-15T12:00:00Z',origin:'MUNICONTROL',accountCreated:false,payrollCalculated:false,replayed:false,jurisdictionCode:'42'};
  check('El modelo admite el alta de ensayo con jurisdicción declarada.',()=>prepare(draft).fullName===draft.fullName);
  check('Rechaza el alta sin jurisdicción válida.',()=>refuses(()=>prepare({...draft,jurisdictionCode:''}),e=>e.field==='jurisdictionCode'));
  check('El comprobante coincide con el alta que se revisó.',()=>employeeReceipt(receipt,prepare(draft))===receipt);
  check('Un comprobante de otro legajo no confirma ese alta.',()=>refuses(()=>employeeReceipt({...receipt,legajo:'900000002'},prepare(draft)),code('NATIVE_EMPLOYEE_CONTRACT_INVALID')));
}
function testTermination(check) {
  const contractId=uid(10), proposalId=uid(11), key=uid(12);
  const intervals=[{startDate:'2029-11-01',endDate:null}];
  const subject={contractId,legajo:'900000003',employeeName:'PERSONA DE ENSAYO',identityToken:hash('e'),sourceCutoff:null,origin:'MUNICONTROL',registrationId:uid(13),registeredAt:'2029-11-01T12:00:00Z'};
  const boot={version:LIFECYCLE_VERSION,scopeVersion:hash('d'),subject,employment:{version:hash('a'),revision:0,appliedAt:null,intervals,today:cycleDay,status:lifecycleActivity(intervals,cycleDay)},permissions:{canPropose:false,canReview:true},proposals:[],historyTruncated:false};
  const proposal={id:proposalId,contractId,subject:structuredClone(subject),status:'pending',movement:'terminate',date:cycleDay,reason:'Solicitud ficticia de homologación',legalReference:'Constancia ficticia de homologación',createdAt:'2030-01-15T12:00:00Z',authorLabel:'PREPARACIÓN DE ENSAYO',baseVersion:boot.employment.version,canReview:true,before:{intervals},after:{intervals:lifecycleAfter(intervals,'terminate',cycleDay)},review:null};
  const body={operation:'review',payload:{contractId,proposalId,scopeVersion:boot.scopeVersion,decision:'approve',reason:'Revisión exclusivamente de ensayo'}};
  const attempt=reviewedLifecycleAttempt(body,boot,proposal,key);
  check('El reintento conserva la misma solicitud y la misma referencia.',()=>{const x=assertLifecycleAttemptFresh(attempt,boot,proposal); return x.key===key&&x.bytes===JSON.stringify(body);});
  check('Cambiar el ámbito después de revisar impide enviar.',()=>refuses(()=>assertLifecycleAttemptFresh(attempt,{...boot,scopeVersion:hash('f')},proposal),code('REVIEW_CHANGED')));
  check('Sustituir el respaldo de la propuesta obliga a revisarla otra vez.',()=>refuses(()=>assertLifecycleAttemptFresh(attempt,boot,{...proposal,legalReference:'Otra constancia de ensayo'}),code('REVIEW_CHANGED')));
  check('Una propuesta no revisable por el actor no produce un intento.',()=>refuses(()=>reviewedLifecycleAttempt(body,boot,{...proposal,canReview:false},key),code('RESPONSE_INVALID')));
}
function novelty() {
  const subject={contractId:uid(21),registrationId:uid(22),origin:'MUNICONTROL',sourceCutoff:null,identityToken:hash('a'),legajo:'QA-SIN-PERSONA',employeeName:null,registeredAt:'2030-01-01T00:00:00Z'};
  const line={rowOrdinal:1,legajo:subject.legajo,contractId:subject.contractId,identityToken:subject.identityToken,conceptSourceId:'909',costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:null,amountCents:'0',movementType:null,legalInstrument:null,observation:null,forced:false};
  const cmd={command:'prepare',periodMonth:'2030-01-01',payrollType:'monthly',reviewConfirmed:true,rows:[line]};
  const boot={version:'own-payroll-novelty-bootstrap.v1',complete:true,subjects:[subject],batches:[],permissions:{canPrepare:true,canApprove:false}};
  return {boot,cmd,line};
}
function testNoveltyPreparation(check) {
  const {boot,cmd,line}=novelty();
  check('El importe cero explícito se conserva como fila informada.',()=>prepareOwnNoveltyReview(boot,cmd).rows[0].values.amountCents==='0');
  check('Una fila sin cantidad ni importe no se convierte a cero.',()=>refuses(()=>prepareOwnNoveltyReview(boot,{...cmd,rows:[{...line,amountCents:null}]}),code('OWN_NOVELTY_INPUT_INVALID')));
  check('Se rechaza una fila si cambió la identidad del legajo.',()=>refuses(()=>prepareOwnNoveltyReview(boot,{...cmd,rows:[{...line,identityToken:hash('d')}]}),code('OWN_NOVELTY_IDENTITY_CHANGED')));
  check('Una sesión sin permiso de preparación no prepara el lote.',()=>refuses(()=>prepareOwnNoveltyReview({...boot,permissions:{canPrepare:false,canApprove:true}},cmd),code('OWN_NOVELTY_FORBIDDEN')));
}
function testNoveltyReview(check) {
  const {boot,cmd}=novelty(), row=prepareOwnNoveltyReview(boot,cmd).rows[0];
  const maker={membershipId:uid(30),personId:uid(31)}, r1={membershipId:uid(32),personId:uid(33)}, r2={membershipId:uid(34),personId:uid(35)};
  const batch={version:'own-payroll-novelty-batch.v1',id:uid(36),revision:3,status:'approved',periodMonth:cmd.periodMonth,payrollType:cmd.payrollType,rows:[row],rowCount:1,rowsSha256:hash('b'),preparedBy:maker,decidedBy:r1,approvals:[r1],grhMutation:false,payrollCalculated:false,payrollPosted:false};
  const bad=code('OWN_NOVELTY_CONTRACT_INVALID');
  check('El modelo admite un lote ordinario revisado por una persona distinta.',()=>ownNoveltyBatch(batch).status==='approved');
  check('Una membresía diferente de la misma persona no basta para revisar.',()=>{const same={...r1,personId:maker.personId};return refuses(()=>ownNoveltyBatch({...batch,approvals:[same],decidedBy:same}),bad);});
  const forced={...batch,rows:[{...row,values:{...row.values,forced:true,observation:'Importe forzado de ensayo'}}]};
  check('Un solo revisor no satisface el control de importe forzado.',()=>refuses(()=>ownNoveltyBatch(forced),bad));
  check('El comprobante de importe forzado admite dos revisores independientes.',()=>ownNoveltyBatch({...forced,approvals:[r1,r2],decidedBy:r2}).approvals.length===2);
}
function calculationInput() {
  const rules=['remuneration','deduction'].map((nature,i)=>({code:String(901+i),nature,unit:'money',agreementCode:'99',validFrom:'2030-01',validUntil:'2030-01',liquidationTypes:['monthly'],ruleReference:'Regla ficticia de homologación',rounding:{mode:'exact',precision:2},expression:{op:'input',unit:'money',key:i?'retencionQA':'haberQA'}}));
  const inputs=['100.10','3.25'].map((value,i)=>({key:i?'retencionQA':'haberQA',unit:'money',value,sourceReference:'Entrada ficticia de homologación'}));
  const input={version:'own-payroll-input.v2',period:'2030-01',liquidationType:'monthly',selection:{kind:'all',values:[]},populationComplete:true,totalsPrecision:2,sourceVersions:{population:hash('1'),rules:hash('2'),novelties:hash('3')},employees:[{contractId:uid(41),employeeNumber:'QA-MOTOR',agreementCode:'99',departmentCode:'9',inputs}],rules};
  return input;
}
function testCalculation(check) {
  const input=calculationInput(), inputs=input.employees[0].inputs;
  check('Dos renglones de ensayo arrojan 100,10 bruto y 96,85 neto.',()=>{const result=calculateOwnPayroll(input), t=result.employeeTotals[0];return result.rowCount===2&&t.gross==='100.10'&&t.net==='96.85'&&result.paymentExecuted===false&&result.payrollPosted===false;});
  check('La vigencia vencida bloquea el cálculo, sin resultados de otro mes.',()=>refuses(()=>calculateOwnPayroll({...input,period:'2030-02'}),code('PAY_RULE_MISSING')));
  check('Un monto necesario sin informar no se trata como cero.',()=>refuses(()=>calculateOwnPayroll({...input,employees:[{...input.employees[0],inputs:inputs.map(i=>({...i,value:null}))}]}),code('INPUT_MISSING')));
}
function testLiquidation(check) {
  const selection={kind:'contracts',values:[uid(51)]};
  const cmd={runId:uid(52),resultSha256:hash('1'),scopeVersion:hash('2'),stateVersion:hash('3'),command:'confirm',selection,reason:'Confirmación ficticia de homologación',reviewConfirmed:true};
  check('La confirmación individual conserva exactamente un contrato.',()=>ownLiquidationCommand(cmd).selection.values.length===1);
  check('El comando de anulación conserva el motivo y su alcance individual.',()=>{const a=ownLiquidationCommand({...cmd,command:'annul',reason:'Anulación ficticia por corrección'});return a.reason==='Anulación ficticia por corrección'&&a.selection.values[0]===uid(51);});
  check('Una decisión sin revisión expresa es rechazada.',()=>refuses(()=>ownLiquidationCommand({...cmd,reviewConfirmed:false}),e=>e instanceof Error));
  check('Una anulación sin motivo es rechazada.',()=>refuses(()=>ownLiquidationCommand({...cmd,command:'annul',reason:''}),e=>e instanceof Error));
}
function testClosure(check) {
  const cmd={period:'2030-01',liquidationType:'monthly',scopeVersion:hash('a'),stateVersion:hash('b'),selection:{kind:'all',values:[]},command:'close',groupId:null,reason:'Cierre ficticio de homologación',reviewConfirmed:true};
  const bad=code('CLOSE_CONTRACT_INVALID');
  check('Se valida un comando de cierre de la población completa.',()=>ownCloseCommand(cmd).selection.kind==='all');
  check('La reapertura debe indicar el grupo cerrado.',()=>refuses(()=>ownCloseCommand({...cmd,command:'reopen'}),bad));
  check('No se admite reabrir sólo una porción del grupo.',()=>refuses(()=>ownCloseCommand({...cmd,command:'reopen',groupId:uid(61),selection:{kind:'contracts',values:[uid(62)]}}),bad));
  check('Se valida el comando de reapertura con grupo y motivo.',()=>ownCloseCommand({...cmd,command:'reopen',groupId:uid(61)}).groupId===uid(61));
}

// Validate the proposed change to the practice ledger, never an official event. The caller binds
// the real owner/lease and serializes the state transition separately. Actors below are fixed
// fixture roles, not authenticated users or evidence of independent municipal approval.
export function validatePracticeNovelty(step, amount) {
  try {
    if (!['draft','approve','reject'].includes(step) || typeof amount!=='string' ||
        !/^(?:0|[1-9][0-9]{0,15})\.[0-9]{2}$/.test(amount)) throw new Error();
    const cents=BigInt(amount.replace('.','')).toString();
    const {boot,cmd,line}=novelty();
    const prepared=prepareOwnNoveltyReview(boot,{...cmd,rows:[{...line,amountCents:cents}]});
    if (prepared.rows[0].values.amountCents!==cents) throw new Error();
    const maker={membershipId:uid(70),personId:uid(71)},reviewer={membershipId:uid(72),personId:uid(73)};
    const batchId=uid(74), key=uid(75);
    const body=step==='draft' ? prepared.body : ownNoveltyCommand({command:step,batchId,expectedRevision:2,
      reasonReference:step==='reject'?'ref:'+uid(76):null,reviewConfirmed:true});
    const snapshot={version:'own-payroll-novelty-batch.v1',id:batchId,revision:step==='draft'?1:3,
      status:{draft:'draft',approve:'approved',reject:'rejected'}[step],periodMonth:cmd.periodMonth,payrollType:cmd.payrollType,
      rows:prepared.rows,rowCount:1,rowsSha256:hash('b'),preparedBy:maker,decidedBy:step==='draft'?null:reviewer,
      approvals:step==='approve'?[reviewer]:[],grhMutation:false,payrollCalculated:false,payrollPosted:false};
    // The published parser checks shape, content, persons, versions and command/receipt matching.
    // Synthetic hash-shaped fields below model the wire contract only; this is not cryptographic attestation.
    const receipt=ownNoveltyReceipt({version:'own-payroll-novelty-receipt.v1',requestKey:key,
      requestSha256:hash('c'),body,snapshot,replayed:false},{key,body});
    if (receipt.snapshot.rows[0].values.amountCents!==cents) throw new Error();
    return true;
  } catch {
    throw Object.assign(new Error('El paso o el importe de la novedad de ensayo no es válido.'),{code:'QA_PRACTICE_INPUT'});
  }
}

function testChange(check) {
  const contractId=uid(80), subject={contractId,legajo:'900000004',employeeName:'PERSONA DE ENSAYO',identityToken:hash('a'),sourceCutoff:null,origin:'MUNICONTROL',registrationId:uid(81),registeredAt:'2030-01-01T12:00:00Z'};
  const before={agreementCode:'99',categoryCode:'991',organizationId:'999',sectorCode:'998',jobTitle:'Cargo de origen QA'};
  const items=[['agreements','99','Convenio de ensayo'],['categories','991','Categoría de ensayo'],['organizations','999','Repartición de ensayo'],['sectors','998','Sector de ensayo']].map(([kind,c,label])=>({kind,key:kind+':'+c,code:c,label,agreementCode:kind==='categories'?'99':null}));
  const boot={version:'native-employment-change.v1',scopeVersion:hash('b'),subject,
    employment:{values:before,labels:{agreementName:items[0].label,categoryName:items[1].label,organizationName:items[2].label,sectorName:items[3].label},version:hash('c'),revision:0,appliedAt:null},
    catalog:{items,version:hash('d'),origin:'MUNICONTROL',revision:1,publishedAt:'2030-01-01T12:00:00Z'},permissions:{canPropose:true,canReview:false},proposals:[],historyTruncated:false};
  const values={...before,jobTitle:'Cargo corregido de ensayo'}, body={operation:'propose',payload:{contractId,identityToken:subject.identityToken,scopeVersion:boot.scopeVersion,baseVersion:boot.employment.version,catalogVersion:boot.catalog.version,values,legalReference:'Respaldo ficticio de ensayo',reason:'Modificar sólo el cargo en este ensayo'}};
  const make=b=>reviewedChangeAttempt(b,boot,null,uid(82));
  const attempt=make(body);
  check('La comparación de la ficha identifica únicamente el cargo que se modificó.',()=>{const d=changeDiff(before,values);return d.length===1&&d[0].field==='jobTitle'&&d[0].before===before.jobTitle&&d[0].after===values.jobTitle;});
  check('Las opciones de catálogo se verifican antes de proponer.',()=>refuses(()=>make({...body,payload:{...body.payload,values:{...values,categoryCode:'992'}}}),code('RESPONSE_INVALID')));
  check('La rectificación no puede enviarse si entretanto cambió la versión laboral.',()=>refuses(()=>assertChangeAttemptFresh(attempt,{...boot,employment:{...boot.employment,version:hash('e')}},null),code('REVIEW_CHANGED')));
  const receipt={version:boot.version,operation:'propose',contractId,proposalId:uid(83),status:'pending',employmentVersion:boot.employment.version,revision:0,replayed:false,payrollModified:false};
  check('El comprobante de propuesta no se acepta como una aprobación automática.',()=>validateChangeReceipt(receipt,contractId).status==='pending'&&refuses(()=>validateChangeReceipt({...receipt,status:'approved',revision:1},contractId),code('CONTRACT_INVALID')));
}
function syntheticCapture() {
  const input=calculationInput(), e=input.employees[0], digest=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
  input.employees=[{...e,employeeNumber:'007'},{...e,contractId:uid(42),employeeNumber:'7',inputs:e.inputs.map((v,i)=>({...v,value:i?'0.01':'1.05'}))}];
  const canonical=normalizeOwnPayrollInput(input), result=calculateOwnPayroll(canonical);
  const {period,liquidationType,selection}=canonical;
  const definition={namespaceVersion:'own-payroll-namespaces.v2',rules:canonical.rules,bindings:[],totalsPrecision:2}, programVersion=digest(definition);
  const body={period,liquidationType,selection,scopeVersion:hash('f'),programVersion,populationDomain:'native_registered'};
  const payload={period,liquidationType,selection,programState:{program:{definition,version:programVersion}},population:{employees:canonical.employees},monthly:[],fixed:[],sourceInventory:{populationDomain:'native_registered'}};
  const id=uid(85),algorithmSha256=hash('a'),recordedAt='2030-01-15T12:00:00Z';
  return {version:'own-payroll-run.v1',id,key:uid(86),body,bodySha256:digest(body),algorithmSha256,payload,payloadSha256:digest(payload),createdAt:recordedAt,replayed:false,
    saved:{version:'own-payroll-saved.v1',id,algorithmSha256,inputSha256:digest(canonical),resultSha256:digest(result),input:canonical,result,recordedAt}};
}
function testReport(check) {
  // This uses the calculation-detail CSV exporter, not receipts or a closed-period payroll report.
  const capture=syntheticCapture(), csv=ownRunWorkspaceCsv(capture);
  const lines=csv.replace(/^\uFEFF/,'').trimEnd().split('\r\n'), cells=line=>line.slice(1,-1).split('";"');
  const rows=lines.slice(1).map(cells);
  check('El CSV incluye el encabezado y los cuatro renglones calculados.',()=>csv.charCodeAt(0)===0xfeff&&lines.length===5&&cells(lines[0])[3]==='Legajo'&&cells(lines[0])[9]==='Valor calculado');
  check('El exportador conserva como texto los legajos 007 y 7 por separado.',()=>new Set(rows.map(r=>r[3])).size===2&&rows.filter(r=>r[3]==="'007").length===2&&rows.filter(r=>r[3]==="'7").length===2);
  check('Los importes del CSV concilian con cada concepto sin perder centavos.',()=>{const expected=new Map([["'007|'901",'100.10'],["'007|'902",'3.25'],["'7|'901",'1.05'],["'7|'902",'0.01']]);return rows.every(r=>expected.get(r[3]+'|'+r[6])===r[9])&&new Set(rows.map(r=>r[3]+'|'+r[6])).size===4;});
  check('Una captura con detalle incompleto no genera un CSV parcial.',()=>{const bad=structuredClone(capture);bad.saved.result.rows.pop();bad.saved.result.rowCount--;return refuses(()=>ownRunWorkspaceCsv(bad),e=>e instanceof Error);});
}
