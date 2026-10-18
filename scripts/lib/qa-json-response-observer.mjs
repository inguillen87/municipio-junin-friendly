// QA transport only: start reading while the response belongs to its document.
// Rejected reads stay rejected when consumed; this does not retry or forge a body.
export function qaJsonResponseObserver(relevant,responses,bodies){
 return response=>{
  const request=response.request();
  if(!relevant(request))return;
  responses.push(response);
  const url=new URL(request.url());
  if(request.method()!=='GET'||url.searchParams.get('resource')!=='attempt')return;
  const body=response.json();
  body.catch(()=>{});
  bodies.set(response,body);
 };
}
