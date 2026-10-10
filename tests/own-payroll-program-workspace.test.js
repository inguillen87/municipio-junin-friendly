import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {bootstrap,program,command,uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {PROGRAM_OPERATIONS,programWorkspaceAttempt,verifiedProgramWorkspaceReceipt,prepareProgramWorkspace,decideProgramWorkspace,programWorkspaceChanges,describeProgramExpression,expressionSize,changeExpressionOperation,programWorkspaceAccess} from '../assets/own-payroll-program-workspace-model.js';
import {ownProgramStructure} from '../assets/own-payroll-program-model.js';
import {lit,fact,ref,binary,rule} from './fixtures/own-payroll-synthetic.js';
import {exactProgram} from './fixtures/own-payroll-exact-program-synthetic.js';
const sha=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
test('la preparación conserva el conjunto, sus versiones y cada fuente sin aprobar ni calcular',()=>{
 const boot=bootstrap(),body=prepareProgramWorkspace(boot,exactProgram(),'Fundamento sintético completo');assert.deepEqual(body.program,exactProgram());assert.equal(body.salaryVersion,boot.salaryCatalog.version);assert.equal(body.reviewConfirmed,false);assert.equal(body.proposalId,null);
 const view=programWorkspaceChanges(null,body.program);assert.equal(view.rows.length,8);assert.equal(view.rows.filter(r=>r.kind==='rules').length,6);assert.equal(view.changed,9);
});
test('revisión completa de más de una página conserva también cada regla sin cambios',()=>{
 const base=program(),many=clone(base);many.rules=Array.from({length:70},(_,i)=>rule(String(4000+i),fact('base')));many.bindings=base.bindings.filter(b=>b.key==='base');
 const next=clone(many);next.rules[69].ruleReference='Respaldo sintético revisado';const diff=programWorkspaceChanges(many,next);assert.equal(diff.rows.length,71);assert.equal(diff.rows.filter(r=>r.status==='unchanged').length,70);assert.equal(diff.changed,1);assert.equal(diff.rows[69].after.code,'4069');
});
test('retirar una regla anterior, una fuente ausente o un catálogo vacío bloquea el conjunto',()=>{
 const boot=bootstrap({program:{version:hash('b'),revision:1,definition:program(),salaryVersion:hash('c'),proposalId:uid(81),approvalId:uid(82)}}),draft=program();draft.rules.pop();assert.throws(()=>prepareProgramWorkspace(boot,draft,'Cambio sintético completo'));
 const missing=program();missing.bindings[0].sourceCode='999';assert.throws(()=>prepareProgramWorkspace(bootstrap(),missing,'Cambio sintético completo'));
 assert.throws(()=>prepareProgramWorkspace(bootstrap({salaryCatalog:{version:hash('c'),revision:0,items:[]}}),program(),'Cambio sintético completo'));
});
function reviewBoot(){const p={id:uid(10),requestSha256:hash('d'),baseVersion:hash('b'),salaryVersion:hash('c'),salaryItems:bootstrap().salaryCatalog.items,baseDefinition:null,definition:program(),reason:'Propuesta sintética completa',createdAt:'2026-10-05T10:00:00Z',authorLabel:'Preparador QA',canReview:true,status:'pending',decision:null};return bootstrap({permissions:{canPropose:false,canReview:true},proposals:[p]});}
test('decidir conserva versiones de la propuesta y exige otra persona y confirmación expresa',()=>{
 const boot=reviewBoot(),body=decideProgramWorkspace(boot,uid(10),'approve','Revisión independiente sintética',true);assert.equal(body.program,null);assert.equal(body.proposalSha256,hash('d'));assert.equal(body.reviewConfirmed,true);
 assert.throws(()=>decideProgramWorkspace(boot,uid(10),'approve','Revisión independiente sintética',false));boot.proposals[0].canReview=false;assert.throws(()=>decideProgramWorkspace(boot,uid(10),'reject','Revisión independiente sintética',true));
});
test('base o catálogo posteriores impiden aprobar pero permiten rechazar conservando el historial',()=>{
 const boot=reviewBoot();boot.salaryCatalog.version=hash('e');assert.throws(()=>decideProgramWorkspace(boot,uid(10),'approve','Revisión sintética completa',true));assert.equal(decideProgramWorkspace(boot,uid(10),'reject','Descartar versión desactualizada',true).salaryVersion,hash('c'));
});
test('el intento congelado conserva cuerpo/clave y el comprobante requiere hash exacto',async()=>{
 globalThis.crypto??=webcrypto;const body=command(),attempt=programWorkspaceAttempt(uid(50),body,'sesión QA');body.reason='Otro texto';assert.notEqual(attempt.body.reason,body.reason);assert.throws(()=>{attempt.body.program.rules.pop();});
 const receipt={version:'own-payroll-program.v1',eventId:uid(51),proposalId:uid(51),requestKey:attempt.key,requestSha256:sha(attempt.body),body:attempt.body,status:'pending',revision:0,programVersion:attempt.body.baseVersion,replayed:false,payrollCalculated:false,payrollPosted:false};
 await verifiedProgramWorkspaceReceipt(receipt,attempt);await assert.rejects(verifiedProgramWorkspaceReceipt({...receipt,requestSha256:hash('f')},attempt));await assert.rejects(verifiedProgramWorkspaceReceipt({...receipt,requestKey:uid(52)},attempt));
});
test('todas las operaciones del motor se describen sin texto ejecutable y con unidades/etapas/conversión explícitas',()=>{
 const leaf=lit('1','money'),cases={literal:leaf,input:fact('base'),concept:ref('100','exact'),auxiliary:{op:'auxiliary',code:'88',stage:'exact'},round:{op:'round',value:leaf,rounding:{precision:2,mode:'half_even'}},convert:{op:'convert',value:leaf,unit:'coefficient',factor:'0.01',conversionReference:'Conversión sintética explícita'},compare:{op:'compare',operator:'gt',left:leaf,right:leaf},choose:{op:'choose',condition:{op:'compare',operator:'eq',left:leaf,right:leaf},then:leaf,else:leaf}};
 for(const op of ['add','subtract','multiply','divide','min','max'])cases[op]=binary(op,leaf,leaf);assert.deepEqual(Object.keys(cases).sort(),Object.keys(PROGRAM_OPERATIONS).sort());
 for(const value of Object.values(cases)){assert.ok(describeProgramExpression(value));assert.ok(expressionSize(value).nodes>=1);}
 assert.match(describeProgramExpression(cases.concept),/antes del redondeo/);assert.match(describeProgramExpression(cases.convert),/factor 0.01; respaldo/);
 const switched=changeExpressionOperation(cases.add,'subtract');assert.equal(switched.left,leaf);assert.equal(switched.right,leaf);assert.equal(changeExpressionOperation(leaf,'literal').value,'1');assert.equal(changeExpressionOperation(null,'literal').value,'');
});
test('un árbol demasiado profundo o grande falla globalmente; no se recortan operaciones',()=>{
 let deep=lit('1');for(let i=0;i<34;i++)deep={op:'round',value:deep,rounding:{precision:2,mode:'exact'}};assert.throws(()=>expressionSize(deep));
 const branch=level=>level?binary('add',branch(level-1),branch(level-1)):lit('1');assert.throws(()=>expressionSize(branch(8)));assert.throws(()=>changeExpressionOperation(null,'eval'));
});
test('sesión vencida incluso con HTTP200 no habilita vistas ni decisiones',()=>{
 const auth={ok:true,authenticated:true,sessionVersion:2,user:{id:'qa',email:'qa@example.invalid'},access:{context:'tenant',tenant:{id:uid(1),roleKey:'QA'},tenantCapabilities:['workforce.employee.read','payroll.parameter.read']},expiresAt:'2026-10-05T10:00:00Z'};
 assert.throws(()=>programWorkspaceAccess(auth,Date.parse('2026-10-05T11:00:00Z')));assert.ok(programWorkspaceAccess(auth,Date.parse('2026-10-05T09:00:00Z')).caps.has('payroll.parameter.read'));
});
const clone=v=>structuredClone(v);
