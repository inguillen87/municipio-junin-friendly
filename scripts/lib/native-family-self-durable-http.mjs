// HTTP shell for the committed195 browser test. Only auth gateway envelopes
// are fixtures; every family API request reaches the unmodified real handler.
import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{nativeFamilyDurableBrowserHtml}from'./native-family-self-durable-browser.mjs';
export const NATIVE_FAMILY_DURABLE_ASSETS=Object.freeze(['assets/native-family-request-panel.js','assets/native-family-request-client.js','assets/native-family-request-model.js','assets/native-family-request.css','assets/native-salary-catalog-model.js']);
export const nativeFamilyDurableShell=nativeFamilyDurableBrowserHtml;
export function createNativeFamilyDurableHttp({root,handler,authState,currentActor}){
 const assets=new Map(),served=new Map();for(const file of NATIVE_FAMILY_DURABLE_ASSETS){const source=fs.readFileSync(path.join(root,file)),built=fs.readFileSync(path.join(root,'public',file));assert.ok(source.equals(built),'FAMILY195_BROWSER_BUILT_BYTES_CHANGED:'+file);assets.set('/'+file,{bytes:built,sha256:createHash('sha256').update(built).digest('hex')});}
 const route=async(req,res)=>{const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/api/internal-native-family-requests')return handler(req,res);res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'||u.search)return res.status(404).json({ok:false});
  if(u.pathname==='/self'||u.pathname==='/review'){const body=nativeFamilyDurableShell(u.pathname.slice(1));res.setHeader('Content-Type','text/html; charset=utf-8');return res.status(200).end(body);}
  if(u.pathname==='/api/internal-auth'){const actor=currentActor(),state=await authState();if(!state||state.status!=='active'||!state.userActive||!state.membershipActive||!Number.isFinite(Date.parse(state.expiresAt))||Date.parse(state.expiresAt)<=Date.now())return res.status(401).json({ok:false,authenticated:false});return res.status(200).json({ok:true,authenticated:true,sessionVersion:2,user:{id:actor.actorSessionId,email:actor.actorEmail},access:{tenant:{id:actor.tenantId,roleKey:'NATIVE_FAMILY_SYNTHETIC_QA'},tenantCapabilities:state.capabilities},expiresAt:state.expiresAt});}
  const asset=assets.get(u.pathname);if(asset){served.set(u.pathname,asset.sha256);res.setHeader('Content-Type',u.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.setHeader('Content-Length',String(asset.bytes.length));return res.status(200).end(asset.bytes);}
  return res.status(404).json({ok:false});
 };
 return{handler:route,assetEvidence:()=>[...served].map(([file,sha256])=>({path:file.slice(1),sha256})),allAssets:[...assets].map(([file,a])=>({path:file.slice(1),sha256:a.sha256})),sourceBytes:new Map([...assets].map(([file,a])=>[file,a.bytes]))};
}
