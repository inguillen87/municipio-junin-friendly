import {program} from './own-payroll-program-synthetic.js';

// Explicit arithmetic fixtures for the new exact editor. Original historical
// rounding fixtures remain unchanged in the engine and contract regression.
export function exactProgram(){
 const p=program(),walk=n=>{if(n.op==='concept')n.stage='exact';for(const k of ['left','right','value','condition','then','else'])if(n[k]&&typeof n[k]==='object')walk(n[k]);};
 for(const r of p.rules){r.rounding={precision:8,mode:'exact'};walk(r.expression);}
 // A terminating quarter tests fractional cents without an unrepresentable 1/3.
 p.rules.find(r=>r.code==='900').expression.left.right.value='4';
 p.totalsPrecision=8;return p;
}
