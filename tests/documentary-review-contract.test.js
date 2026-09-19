import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {DOCUMENTARY_FILTERS,documentaryInput,verifyDocumentaryReview,documentaryReference} from '../assets/legal-documentary-review.js';
const flags=()=>Object.fromEntries(Object.keys(DOCUMENTARY_FILTERS).filter(k=>k!=='all').map(k=>[k,false]));
const row=()=>({id:'11111111-1111-4111-8111-111111111111',kind:'ordenanza',issuer:'HCD',number:'9999',year:1990,version:1,title:'Norma de ensayo',flags:flags()});
const data=()=>({version:'legal-documentary-review.v1',filter:'all',page:1,pageSize:25,total:1,summary:{all:1,...flags()},rows:[row()],observedAt:'2026-09-18T23:00:00Z',legalConclusion:false});
function sample(){const d=data();for(const k of Object.keys(d.summary))d.summary[k]=k==='all'?1:0;return d;}
test('verified documentary review preserves counts and version reference',()=>{const d=sample();assert.equal(verifyDocumentaryReview(d),d);assert.equal(documentaryReference(d.rows[0]),'/juridica?norma=11111111-1111-4111-8111-111111111111&version=1');});
test('empty dataset remains empty, with zero counts',()=>{const d=sample();d.total=0;d.summary.all=0;d.rows=[];assert.equal(verifyDocumentaryReview(d).rows.length,0);});
test('categories may overlap without being added as distinct norms',()=>{const d=sample();d.summary.no_articles=1;d.summary.no_topics=1;d.rows[0].flags.no_articles=true;d.rows[0].flags.no_topics=true;assert.equal(verifyDocumentaryReview(d).summary.all,1);});
test('invalid filters, implicit numbers and out-of-range pages are rejected',()=>{for(const [f,p] of [['unknown',1],['__proto__',1],['all',0],['all',201],['all','1'],[null,1]])assert.throws(()=>documentaryInput(f,p));});
test('malformed responses and legal conclusions fail closed',()=>{for(const patch of [{legalConclusion:true},{version:'other'},{observedAt:'invalid'},{pageSize:100},{total:0}])assert.throws(()=>verifyDocumentaryReview({...sample(),...patch}));});
test('duplicate IDs, missing rows and wrong filters are rejected',()=>{
 const d=sample();d.total=d.summary.all=2;d.rows.push(structuredClone(d.rows[0]));assert.throws(()=>verifyDocumentaryReview(d));
 const e=sample();e.rows=[];assert.throws(()=>verifyDocumentaryReview(e));const f=sample();f.filter='projects';f.summary.projects=1;assert.throws(()=>verifyDocumentaryReview(f));
});
test('out-of-scope counts and unverified flag types cannot pass',()=>{const d=sample();d.summary.no_articles=2;assert.throws(()=>verifyDocumentaryReview(d));const e=sample();e.rows[0].flags.projects='false';assert.throws(()=>verifyDocumentaryReview(e));});
test('reference generation rejects arbitrary IDs or versions',()=>{for(const patch of [{id:'external'},{version:0},{version:1001}])assert.throws(()=>documentaryReference({...row(),...patch}));});
test('SQL only reads latest tenant-scoped revisions and invokes existing authorization',()=>{
 const sql=fs.readFileSync('scripts/migrations/078-legal-documentary-review.sql','utf8');assert.match(sql,/ctx:=legal_norm_context_v1\(p,false\)/);assert.match(sql,/WHERE n\.tenant_id=t/);assert.match(sql,/r\.version=n\.current_version/);assert.match(sql,/LIMIT 25 OFFSET/);
 const body=sql.split('AS $$')[1].split('END $$;')[0];assert.doesNotMatch(body,/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);assert.match(sql,/GRANT EXECUTE ON FUNCTION/);
});
