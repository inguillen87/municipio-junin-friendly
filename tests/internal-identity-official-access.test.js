import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../login.html',import.meta.url),'utf8');
function source(name){
  const at=html.indexOf('function '+name+'(');assert.ok(at>=0);
  const open=html.indexOf('{',at);let depth=0;
  for(let n=open;n<html.length;n++){if(html[n]==='{')depth++;if(html[n]==='}'&&--depth===0)return html.slice(at,n+1);}
  assert.fail('Unclosed function '+name);
}
function runtime(){
  const elements={errorMsg:{hidden:true,textContent:''},officialAccessRow:{hidden:true}};
  const scope=vm.createContext({document:{getElementById:id=>{assert.ok(elements[id]);return elements[id];}}});
  vm.runInContext(['showError','hideError','identityError'].map(source).join('\n'),scope);
  return{elements,scope};
}
test('origin rejection offers the institutional production link rather than treating it as a password failure',()=>{
  const {elements,scope}=runtime(),error={code:'IDENTITY_ORIGIN_FORBIDDEN',status:403};scope.showError(scope.identityError(error),error);
  assert.equal(elements.officialAccessRow.hidden,false);assert.match(elements.errorMsg.textContent,/dirección/);assert.doesNotMatch(elements.errorMsg.textContent,/contraseña incorrecta/);
  const link=html.match(/<a[^>]*id="officialAccessLink"[^>]*>/)?.[0];assert.ok(link);assert.match(link,/href="https:\/\/municontrol\.com\/acceso"/);assert.doesNotMatch(link,/\?|target=|onclick=|password|token|email/i);
});
for(const error of[{code:'IDENTITY_AUTH_FAILED',status:401},{code:'IDENTITY_GATEWAY_UNAVAILABLE',status:503},{code:'IDENTITY_CONTEXT_FORBIDDEN',status:403},{code:'IDENTITY_MFA_INVALID',status:401}])test('other '+error.code+' failures never offer an origin recovery action',()=>{
  const {elements,scope}=runtime();scope.showError('Origen rechazado',{code:'IDENTITY_ORIGIN_FORBIDDEN'});scope.showError(scope.identityError(error),error);assert.equal(elements.officialAccessRow.hidden,true);
});
test('starting another access attempt hides the old origin action and does not navigate or replay credentials',()=>{
  const {elements,scope}=runtime();scope.showError('Origen rechazado',{code:'IDENTITY_ORIGIN_FORBIDDEN'});scope.hideError();assert.equal(elements.errorMsg.hidden,true);assert.equal(elements.officialAccessRow.hidden,true);
  assert.doesNotMatch(source('showError'),/fetch|location|href\s*=|password|localStorage|sessionStorage/);
});
