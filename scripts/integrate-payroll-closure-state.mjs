import fs from 'node:fs';
function once(s,a,b){if(!s.includes(a))throw Error('CLOSURE_INTEGRATION_ANCHOR_MISSING');return s.replace(a,b)}
function edit(p,f){const s=fs.readFileSync(p,'utf8'),n=f(s);if(n!==s)fs.writeFileSync(p,n)}
edit('assets/payroll-detail-model.js',s=>{
 if(s.includes('export function payrollClosureLabel'))return s;
 s=once(s,"!['closed','open'].includes(data.closureStatus)","!['closed','open','unknown'].includes(data.closureStatus)");
 return s+"\n/** Source state, not payment approval. Missing evidence remains unknown. */\nexport function payrollClosureLabel(state){\n const labels={closed:'Cierre informado por la fuente',open:'Abierta / preliquidación',unknown:'Estado de cierre no informado'};\n if(!Object.hasOwn(labels,state))throw Error('Estado de cierre inválido');\n return labels[state];\n}\n";
});
edit('assets/payroll-detail-panel.js',s=>s.includes('payrollClosureLabel(model.closureStatus)')?s:once(once(s,'createPayrollDetailModel, money','createPayrollDetailModel, money, payrollClosureLabel'),"(model.closureStatus==='closed'?'Cierre informado por la fuente':'Abierta / preliquidación')",'payrollClosureLabel(model.closureStatus)'));
edit('assets/payroll-detail-export.js',s=>{
 if(s.includes('payrollClosureLabel(m.closureStatus)'))return s;
 s=once(s,"import { money }","import { money, payrollClosureLabel }");
 s=once(s,"m.closureStatus==='closed'?'Cierre informado por la fuente':'Liquidación abierta / preliquidación'",'payrollClosureLabel(m.closureStatus)');
 return once(s,"m.closureStatus==='closed'?'Cierre informado':'Abierta / preliquidación'",'payrollClosureLabel(m.closureStatus)');
});
edit('.vercelignore',s=>s.split(/\r?\n/).includes('!scripts/migrations/052-payroll-detail-closure-state.sql')?s:s+'\n!scripts/migrations/052-payroll-detail-closure-state.sql\n');
