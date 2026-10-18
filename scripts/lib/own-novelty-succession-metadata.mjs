// Pure SQL197 metadata composition. No connection, SQL execution or live catalogue input.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pinsCheck} from './native-leave-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const withoutHash=pin=>{const{sha256,...metadata}=pin;return metadata;};
const metadataObject=/\{"name":"(?:[^"\\]|\\.)*","signature":"(?:[^"\\]|\\.)*","sha256":"[a-f0-9]{64}"[^{}]*\}/g;

// The legacy source parser supports scalar results only. Read array metadata
// from the original header and original body; never change the SQL to parse it.
export function ownNoveltySuccessionFunctionPin(definition){
 const body=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(definition);
 assert.ok(body,'Function body missing');const header=definition.slice(0,body.index);
 if(!/\bRETURNS\s+(?:SETOF\s+)?[\w.]+\[\]\s+LANGUAGE\b/i.test(header))return ownInstallationFunctionPin(definition);
 const match=/CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*RETURNS\s+(SETOF\s+)?([\w.]+\[\])\s+LANGUAGE\s+(\w+)/i.exec(header);
 assert.ok(match,'Unsupported array function header');
 const params=match[2].trim()?match[2].split(',').map(raw=>{const p=/^\s*(\w+)\s+([\w.]+(?:\[\])?)(?:\s+DEFAULT\s+(NULL|false|0|'[^']*'))?\s*$/i.exec(raw);assert.ok(p,'Unsupported function argument');return{name:p[1],type:p[2],default:p[3]};}):[];
 const config=[];for(const setting of header.matchAll(/\bSET\s+(search_path|timezone)\s*=\s*(.*?)(?=\s+SET\b|$)/gi))config.push(setting[1].toLowerCase()==='timezone'?'TimeZone='+setting[2].trim().replaceAll("'",''):'search_path='+setting[2].split(',').map(v=>v.trim()).join(', '));
 return{name:match[1],signature:'public.'+match[1]+'('+params.map(p=>p.type).join(',')+')',sha256:createHash('sha256').update(body[2]).digest('hex'),argNames:params.map(p=>p.name),defaults:params.filter(p=>p.default!==undefined).map(p=>p.default.toUpperCase()==='NULL'?'NULL::'+p.type:p.default.startsWith("'")?p.default+'::'+p.type:p.default.toLowerCase()).join(', '),resultType:match[4],language:match[5].toLowerCase(),returnsSet:!!match[3],strict:/\bSTRICT\b/i.test(header),definer:/\bSECURITY DEFINER\b/i.test(header),volatility:/\bIMMUTABLE\b/i.test(header)?'i':/\bSTABLE\b/i.test(header)?'s':'v',config,runtime:false};
}

export function composeOwnNoveltySuccessionPins(source,beforePins,afterPins){
 assert.equal(typeof source,'string');assert.equal(beforePins.length,afterPins.length);
 const before=new Map(),after=new Map(),counts={};
 for(let i=0;i<beforePins.length;i++){
  const old=beforePins[i],next=afterPins[i];
  assert.deepEqual(withoutHash(old),withoutHash(next),'NOVELTY197_EXISTING_METADATA_CHANGED');
  assert.match(old.sha256,/^[a-f0-9]{64}$/);assert.match(next.sha256,/^[a-f0-9]{64}$/);
  assert.equal(before.has(old.signature),false,'NOVELTY197_DUPLICATE_METADATA');
  before.set(old.signature,old);after.set(old.signature,next);counts[old.signature]=0;
 }
 const replace=(text,from,to,count)=>text.replace(metadataObject,literal=>{
  const row=JSON.parse(literal),expected=from.get(row.signature);if(!expected)return literal;
  assert.deepEqual(row,expected,'NOVELTY197_ANCESTOR_METADATA_CHANGED');
  if(count)counts[row.signature]++;
  return JSON.stringify({...row,sha256:to.get(row.signature).sha256});
 });
 const value=replace(source,before,after,true);
 assert.equal(replace(value,after,before,false),source,'NOVELTY197_METADATA_INVERSE_CHANGED');
 return{value,counts};
}

// Match only the old130 relation guard, at its original SQL quote depth.
// Counts belonging to other tables or helper families are never changed.
export function composeOwnNoveltySuccessionObjectCounts(source){
 assert.equal(typeof source,'string');let blocks=0;
 const indexBefore='FROM pg_index WHERE indrelid=r AND indisunique AND indisvalid AND indisready AND indislive)<>4';
 const indexAfter=indexBefore.slice(0,-1)+'5';
 const countPattern=/(proname LIKE ('+)own_novelty_%\2\)<>)16( THEN)/g;
 const objectPattern=/DO \$objects\$ DECLARE r oid:=to_regclass\(('+)(?:public\.)own_payroll_novelty_event\1\);BEGIN[\s\S]*?END \$objects\$/g;
 const value=source.replace(objectPattern,block=>{
  blocks++;assert.equal(block.split(indexBefore).length,2,'NOVELTY197_PRIOR_INDEX_COUNT_CHANGED');
  let counts=0;const next=block.replace(indexBefore,indexAfter).replace(countPattern,(_,a,quote,b)=>{counts++;return a+'24'+b;});
  assert.equal(counts,1,'NOVELTY197_PRIOR_FUNCTION_COUNT_CHANGED');return next;
 });
 assert.ok(blocks>0,'NOVELTY197_RELATION_GUARD_MISSING');
 const inverse=value.replace(objectPattern,block=>block.replace(indexAfter,indexBefore).replace(/(proname LIKE ('+)own_novelty_%\2\)<>)24( THEN)/g,(_,a,quote,b)=>a+'16'+b));
 assert.equal(inverse,source,'NOVELTY197_OBJECT_GUARD_INVERSE_CHANGED');
 return{value,blocks,priorUniqueIndexes:4,newUniqueIndexes:5,priorFunctionFamilyCount:16,newFunctionFamilyCount:24};
}

export function composeOwnNoveltySuccessionReadiness({definition,beforePins,afterPins,newPins,indexCheck}){
 assert.match(definition,/^CREATE(?: OR REPLACE)? FUNCTION public\.municipal_adoption_ready_v1\(\)/);
 assert.equal(newPins.length,8,'NOVELTY197_ALL_EIGHT_HELPERS_REQUIRED');
 assert.equal(new Set(newPins.map(pin=>pin.signature)).size,8,'NOVELTY197_DUPLICATE_HELPER');
 assert.ok(newPins.every(pin=>pin.name.startsWith('own_novelty_')));
 assert.deepEqual(newPins.filter(pin=>pin.runtime).map(pin=>pin.name),['own_novelty_succession_context_v1']);
 assert.equal(typeof indexCheck,'string');assert.ok(indexCheck.includes('OWN_NOVELTY_SUCCESSION_INDEX_DRIFT'),'NOVELTY197_INDEX_GUARD_REQUIRED');
 const projected=composeOwnNoveltySuccessionPins(definition,beforePins,afterPins);
 for(const name of ['own_novelty_command_v1','own_novelty_conflict_v1','own_novelty_sources_v1']){
  const pin=beforePins.find(pin=>pin.name===name);
  assert.ok(pin&&projected.counts[pin.signature]>0,'NOVELTY197_READINESS_PRIOR_PIN_MISSING:'+name);
 }
 const counted=composeOwnNoveltySuccessionObjectCounts(projected.value);
 const guard=pinsCheck(newPins,'NOVELTY197_READINESS_HELPER_METADATA')+';\n'+indexCheck;
 const tail=definition.endsWith(';')?' END $operator$;':' END $operator$';
 assert.ok(counted.value.endsWith(tail),'NOVELTY197_READINESS_TAIL_CHANGED');
 const insertion='\nEXECUTE '+q(guard)+';\n';
 const value=counted.value.slice(0,-tail.length)+insertion+tail;
 assert.equal(value.slice(0,-tail.length-insertion.length)+tail,counted.value,'NOVELTY197_READINESS_GUARD_INVERSE_CHANGED');
 return{definition:value,counts:projected.counts,objectCounts:counted,newHelpers:8,newRuntimeFacades:1,addedGuard:guard,sourceDerived:true,connects:false,executesSql:false};
}
