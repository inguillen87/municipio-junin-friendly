import {validatePracticeNovelty} from './developer-homologation-trials.js';
const amountPattern=/^(0|[1-9][0-9]{0,7})\.[0-9]{2}$/;
const query='SELECT developer_homologation.practice_v1($1::jsonb,$2::text,$3::text,$4::integer,$5::text) AS result';
const error=code=>{throw Object.assign(new Error(code),{code});};
async function call(sql,ctx,tag,step,rev,value) {
  const reply=await sql.query(query,[JSON.stringify(ctx),tag,step,rev,value]);
  const result=(Array.isArray(reply)?reply:reply?.rows)?.[0]?.result;
  const p=result?.practice;
  if(result?.active!==true||typeof result.scopeToken!=='string'||!/^[a-f0-9]{64}$/.test(result.scopeToken)
    ||typeof result.expiresAt!=='string'||!Number.isFinite(Date.parse(result.expiresAt))
    ||!p||!Number.isSafeInteger(p.revision)||p.revision<0||p.revision>500
    ||!['empty','pending','approved','rejected'].includes(p.state)
    ||(p.state==='empty' ? p.amount!==null : typeof p.amount!=='string'||!amountPattern.test(p.amount)))error('QA_PRACTICE_CONTRACT');
  return result;
}
export async function developerHomologationPractice(sql,ctx,tag,step,rev,amount){
  if(!['read','draft','approve','reject','reset'].includes(step))error('QA_PRACTICE_INPUT');
  if(step==='read')return call(sql,ctx,null,'read',null,null);
  if(!Number.isSafeInteger(rev)||rev<0||rev>=500||typeof tag!=='string'||!/^[a-f0-9]{64}$/.test(tag))error('QA_PRACTICE_INPUT');
  const current=await call(sql,ctx,null,'read',null,null);
  if(current.scopeToken!==tag||current.practice.revision!==rev)error('QA_PRACTICE_STALE');
  if(step==='draft'){
    if(typeof amount!=='string'||!amountPattern.test(amount))error('QA_PRACTICE_INPUT');
    if(current.practice.state!=='empty')error('QA_PRACTICE_STATE');
    if(validatePracticeNovelty(step,amount)!==true)error('QA_PRACTICE_INPUT');
  }else{
    if(amount!==null)error('QA_PRACTICE_INPUT');
    if(step!=='reset'){
      if(current.practice.state!=='pending')error('QA_PRACTICE_STATE');
      if(validatePracticeNovelty(step,current.practice.amount)!==true)error('QA_PRACTICE_INPUT');
    }
  }
  // SQL rechecks the actual actor, active epoch and revision inside its lock.
  return call(sql,ctx,tag,step,rev,amount);
}
