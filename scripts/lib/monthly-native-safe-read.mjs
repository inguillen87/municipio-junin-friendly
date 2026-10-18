// Leaf QA helper: at most one retry of the same explicit GET after the
// fetch promise itself rejects with an ECONNRESET cause. No response parsing,
// SQL, server, global fetch configuration or write recovery happens here.
export async function monthlyNativeSafeRead(fetchOnce,url,options,onRetry=()=>{}){
 if(typeof fetchOnce!=='function'||typeof onRetry!=='function')throw new TypeError('MONTHLY_NATIVE_SAFE_READ_COLLABORATOR_REQUIRED');
 try{return await fetchOnce(url,options);}
 catch(firstError){
  const aborted=options?.signal?.aborted===true||['AbortError','TimeoutError'].includes(firstError?.name)||firstError?.code==='ABORT_ERR'||firstError?.cause?.name==='AbortError';
  if(options?.method!=='GET'||options.body!=null||aborted||firstError?.cause?.code!=='ECONNRESET')throw firstError;
  let response,retryError,retryFailed=false;
  try{response=await fetchOnce(url,options);}catch(error){retryFailed=true;retryError=error;}
  // Notify only after the actual second attempt. Keep original Error objects
  // available to the caller; its proof can retain a bounded safe projection.
  try{onRetry(Object.freeze({attempt:2,method:'GET',causeCode:'ECONNRESET',firstError,retryFailed,retryError:retryFailed?retryError:null}));}
  catch(evidenceError){throw new AggregateError([firstError,...(retryFailed?[retryError]:[]),evidenceError],'MONTHLY_NATIVE_SAFE_READ_EVIDENCE_FAILED',{cause:firstError});}
  if(retryFailed)throw new AggregateError([firstError,retryError],'MONTHLY_NATIVE_SAFE_READ_RETRY_FAILED',{cause:firstError});
  return response;
 }
}
