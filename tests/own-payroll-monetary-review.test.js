import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {programMonetaryReview,programMonetaryComparison,renderProgramMonetaryReview} from '../assets/own-payroll-program-monetary-review.js';
import {verifyOwnMonetaryProgrammeManifest} from '../assets/own-payroll-monetary-manifest.js';

const clone = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const reference = 'Fuente exclusivamente sintética para la revisión; no es una regla municipal';
function fixture(count = 2, documentReference = reference, mode = 'exact') {
 const sourceSha256 = hash({syntheticDocument: documentReference});
 const rules = Array.from({length: count}, (_, index) => ({agreementCode:'1',code:String(900 + index),nature:'remuneration',unit:'money',validFrom:'2026-10',validUntil:null,liquidationTypes:['monthly'],ruleReference:reference,rounding:{precision:2,mode},expression:{op:'literal',unit:'money',value:'1.00'}}));
 const program = {namespaceVersion:'own-payroll-namespaces.v2',rules,bindings:[],totalsPrecision:2};
 const source = {version:'own-program-monetary-source.v1',complete:true,program,programSha256:hash(program),sourceReference:documentReference,sourceSha256};
 const inventory = rules.map(rule => ({identity:{namespaceVersion:program.namespaceVersion,kind:'concept',agreementCode:rule.agreementCode,code:rule.code,nature:rule.nature,validFrom:rule.validFrom,validUntil:rule.validUntil,liquidationTypes:clone(rule.liquidationTypes)},unit:rule.unit,stage:'rule_result',rounding:clone(rule.rounding),ruleReference:rule.ruleReference,ruleSha256:hash(rule),expressionSha256:hash(rule.expression),nodes:[{path:'expression',operation:'literal',declaredUnit:'money',stage:'expression_exact'}]}));
 const entries = inventory.map(row => ({identity:clone(row.identity),unit:row.unit,stage:row.stage,rounding:clone(row.rounding),ruleSha256:row.ruleSha256,expressionSha256:row.expressionSha256,sourceReference:documentReference,sourceSha256}));
 const unsigned = {version:'own-program-monetary-policy.v1',complete:true,sourceStateSha256:hash(source),programSha256:hash(program),inventorySha256:hash({version:source.version,programSha256:hash(program),bindingsSha256:hash(program.bindings),inventory}),entries};
 return {...program,monetaryPolicyVersion:'own-program-monetary-manifest.v1',monetaryPolicy:{sourceReference:documentReference,sourceSha256,policy:{...unsigned,policySha256:hash(unsigned)}}};
}
function dom() {
 const doc = {createElement(tag) {return new Element(tag);}};
 class Element {
  constructor(tag) {this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attributes={};this.value='';this.hidden=false;}
  set textContent(value) {this.value=String(value);this.children=[];}
  get textContent() {return this.value + this.children.map(child=>child.textContent).join('');}
  set innerHTML(value) {throw new Error('HTML interpolation is forbidden in this synthetic DOM');}
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children=[...children];this.value='';}
  setAttribute(key,value) {this.attributes[key]=value;}
 }
 return doc.createElement('section');
}
const descendants = root => [root,...root.children.flatMap(descendants)];

