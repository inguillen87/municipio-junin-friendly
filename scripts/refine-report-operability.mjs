import fs from 'node:fs';
function edit(path,fn){const before=fs.readFileSync(path,'utf8'),after=fn(before);if(before!==after)fs.writeFileSync(path,after)}
function once(s,old,value){if(!s.includes(old))throw Error('REPORT_REFINEMENT_ANCHOR_MISSING: '+old.slice(0,60));return s.replace(old,value)}
edit('assets/payroll-navigation.js',s=>{
 if(s.includes('const publicationNotice='))return s;
 s=once(s,"workspaceHost.id='payrollTaskWorkspace';host.append(workspaceHost);","workspaceHost.id='payrollTaskWorkspace';const footer=host.querySelector(':scope > footer');host.insertBefore(workspaceHost,footer);const publicationNotice=host.querySelector(':scope > .notice');");
 return once(s,"label:'Resumen',nodes:[pick('runsTitle')","label:'Resumen',nodes:[publicationNotice,pick('runsTitle')");
});
edit('assets/report-centre.css',s=>s.includes('Compact payroll task header')?s:s+`\n/* Compact payroll task header; reference explanations belong to Resumen. */
.payroll-nav-ready .page-head{gap:16px;margin-bottom:18px;padding-bottom:18px}.payroll-nav-ready .page-head .page-lead{font-size:14px;line-height:1.55;max-width:780px;margin-top:10px}.payroll-nav-ready .page-head .rc-downloads{grid-column:1/-1;margin:0}.payroll-nav-ready .page-head h1{margin:4px 0 10px;font-size:30px;line-height:1.15}.payroll-nav-ready #payrollTaskWorkspace>nav{margin-top:0}.payroll-nav-ready #task-resumen>.notice{margin:0 0 20px}.payroll-nav-ready #mainContent>footer{margin-top:12px}\n`);
edit('assets/report-document.js',s=>{
 if(s.includes('function reportRowHeight'))return s;
 s=once(s,'function sheet(rows,widths,filter=false,numericTypes=[]){',`function reportRowHeight(row,widths,header){return Math.max(header?32:30,...row.map((v,i)=>typeof v==='string'?lines(v,Math.max(6,Math.floor((widths[i]||23)*0.85))).length*15+10:30))}
function sheet(rows,widths,filter=false,numericTypes=[]){`);
 s=once(s,'ht="${i===0?32:30}"','ht="${reportRowHeight(row,widths,i===0)}"');
 s=once(s,'y=112;\n  for(const note of d.notes)',`y=112;
  const contextKeys=new Set(['Municipio','Fuente','Estado','Tipo','Legajos de la corrida','Filas del filtro']);
  for(const [label,value] of d.metadata.filter(r=>contextKeys.has(r[0]))){
   for(const l of lines(label+': '+value,Math.floor(width/4.5))){text(left,y,l,8.5,label==='Estado');y+=12}
  }
  y+=10;
  for(const note of d.notes)`);
 return s;
});
edit('scripts/verify-report-centre-browser.mjs',s=>{
 if(s.includes('publication explanation belongs only to summary'))return s;
 const anchor="await page.getByRole('tab',{name:'Reportes',exact:true}).click();await page.locator('#task-reportes [data-catalog]').click();";
 s=once(s,anchor,"await page.getByRole('tab',{name:'Reportes',exact:true}).click();assert.equal(await page.locator('#publicationRuleTitle').isVisible(),false);assert.ok(await page.locator('#mainContent > footer').evaluate(el=>Boolean(el.compareDocumentPosition(document.getElementById('payrollTaskWorkspace'))&Node.DOCUMENT_POSITION_PRECEDING)));checks.push('publication explanation belongs only to summary and source footer stays below tasks');await page.locator('#task-reportes [data-catalog]').click();");
 return s;
});
