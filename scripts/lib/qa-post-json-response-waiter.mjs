// Browser verifier only: consume the one POST body inside the response event.
// A waitForResponse continuation can run after navigation has discarded it.
export function qaPostJsonResponseWaiter(page,relevant,{timeoutMs=30000}={}){
 if(typeof relevant!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw Error('QA_RESPONSE_OBSERVER_ARGUMENT');
 let matched=false,done=false,timer,resolve,reject;
 const result=new Promise((yes,no)=>{resolve=yes;reject=no;});result.catch(()=>{});
 const fault=code=>Object.assign(new Error(code),{code});
 const cleanup=()=>{clearTimeout(timer);page.off('response',onResponse);page.off('close',onClose);page.off('crash',onCrash);};
 const settle=(ok,value)=>{if(done)return;done=true;cleanup();if(ok)resolve(value);else reject(value);};
 const onClose=()=>settle(false,fault('QA_RESPONSE_PAGE_CLOSED')),onCrash=()=>settle(false,fault('QA_RESPONSE_PAGE_CRASHED'));
 const onResponse=response=>{
  if(done||matched)return;
  try{if(response.request().method()!=='POST'||!relevant(response))return;}catch(error){settle(false,error);return;}
  matched=true;page.off('response',onResponse);
  let body;try{body=response.json();}catch(error){settle(false,error);return;}
  Promise.resolve(body).then(value=>settle(true,{response,body:value}),error=>settle(false,error));
 };
 try{page.on('response',onResponse);page.on('close',onClose);page.on('crash',onCrash);timer=setTimeout(()=>settle(false,fault('QA_RESPONSE_BODY_TIMEOUT')),timeoutMs);}catch(error){settle(false,error);}
 return Object.freeze({result,cancel:()=>settle(false,fault('QA_RESPONSE_OBSERVER_CANCELLED'))});
}
