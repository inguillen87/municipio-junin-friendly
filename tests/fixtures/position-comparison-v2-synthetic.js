// Existing synthetic programmes and arithmetic only. No municipal quantities,
// SQL, new hire or normative equivalence is introduced by this read fixture.
import {comparisonFixture} from './position-comparison-synthetic.js';
import {capture,saved} from './own-payroll-run-synthetic.js';
import {approvedSources} from './own-payroll-approved-synthetic.js';
import {monthlyDayEngineSources} from './own-monthly-day-engine-synthetic.js';
import {budgetHash} from '../../assets/annual-position-budget-model.js';

export async function comparisonV2Fixture({legacy=false,count=1,typedOnly=true,closeCount=count,closeOffset=0,captureId=null,groupId=null}={}){
 const s=legacy?approvedSources(count):monthlyDayEngineSources(Array.from({length:count},()=> '30'),{typedOnly});
 if(legacy)s.population.version=await budgetHash(s.population.employees);
 const original=capture();if(captureId!==null)original.id=captureId;
 Object.assign(original.body,{period:s.period,liquidationType:s.liquidationType,selection:structuredClone(s.selection),scopeVersion:s.programState.scopeVersion,programVersion:s.programState.program.version});
 original.bodySha256=await budgetHash(original.body);
 original.payload={...s,sourceInventory:{populationDomain:'native_registered'}};
 original.payloadSha256=await budgetHash(original.payload);original.saved=saved(original);
 const v=await comparisonFixture(count),c=v.captures[0],people=s.population.employees;
 v.version='own-position-comparison.v2';
 Object.assign(c,{id:original.id,payloadSha256:original.payloadSha256,population:structuredClone(s.population),original});
 Object.assign(c.positions,{captureId:c.id,capturePayloadSha256:c.payloadSha256,period:s.period,liquidationType:s.liquidationType});
 c.positions.payload.populationVersion=s.population.version;
 c.positions.payload.employees=c.positions.payload.employees.map((e,i)=>({...e,contractId:people[i].contractId,employeeNumber:people[i].employeeNumber,identityToken:people[i].identityToken}));
 c.positions.payloadSha256=await budgetHash(c.positions.payload);
 Object.assign(c.dimensions,{captureId:c.id,capturePayloadSha256:c.payloadSha256});c.dimensions.payload.populationVersion=s.population.version;
 c.dimensions.payload.employees=c.dimensions.payload.employees.map((e,i)=>({...e,contractId:people[i].contractId,employeeNumber:people[i].employeeNumber,identityToken:people[i].identityToken}));
 c.dimensions.payloadSha256=await budgetHash(c.dimensions.payload);
 Object.assign(v.groups[0],{...(groupId!==null?{id:groupId}:{}),employeeCount:closeCount,populationCount:count,populationComplete:closeCount===count});
 v.employees=people.slice(closeOffset,closeOffset+closeCount).map(e=>({groupId:v.groups[0].id,contractId:e.contractId,employeeNumber:e.employeeNumber,captureId:c.id,inputSha256:original.saved.inputSha256,resultSha256:original.saved.resultSha256,liquidationVersion:1}));
 return v;
}

export function legacyComparisonProjection(v){
 const next=structuredClone(v);next.version='own-position-comparison.v1';
 next.captures=next.captures.map(({original,...c})=>c);
 next.employees=next.employees.map(({inputSha256,...e})=>e);return next;
}