test('legacy definitions have no annex view and partial annexes are rejected', () => {
 assert.equal(programMonetaryReview(null),null);
 assert.equal(programMonetaryReview({rules:[],bindings:[],totalsPrecision:2}),null);
 assert.equal(programMonetaryComparison(null,{rules:[],bindings:[],totalsPrecision:2}),null);
 const value=fixture(); delete value.monetaryPolicyVersion;
 assert.throws(()=>programMonetaryReview(value));
 const other=fixture(); delete other.monetaryPolicy;
 assert.throws(()=>programMonetaryReview(other));
});
test('presentation retains the complete frozen declaration without granting integrity or authority', async () => {
 const definition=fixture(),checked=await verifyOwnMonetaryProgrammeManifest(definition),view=programMonetaryReview(definition);
 assert.equal(checked.monetaryPolicySha256,definition.monetaryPolicy.policy.policySha256);
 assert.deepEqual(view.declaration,definition.monetaryPolicy);
 assert.equal(view.entries.length,2);
 for(const field of ['integrityValidated','approvalAuthorityValidated','payrollCalculated'])assert.equal(view[field],false);
 assert.equal(view.sourceEvidence,'declared_not_document_revalidated');
 assert.ok(Object.isFrozen(view)&&Object.isFrozen(view.entries)&&Object.isFrozen(view.entries[0].identity));
 definition.monetaryPolicy.policy.entries[0].sourceReference='Modified later input';
 assert.equal(view.entries[0].sourceReference,reference);
});
test('a valid source-only annex correction is visible even with byte-identical programme formulas', async () => {
 const a=fixture(),b=fixture(2,'Otra fuente exclusivamente sintética de esta revisión');
 await verifyOwnMonetaryProgrammeManifest(a);await verifyOwnMonetaryProgrammeManifest(b);
 assert.deepEqual(a.rules,b.rules);assert.deepEqual(a.bindings,b.bindings);
 assert.equal(programMonetaryComparison(a,b).changed,true);
 assert.equal(programMonetaryComparison(a,clone(a)).changed,false);
 assert.equal(programMonetaryComparison(null,a).changed,true);
 assert.equal(programMonetaryComparison(a,null).changed,true);
 assert.equal(a.monetaryPolicy.sourceReference,reference);
});
test('declared rounding differences are visible without selecting a municipal policy', () => {
 const a=fixture(),b=fixture(2,reference,'half_even');
 const difference=programMonetaryComparison(a,b);
 assert.equal(difference.changed,true);
 assert.equal(difference.before.entries[0].rounding.mode,'exact');
 assert.equal(difference.after.entries[0].rounding.mode,'half_even');
 assert.equal(difference.after.integrityValidated,false);
});
test('all1000 entries, the final identity and every fingerprint reach the synthetic DOM', () => {
 const definition=fixture(1000),view=programMonetaryReview(definition),parent=dom();
 renderProgramMonetaryReview(parent,view);
 const nodes=descendants(parent),bodies=nodes.filter(node=>node.tagName==='tbody');
 assert.equal(bodies.length,1);assert.equal(bodies[0].children.length,1000);
 const last=bodies[0].children[999].textContent,entry=view.entries[999];
 for(const value of [entry.identity.code,entry.sourceSha256,entry.ruleSha256,entry.expressionSha256])assert.ok(last.includes(value),value);
 for(const value of [view.sourceStateSha256,view.programSha256,view.inventorySha256,view.policySha256])assert.ok(parent.textContent.includes(value),value);
 assert.ok(parent.textContent.includes('no certifica'));
 assert.ok(parent.textContent.includes('Mensual'));
 assert.ok(nodes.some(node=>node.attributes.role==='region'&&node.tabIndex===0));
});
test('rendering uses text and clearing removes the entire previous declaration', () => {
 const parent=dom(),view=programMonetaryReview(fixture());
 renderProgramMonetaryReview(parent,{...view,sourceReference:'<img src=x onerror=example()> & "text"'});
 assert.ok(parent.textContent.includes('<img src=x onerror=example()> & "text"'));
 assert.equal(descendants(parent).some(node=>node.tagName==='img'),false);
 renderProgramMonetaryReview(parent,null);
 assert.equal(parent.hidden,true);assert.equal(parent.children.length,0);assert.equal(parent.textContent,'');
});
test('accessors are rejected without invoking their values and incomplete coverage is never shown', () => {
 const value=fixture();let reads=0;
 Object.defineProperty(value.monetaryPolicy,'sourceReference',{enumerable:true,get(){reads++;return reference;}});
 assert.throws(()=>programMonetaryReview(value));assert.equal(reads,0);
 const incomplete=fixture();incomplete.monetaryPolicy.policy.entries.pop();
 assert.throws(()=>programMonetaryReview(incomplete));
});
