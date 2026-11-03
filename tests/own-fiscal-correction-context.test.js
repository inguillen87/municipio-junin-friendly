import test from 'node:test';
import assert from 'node:assert/strict';
import {ownFiscalCorrectionTarget,ownFiscalCorrectionReview} from '../assets/own-fiscal-correction-context.js';
const contractId='aaaaaaaa-0000-4000-8000-000000000001';
const params=()=>({period:'2026-10',presentationDate:'2026-11-30',types:['monthly','supplementary'],jurisdiction:'42'});
const target=()=>({contractId,params:params(),accessKey:'synthetic-session-and-tenant-scope'});
test('correction retains exact reviewed period/date/types/jurisdiction and detaches mutable caller data',()=>{
 const source=target(),context=ownFiscalCorrectionTarget(source);source.params.period='2026-11';source.params.types.pop();source.contractId='bbbbbbbb-0000-4000-8000-000000000001';
 assert.equal(context.contractId,contractId);assert.deepEqual(context.params,params());assert.ok(Object.isFrozen(context)&&Object.isFrozen(context.params)&&Object.isFrozen(context.params.types));assert.throws(()=>context.params.types.push('final'));
});
test('return contains the whole original preparation scope but carries no contract identity or fiscal data',()=>{
 const source=target(),context=ownFiscalCorrectionReview({params:source.params,accessKey:source.accessKey});source.params.jurisdiction='55';
 assert.deepEqual(context.params,params());assert.deepEqual(Object.keys(context).sort(),['accessKey','params']);assert.ok(!Object.hasOwn(context,'contractId'));assert.equal(context.accessKey,'synthetic-session-and-tenant-scope');
});
test('open event/URL-shaped payloads, names, literals, permission assertions and partial preparation scopes cannot become a correction target',()=>{
 for(const value of [{...target(),employeeNumber:'SYNTHETIC-001'},{...target(),name:'Synthetic name'},{...target(),approved:true},{detail:target()},{url:'?contractId='+contractId},{...target(),params:{period:'2026-10'}},{...target(),contractId:'all'},{...target(),accessKey:''},{...target(),accessKey:42}])assert.throws(()=>ownFiscalCorrectionTarget(value));
});
test('no unauthorized jurisdiction, missing types or caller-provided fiscal values are accepted on return',()=>{
 for(const p of [{...params(),jurisdiction:'General'},{...params(),types:[]},{...params(),types:['monthly','monthly']},{...params(),period:'2026-13'},{...params(),presentationDate:'2026-02-30'},{...params(),fiscalFields:{3:'0'}}])assert.throws(()=>ownFiscalCorrectionReview({params:p,accessKey:'scope'}));
 assert.throws(()=>ownFiscalCorrectionReview({...target()}));assert.throws(()=>ownFiscalCorrectionReview({params:params(),accessKey:'scope',canRead:true}));
});
test('current all/42/55 and explicit complete type choices survive without deriving fiscal populations or dates',()=>{
 for(const jurisdiction of ['all','42','55']){const p={...params(),jurisdiction,types:['monthly','final','vacation'],presentationDate:'2026-12-01'},context=ownFiscalCorrectionReview({params:p,accessKey:'scope'});assert.equal(context.params.presentationDate,p.presentationDate);assert.equal(context.params.jurisdiction,jurisdiction);assert.deepEqual(new Set(context.params.types),new Set(p.types));}
});
