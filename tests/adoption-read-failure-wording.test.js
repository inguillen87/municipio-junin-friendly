import test from 'node:test';
import assert from 'node:assert/strict';
import {principal,session,attemptKey} from './fixtures/employment-adoption-preparation-synthetic.js';
import {municipalAdoptionOperation,municipalAdoptionError} from '../lib/internal-municipal-adoption.js';
import {adoptionPreparationError,adoptionPreparationOperation,adoptionReadOperation,ADOPTION_READ_UNAVAILABLE} from '../lib/internal-employment-adoption.js';

const failing={query:async()=>{throw Object.assign(new Error('connection terminated unexpectedly · detalle interno'),{code:'08006'});}};
const empty={query:async()=>[]};
const sent=/No se confirmó (?:la|una) propuesta/;

test('una consulta que falla dice que no se envió nada y que hay que volver a consultar, sin hablar de propuestas ni intentos',async()=>{
 for(const operation of['prepared-sources','mixed-sources','final-sources','bootstrap']){
  for(const sql of[failing,empty]){
   const error=await adoptionPreparationOperation(sql,principal,session,operation,{}).then(()=>null,e=>e);
   assert.equal(error?.name,'AdoptionPreparationError',operation);assert.equal(error.status,503,operation);
   assert.equal(error.message,ADOPTION_READ_UNAVAILABLE,operation);
   assert.doesNotMatch(error.message,/propuesta|intento|detalle interno|connection/i,operation);
   assert.match(error.message,/No se envió ni se cambió nada/);assert.match(error.message,/volvé a consultar/);
  }
 }
});

test('el envío y la consulta de un intento conservan su mensaje: ahí sí puede existir un intento que hay que consultar',async()=>{
 assert.equal(adoptionReadOperation('propose'),false);assert.equal(adoptionReadOperation('attempt'),false);
 for(const operation of['prepared-sources','mixed-sources','final-sources','bootstrap','mixed-bootstrap','operational-bootstrap','registry-bootstrap','final-bootstrap','final-active-bootstrap','preview-declarations'])assert.equal(adoptionReadOperation(operation),true,operation);
 const lookup=await adoptionPreparationOperation(failing,principal,session,'attempt',{key:attemptKey}).then(()=>null,e=>e);
 assert.equal(lookup?.status,503);assert.match(lookup.message,sent);assert.match(lookup.message,/Consultá el mismo intento/);
 const emptyLookup=await adoptionPreparationOperation(empty,principal,session,'attempt',{key:attemptKey}).then(()=>null,e=>e);
 assert.equal(emptyLookup?.status,503);assert.match(emptyLookup.message,sent);
 assert.match(adoptionPreparationError(new Error('fallo desconocido')).message,sent);
 assert.equal(adoptionPreparationError(new Error('fallo desconocido'),{reading:true}).message,ADOPTION_READ_UNAVAILABLE);
});

test('los motivos conocidos conservan su texto también en una consulta',()=>{
 const busy=adoptionPreparationError(Object.assign(new Error('x'),{code:'55P03'}),{reading:true});
 assert.equal(busy.status,409);assert.notEqual(busy.message,ADOPTION_READ_UNAVAILABLE);
 const session=adoptionPreparationError(new Error('ACTION_SESSION_INVALID'),{reading:true});
 assert.equal(session.status,401);assert.match(session.message,/sesión venció/);
});

test('la bandeja y la revisión del operador de padrón son consultas: su falla tampoco habla de una decisión ni de un intento',async()=>{
 const reviewer={...principal,tenant:{...principal.tenant,effectiveCapabilities:['workforce.employee.read','employee.record.approve']}};
 for(const[operation,input]of[['queue',{}],['review',{id:attemptKey}]])for(const sql of[failing,empty]){
  const error=await municipalAdoptionOperation(sql,reviewer,session,operation,input).then(()=>null,e=>e);
  assert.equal(error?.status,503,operation);assert.equal(error.message,ADOPTION_READ_UNAVAILABLE,operation);
 }
 const lookup=await municipalAdoptionOperation(failing,reviewer,session,'attempt',{key:attemptKey}).then(()=>null,e=>e);
 assert.equal(lookup?.status,503);assert.match(lookup.message,/No se confirmó la decisión\. Consultá el mismo intento/);
 const emptyLookup=await municipalAdoptionOperation(empty,reviewer,session,'attempt',{key:attemptKey}).then(()=>null,e=>e);
 assert.match(emptyLookup.message,/No se confirmó una decisión completa/);
 assert.match(municipalAdoptionError(new Error('fallo desconocido')).message,/No se confirmó la decisión/);
});
