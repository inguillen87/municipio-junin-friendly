// Fictional identity profiles; never municipal source data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {splitPostgresStatements} from '../../scripts/lib/sql-statements.mjs';
export function identityProfileValidatorQaDefinitions(){
 const source=fs.readFileSync(new URL('../../scripts/migrations/002-canonical-integration.sql',import.meta.url),'utf8');
 return ['normalize_digits','is_valid_cuil'].map(name=>{
  const definitions=splitPostgresStatements(source).filter(s=>s.startsWith('CREATE OR REPLACE FUNCTION '+name+'('));
  assert.equal(definitions.length,1);
  return definitions[0].replace('FUNCTION '+name+'(','FUNCTION public.'+name+'(');
 });
}
export function finalIdentityProfileCases(){
 const identity={fullName:'PERSONA SINTETICA',documentNumber:'0099999990',cuil:'20-99999990-6',birthDate:'1990-01-01',sexLabel:'Masculino',sexCode:'M'};
 const record={person_id:'9007199254740993',nombre:identity.fullName,dni:identity.documentNumber,cuil:identity.cuil,fecha_nacimiento:identity.birthDate,sexo:identity.sexLabel,
  source_payload:{personId:'9007199254740993',identity}};
 const person={full_name:'PERSONA SINTETICA',dni:'99999990',cuil:'20999999906',birth_date:'1990-01-01',sex_code:'M'};
 const cases=[];
 const add=(label,match,edit=()=>{})=>{const c={label,match,record:structuredClone(record),person:structuredClone(person)};edit(c);cases.push(c);};
 const source=(c,key,value)=>{c.record.source_payload.identity[key]=value;const map={fullName:'nombre',documentNumber:'dni',cuil:'cuil',birthDate:'fecha_nacimiento',sexLabel:'sexo'};if(map[key])c.record[map[key]]=value;};
 add('whole canonical master profile',true);
 add('whole legacy curated profile',true,c=>{c.person.dni='0099999990';c.person.sex_code='Masculino';});
 add('invalid raw CUIL stays literal and canonical NULL',true,c=>{source(c,'cuil','not-a-CUIL');c.person.cuil=null;});
 add('invalid CUIL cannot be silently accepted as canonical',false,c=>{source(c,'cuil','not-a-CUIL');c.person.cuil='not-a-CUIL';});
 add('missing CUIL stays NULL in both profiles',true,c=>{source(c,'cuil',null);c.person.cuil=null;});
 add('sex label NULL uses the original code',true,c=>{c.record.source_payload.identity.sexLabel=null;c.record.sexo='M';});
 add('master DNI with legacy sex is not a complete profile',false,c=>{c.person.sex_code='Masculino';});
 add('legacy DNI with master sex is not a complete profile',false,c=>{c.person.dni='0099999990';});
 for(const key of ['full_name','dni','cuil','birth_date','sex_code'])add('changed canonical '+key,false,c=>{c.person[key]=key==='birth_date'?'1991-01-01':'CHANGED';});
 for(const key of ['nombre','dni','cuil','fecha_nacimiento','sexo'])add('changed curated '+key+' cannot hide behind original payload',false,c=>{c.record[key]='CHANGED';});
 add('payload person key conflicts with the exact original link',false,c=>{c.record.source_payload.personId='9007199254740994';});
 add('missing original identity',false,c=>{delete c.record.source_payload.identity;});
 add('array is not an original identity object',false,c=>{c.record.source_payload.identity=[];});
 add('malformed birthday never throws or matches NULL',false,c=>{source(c,'birthDate','2026-02-30');c.person.birth_date=null;});
 add('free text birthday never throws or matches NULL',false,c=>{source(c,'birthDate','birthday');c.person.birth_date=null;});
 add('NULL birth date is preserved',true,c=>{source(c,'birthDate',null);c.person.birth_date=null;});
 add('valid future birthday retains existing SQL097 NULL projection',true,c=>{source(c,'birthDate','2090-01-01');c.person.birth_date=null;});
 add('valid future birthday cannot match an invented canonical date',false,c=>{source(c,'birthDate','2090-01-01');c.person.birth_date='2090-01-01';});
 add('NULL canonical DNI is distinct from zero',false,c=>{c.person.dni='0';});
 return cases;
}
