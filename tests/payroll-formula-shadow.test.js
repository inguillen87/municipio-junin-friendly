import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateShadow,roundShadow,compareShadow} from '../scripts/lib/payroll-formula-shadow.mjs';
import {canonicalAst,parsePostfix} from '../scripts/audit-payroll-formula-inventory.mjs';
import {analyzeFormula} from '../assets/payroll-formula-linter.js';
const ast=text=>canonicalAst(analyzeFormula(text).ast);
const value=(text,inputs)=>evaluateShadow(ast(text),inputs).result;
const n=text=>['number',text],ref=code=>['reference','A',code],binary=(op,a,b)=>['binary',op,a,b];
const rounding=(text,places,mode)=>roundShadow(ast(text),{},{places,mode}).value;
test('raw decimal arithmetic stays exact, including beyond Number safe integers',()=>{
 assert.deepEqual(value('0.1 + 0.2'),{kind:'rational',numerator:'3',denominator:'10'});
 assert.equal(value('9007199254740993 + 2').numerator,'9007199254740995');
 assert.deepEqual(value('(1 / 3) * 3'),{kind:'rational',numerator:'1',denominator:'1'});
});
for(const [text,away,even,trunc] of [['1.005','1.01','1.00','1.00'],['-1.005','-1.01','-1.00','-1.00'],['1.015','1.02','1.02','1.01'],['-0.001','0.00','0.00','0.00']])test(`explicit rounding ${text}`,()=>{
 assert.equal(rounding(text,2,'half_away_from_zero'),away);assert.equal(rounding(text,2,'half_even'),even);assert.equal(rounding(text,2,'toward_zero'),trunc);
});
test('rounding is not smuggled into intermediate operations',()=>assert.equal(rounding('(1 / 3) * 3',2,'half_away_from_zero'),'1.00'));
test('rounding mode and scale are mandatory',()=>{
 for(const options of [{},{places:2},{places:2,mode:'guess'},{places:-1,mode:'half_even'},{places:7,mode:'half_even'}])assert.throws(()=>roundShadow(n('1'),{},options),/ROUNDING_REQUIRED/);
});
for(const bad of [null,undefined,0,0.1,NaN,Infinity,'','1e3','1,00',' 1','1.','x'])test(`invalid input never becomes zero ${String(bad)}`,()=>assert.throws(()=>evaluateShadow(ref('1'),{'A[1]':bad}),/DECIMAL_INPUT/));
test('missing dependency is not zero and family namespaces stay distinct',()=>{
 assert.throws(()=>evaluateShadow(ref('1'),{}),/MISSING_INPUT/);
 assert.equal(evaluateShadow(ref('1'),{'A[1]':'0'}).result.numerator,'0');
 assert.throws(()=>evaluateShadow(ref('1'),{'R[1]':'3'}),/UNEXPECTED_INPUT/);
});
test('invalid input bags cannot run getters or carry authority fields',()=>{
 const bag={};Object.defineProperty(bag,'A[1]',{get(){throw new Error('PRIVATE_VALUE');}});
 for(const input of [null,[],new Map(),bag,{'tenantId':'x'},{'A[1]':'1',salary:'2'}])assert.throws(()=>evaluateShadow(ref('1'),input),/FORMULA_SHADOW_(INPUTS_INVALID|UNEXPECTED_INPUT)/);
});
test('zero divisors stop with safe error, rational sign is canonical',()=>{
 assert.throws(()=>value('1 / A[1]',{'A[1]':'0'}),/ZERO_DENOMINATOR/);
 assert.deepEqual(value('1 / -2'),{kind:'rational',numerator:'-1',denominator:'2'});
});
test('booleans are typed; numeric truthiness is not an assumed GRH convention',()=>{
 assert.equal(value('(1 < 2) AND (2 <= 2)').value,true);
 assert.throws(()=>value('1 AND 2'),/BOOLEAN_REQUIRED/);assert.throws(()=>value('(1 < 2) + 3'),/NUMBER_REQUIRED/);
});
test('short circuit is explicit laboratory semantics, without assuming missing equals zero',()=>{
 const r=evaluateShadow(ast('(1 == 2) AND (A[1] > 0)'),{});
 assert.equal(r.result.value,false);assert.deepEqual(r.readReferences,[]);assert.equal(r.grhEquivalenceVerified,false);
 assert.throws(()=>value('(1 == 1) AND (A[1] > 0)'),/MISSING_INPUT/);
});
for(const op of ['^','%','eval','execute'])test(`unsupported operator ${op} remains closed even in skipped branch`,()=>{
 assert.throws(()=>evaluateShadow(binary('&&',binary('==',n('1'),n('2')),binary(op,n('1'),n('2')))),/UNSUPPORTED_OPERATOR/);
});
test('AST depth, shape and arithmetic budgets are enforced before unbounded execution',()=>{
 let deep=n('1');for(let i=0;i<33;i++)deep=['unary','+',deep];assert.throws(()=>evaluateShadow(deep),/AST_LIMIT/);
 const cyclic=['unary','+'];cyclic.push(cyclic);assert.throws(()=>evaluateShadow(cyclic),/AST_LIMIT/);
 for(const bad of [null,{},['number','1','extra'],['reference','X','1']])assert.throws(()=>evaluateShadow(bad),/AST_INVALID|REFERENCE_INVALID/);
 assert.throws(()=>evaluateShadow(binary('*',n('9'.repeat(60)),n('9'.repeat(60)))),/ARITHMETIC_LIMIT/);
 assert.throws(()=>evaluateShadow(n('0.'+'1'.repeat(49))),/DECIMAL_LIMIT/);
});
test('all comparison operators have exact signed numeric semantics',()=>{
 for(const [op,want] of [['==',false],['!=',true],['<',true],['<=',true],['>',false],['>=',false]])assert.equal(evaluateShadow(binary(op,n('-1'),n('0'))).result.value,want);
 assert.equal(evaluateShadow(['unary','!',binary('==',n('1'),n('2'))]).result.value,true);
});
test('one differential witness is explicit; a finite matching sample never proves equivalence',()=>{
 const lhs=ast('A[1] + 1'),rhs=ast('A[1] * 2');
 assert.equal(compareShadow(lhs,rhs,[{'A[1]':'1'}]).status,'no_counterexample_in_probes');
 const result=compareShadow(lhs,rhs,[{'A[1]':'1'},{'A[1]':'2'}]);assert.equal(result.status,'counterexample_found');
 assert.equal(result.payrollExecutionAllowed,false);assert.equal(result.grhEquivalenceVerified,false);
});
test('postfix and infix use the same raw-number path without guessing expression authority',()=>{
 const lhs=ast('A[1] + 1'),rhs=canonicalAst(parsePostfix('A[1] 2 +'));
 const result=compareShadow(lhs,rhs,[{'A[1]':'100'}]);assert.equal(result.status,'counterexample_found');
 assert.equal(result.cases[0].left.result.numerator,'101');assert.equal(result.cases[0].right.result.numerator,'102');
});
test('failed probes remain indeterminate, with no private input values in errors',()=>{
 const result=compareShadow(ref('1'),n('2'),[{}, {'A[1]':'PRIVATE_MARKER'}]);
 assert.equal(result.status,'inconclusive');assert.equal(JSON.stringify(result).includes('PRIVATE_MARKER'),false);
 for(const probes of [[],null,Array(129).fill({})])assert.throws(()=>compareShadow(n('1'),n('2'),probes),/PROBES_INVALID/);
});
test('frozen caller values are never mutated; outputs clearly deny live authority',()=>{
 const node=Object.freeze(['reference','A','1']),inputs=Object.freeze({'A[1]':'1.20'});
 const before=JSON.stringify([node,inputs]);const r=evaluateShadow(node,inputs);assert.equal(JSON.stringify([node,inputs]),before);assert(Object.isFrozen(r.result));
});
test('module has no network, filesystem, process, database, dynamic evaluator or browser side effects',()=>{
 const source=fs.readFileSync(new URL('../scripts/lib/payroll-formula-shadow.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|document|window|process|eval)\s*[.(]|new\s+Function|node:|\.query\s*\(/);
});
