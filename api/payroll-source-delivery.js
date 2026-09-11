/** Owner-preauthorized, exact encrypted payload delivery. NOT a general import API. */
import { getActionCenterSql } from './internal-actions.js';
const MAX=1500000;
function send(res,status,payload){res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(payload)}
export function createPayrollSourceDeliveryHandler({getSql=getActionCenterSql,env=process.env}={}){return async(req,res)=>{
 if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{ok:false,code:'METHOD_NOT_ALLOWED'})}
 if(req.headers?.origin||String(req.headers?.['content-type']||'').split(';')[0]!=='application/json')return send(res,403,{ok:false,code:'DELIVERY_DENIED'});
 try{
  if(Number(req.headers?.['content-length'])>MAX)return send(res,413,{ok:false,code:'DELIVERY_TOO_LARGE'});
  let body=req.body;if(body===undefined&&req[Symbol.asyncIterator]){let n=0;const a=[];for await(const c of req){const b=Buffer.from(c);n+=b.length;if(n>MAX)return send(res,413,{ok:false,code:'DELIVERY_TOO_LARGE'});a.push(b)}body=Buffer.concat(a)}
  if(Buffer.isBuffer(body))body=body.toString('utf8');if(typeof body==='string'){if(Buffer.byteLength(body)>MAX)return send(res,413,{ok:false,code:'DELIVERY_TOO_LARGE'});body=JSON.parse(body)}
  if(!body||Object.keys(body).sort().join(',')!=='cipher,jobId'||typeof body.cipher!=='string'||body.cipher.length>1400000||! /^[A-Za-z0-9+/]+={0,2}$/.test(body.cipher)||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.jobId))return send(res,400,{ok:false,code:'DELIVERY_INVALID'});
  const cipher=Buffer.from(body.cipher,'base64');if(cipher.toString('base64')!==body.cipher||cipher.length<32)return send(res,400,{ok:false,code:'DELIVERY_INVALID'});
  const sql=await getSql(env);const [row]=await sql.query('SELECT payroll_detail_delivery_v1($1::uuid,$2::bytea) AS result',[body.jobId,'\\x'+cipher.toString('hex')]);
  const x=row?.result;if(!x||!Number.isInteger(x.statements)||!Number.isInteger(x.lines)||typeof x.replayed!=='boolean'||x.payrollModified!==false)throw new Error('invalid receipt');
  return send(res,200,{ok:true,datasetId:x.datasetId,statements:x.statements,lines:x.lines,replayed:x.replayed,payrollModified:false});
 }catch{return send(res,403,{ok:false,code:'DELIVERY_DENIED'})}
}}
export default createPayrollSourceDeliveryHandler();
