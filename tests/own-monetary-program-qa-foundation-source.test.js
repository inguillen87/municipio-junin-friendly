// Proposed FS/source contracts only. No QA, builder, parser or application import.
// These cases have not been executed and do not prove construction or PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=()=>readFileSync(new URL('../scripts/lib/own-monetary-program-qa-projection.mjs',import.meta.url),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
function section(text,start,end){const begin=text.indexOf(start),finish=text.indexOf(end,begin);assert.ok(begin>=0&&finish>begin);return text.slice(begin,finish);}
function containsAll(text,tokens){for(const token of tokens)assert.ok(text.includes(token),token);}
function optionKeys(text){const match=/const OPTION_KEYS=Object\.freeze\(\[([^\]]*)\]\);/.exec(text);assert.ok(match);return[...match[1].matchAll(/'([^']+)'/g)].map(value=>value[1]);}
function exactOptions(text){assert.deepEqual(optionKeys(text),['foundation','major','noveltySuccession','operationalPairBaseline','read','schema','sourceCommit']);}

test('v2 requires seven exact data options instead of silently defaulting the host foundation',()=>{
 const text=source();exactOptions(text);
 containsAll(text,["const VERSION='own-monetary-program-qa-projection.v2'",'Reflect.ownKeys(options).sort(),OPTION_KEYS',"Object.hasOwn(descriptor,'value')&&descriptor.enumerable",'Object.getOwnPropertyDescriptor(options,key).value']);
 assert.throws(()=>exactOptions(text.replace("'foundation',",'')),assert.AssertionError);
});

test('only an explicit null selects standalone and the existing object is forwarded unchanged',()=>{
 const text=source(),required=["input.foundation===null||record(input.foundation),'MONETARY_QA_FOUNDATION_SELECTION_REQUIRED'",'suppliedFoundation=input.foundation===null?null:foundationState(input.foundation,input)','...(suppliedFoundation?{foundation:input.foundation}:{})','selectedFoundation=suppliedFoundation??foundationState(fixed.qa192.qa,input)'];
 containsAll(text,required);
 assert.throws(()=>containsAll(text.replace('...(suppliedFoundation?{foundation:input.foundation}:{})',''),required),assert.AssertionError);
 assert.equal(text.includes('options.foundation??'),false);
 assert.equal(text.includes('options.foundation||'),false);
});

test('both fixed and selected QA must retain the exact foundation and live actors',()=>{
 const text=source(),required=["assert.strictEqual(fixed.qa192.qa,foundation,'MONETARY_QA_FOUNDATION_REBUILT')","assert.strictEqual(qa.qa192.qa,foundation,'MONETARY_QA_FOUNDATION_REBUILT')","assert.strictEqual(selected.actor,state.actor,'MONETARY_QA_ACTOR_REBUILT')","assert.strictEqual(selected.checker,state.checker,'MONETARY_QA_CHECKER_REBUILT')","assert.strictEqual(selected.qa192.actor,state.actor,'MONETARY_QA_192_ACTOR_REBUILT')","assert.strictEqual(selected.qa192.checker,state.checker,'MONETARY_QA_192_CHECKER_REBUILT')"];
 containsAll(text,required);
 assert.throws(()=>containsAll(text.replace(required[0],''),required),assert.AssertionError);
 assert.equal(text.split(' assertFoundationState(selectedFoundation,input,fixed,qa);').length,3);
 assert.equal(text.includes('Object.freeze(foundation'),false);
 assert.equal(text.includes('actorSessionId=foundation.ids.session'),false);
});

test('context, source hashes and the host seed and phase inputs remain guarded without resealing',()=>{
 const text=source();containsAll(text,["['major','schema','sourceCommit','operationalPairBaseline']","Object.getOwnPropertyDescriptors(foundation),state.descriptors,'MONETARY_QA_FOUNDATION_MUTATED'","['sourceHashes',state.sourceHashDescriptors]","['local',state.localDescriptors]","foundation.predecessorInstallation,state.predecessors,'MONETARY_QA_FOUNDATION_PREDECESSORS_MUTATED'","foundation.local[phase],state.local[phase].reference,'MONETARY_QA_FOUNDATION_PHASE_REPLACED:'","foundation.local[phase],state.local[phase].statements,'MONETARY_QA_FOUNDATION_PHASE_MUTATED:'","hash(read(path)),expected,'MONETARY_QA_FOUNDATION_SOURCE_CHANGED:'","selected.declarationFixtureActorsInstalled,false,'MONETARY_QA_DOCUMENTARY_ACTORS_INSTALLED'"]);
 const main=text.slice(text.indexOf('export function buildOwnMonetaryProgramQaProjection(options){'));
 assert.ok(main.indexOf('checkedOptions(options)')<main.indexOf('input.read(path)'));
 assert.ok(main.indexOf('suppliedFoundation.sourceHashes')<main.indexOf('const fixed=buildMonthlyDayFixedCompositionQa('));
 assert.equal(main.includes('sourceHashes[path]=expected'),false);
});

test('all prior source pins and the complete eleven-definition projection remain exact',()=>{
 const text=source();
 assert.equal(hash(section(text,'const SOURCES=Object.freeze({','const body=d=>')),'f060efe2e51890776a267144098c4478929df58cb604dacfac284f287f5e136d');
 assert.equal(hash(section(text,'function projection({qa,batch}){','export function buildOwnMonetaryProgramQaProjection(options){')),'94ca485aa52c9779e455e02ac0a76f21edb22184da3beb382ba03cf3d8726b85');
});

test('the complete phase, lock, ACL and snapshot projection tail is preserved as source',()=>{
 const text=source();assert.equal(hash(section(text,' const projected=projection({qa,batch})',' // Existing local/localFixed/local197 arrays')),'5cd53ea5f10e4a5e5ea11a40ac0700aac09f13494ebfd9cf5a17230830fe4fcd');
 containsAll(text,['canonicalPhaseArraysPreserved:true','observedMetadataUsed:false','capabilitiesAdded:false','permissionsAdded:false','executionAdmitted:false','sourcePromotionAdmitted:false','connects:false','executesSql:false','complete:false']);
});

test('foundation support introduces no new imported constructor or source authority',()=>{
 const imports=source().split('\n').filter(line=>line.startsWith('import '));
 assert.deepEqual(imports,["import assert from 'node:assert/strict';","import {createHash} from 'node:crypto';","import {buildMonthlyDayFixedCompositionQa,monthlyFixedQaHeader} from './own-monthly-day-fixed-composition-qa.mjs';","import {buildOwnNoveltySuccessionQa} from './own-novelty-succession-qa.mjs';","import {buildOwnMonetaryGuardedInstallation,OWN_MONETARY_INSTALLATION_SOURCES} from './own-monetary-program-guarded-installation.mjs';","import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';"]);
});
