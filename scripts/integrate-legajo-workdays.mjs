/** Deterministic source-only integration, no database, credentials or personal data. */
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');const edit=(p,fn)=>{const before=read(p),after=fn(before);if(before!==after)fs.writeFileSync(p,after)};
const one=(s,a,b)=>{if(!s.includes(a))throw Error('Missing integration anchor: '+a.slice(0,100));return s.replace(a,b)};
edit('api/internal-attendance.js',s=>{if(s.includes("resource === 'clock-workdays'"))return s;s="import { getAttendanceWorkdays } from '../lib/internal-attendance-workdays.js';\n"+s;s=one(s,'  const clockDashboard = dependencies.getAttendanceClockDashboard ?? getAttendanceClockDashboard;','  const clockDashboard = dependencies.getAttendanceClockDashboard ?? getAttendanceClockDashboard;\n  const clockWorkdays = dependencies.getAttendanceWorkdays ?? getAttendanceWorkdays;');return one(s,"        if (resource === 'clock-dashboard') {",`        if (resource === 'clock-workdays') {
          assertQueryKeys(req,new Set(['resource','site','from','to','page','pageSize','search','status','snapshot']));
          const result=await clockWorkdays(sql,access.principal,{
            site:queryValue(req,'site','pm-10'),from:queryValue(req,'from'),to:queryValue(req,'to'),
            page:queryValue(req,'page','1'),pageSize:queryValue(req,'pageSize','25'),
            search:queryValue(req,'search'),status:queryValue(req,'status','all'),snapshot:queryValue(req,'snapshot'),
          },tenantSession);
          return send(res,200,{ok:true,...result});
        }
        if (resource === 'clock-dashboard') {`)});
edit('assets/clock-dashboard-panel.html',s=>{if(s.includes('clockTabWorkdays'))return s;s=s.replace(/<article class="ck-card ck-week-card">[\s\S]*?<\/article>/,'');s=one(s,'<button id="clockTabOverview"', '<button id="clockTabWorkdays" role="tab" type="button" data-clock-tab="workdays" aria-selected="true" aria-controls="clockWorkdays">Jornadas y tiempos</button><button id="clockTabOverview"');s=s.replace('data-clock-tab="overview" aria-selected="true"','data-clock-tab="overview" aria-selected="false" tabindex="-1"').replace('>Panorama</button>','>Explorar fichadas</button>');s=one(s,'<section id="clockOverview"',read('assets/workday-panel.html')+'\n<section id="clockOverview" hidden');return s});
edit('assets/clock-dashboard.js',s=>{if(s.includes('mc:clock-data'))return s;s=s.replace("tab:'overview'","tab:'workdays'");s=s.replace("{overview:'Overview',records:'Records',issues:'IssuesWrap'}","{workdays:'Workdays',overview:'Overview',records:'Records',issues:'IssuesWrap'}");const start=s.indexOf('  const heat=data.dashboard.heatmap'),end=s.indexOf('\n }\n function render',start);if(start<0||end<0)throw Error('Heat map block missing');s=s.slice(0,start)+s.slice(end);s=s.replace("'DailyChart','Heatmap','Insights'","'DailyChart','Insights'");s=one(s,"charts(data);root.dataset.state='ready';","charts(data);root.dataset.state='ready';document.dispatchEvent(new CustomEvent('mc:clock-data',{detail:data}));");s=one(s,'function clearData(){state.data=null;','function clearData(){document.dispatchEvent(new Event(\'mc:clock-cleared\'));state.data=null;');s=s.replace("const names=['overview','records','issues'],i=names.indexOf(state.tab);tab(e.key==='Home'?names[0]:e.key==='End'?names[2]:names[(i+(e.key==='ArrowRight'?1:2))%3],true)","const names=['workdays','overview','records','issues'],i=names.indexOf(state.tab);tab(e.key==='Home'?names[0]:e.key==='End'?names[3]:names[(i+(e.key==='ArrowRight'?1:3))%4],true)");s=s.replace("$('Search').value='';tab('overview');","$('Search').value='';tab('workdays');");return s});
edit('relojes-marcaciones.html',s=>{if(s.includes('data-workday-release'))return s;const start=s.indexOf('<section id="clockOperations"'),end=s.indexOf('</div></section>',start);if(start<0||end<0)throw Error('Dashboard panel boundaries missing');s=s.slice(0,start)+read('assets/clock-dashboard-panel.html')+s.slice(end+'</div></section>'.length);s=one(s,'<link rel="stylesheet" href="assets/clock-dashboard.css">','<link rel="stylesheet" href="assets/clock-dashboard.css">\n<link rel="stylesheet" href="assets/workday-panel.css">');return one(s,'<script type="module" src="assets/clock-dashboard.js"></script>','<script type="module" src="assets/workday-panel.js"></script>\n<script type="module" src="assets/clock-dashboard.js"></script>')});
edit('internal-dashboard.html',s=>{if(s.includes('data-payroll-summary-download'))return s;s=one(s,'        actions.append(payroll, novelty, calculate, request, absence);',`        const downloads = create('button', 'button', 'Descargar haberes por mes');
        downloads.type='button';downloads.disabled=payroll.disabled;
        downloads.title='Abrir períodos y descargar un resumen PDF; el recibo firmado requiere emisión autorizada';
        downloads.addEventListener('click',function(){payroll.click();});
        actions.append(payroll, downloads, novelty, calculate, request, absence);`);
 s=one(s,'        actions.append(actionContext, novelty);',`        const summaryDownload=create('button','button','Descargar resumen · PDF');
        summaryDownload.type='button';summaryDownload.dataset.payrollSummaryDownload='true';
        summaryDownload.disabled=!state.tenantCapabilities.has('workforce.employee.read')||!state.tenantCapabilities.has('payroll.read');
        summaryDownload.title='Totales del período consultado, sin firma ni certificación de pago';
        summaryDownload.addEventListener('click',async function(){
          if(summaryDownload.disabled)return;
          summaryDownload.disabled=true;
          try{
            const module=await import('./assets/payroll-summary-pdf.js');
            if(!state.tenantCapabilities.has('workforce.employee.read')||!state.tenantCapabilities.has('payroll.read')||!summaryDownload.isConnected)throw new Error('La ficha ya no está disponible');
            module.downloadPayrollSummary({name:employee.name,legajo:employee.legajo},item);
          }catch(error){toast('No se generó el resumen: '+error.message,'error');}
          finally{summaryDownload.disabled=!state.tenantCapabilities.has('workforce.employee.read')||!state.tenantCapabilities.has('payroll.read');}
        });
        actions.append(actionContext, summaryDownload, novelty);`);
 return s.replace('Totales mensuales reales del legajo. Resumen de fuente; no es un recibo oficial.','Consultá períodos y descargá el resumen PDF. El recibo oficial firmado requiere emisión autorizada.');
});
edit('centro-acciones.html',s=>{if(s.includes('MuniControlActionLanguage'))return s;s=one(s,'  <script src="assets/internal-guide.js" defer></script>','  <script src="assets/internal-guide.js" defer></script>\n  <script src="assets/action-language.js"></script>');s=one(s,'      function titleCase(value) {',`      var actionLanguage = window.MuniControlActionLanguage;
      function leaveReasonText(detail) {
        var code=detail.leave.reasonCode;
        var match=state.bootstrap&&state.bootstrap.reasons&&state.bootstrap.reasons.find(function(r){return String(r.code||r.value)===String(code)&&(!detail.leave.policyVersionId||r.policyVersionId===detail.leave.policyVersionId);});
        return actionLanguage.reason(detail.leave.reasonLabel||(match&&match.label),code);
      }
      function titleCase(value) {`);
 s=s.replaceAll('detail.leave.reasonLabel || detail.leave.reasonCode','leaveReasonText(detail)');s=s.replaceAll('titleCase(detail.confidentiality)',"actionLanguage.label(detail.confidentiality,'Clasificación no informada')");s=s.replaceAll('titleCase(value.confidentiality)',"actionLanguage.label(value.confidentiality,'Clasificación no informada')");s=s.replaceAll('titleCase(detail.leave.calculationStatus)','actionLanguage.label(detail.leave.calculationStatus)');s=s.replaceAll('titleCase(detail.leave.evidenceStatus)','actionLanguage.label(detail.leave.evidenceStatus)');s=s.replaceAll('Gates de cálculo y decisión','Controles para resolver la solicitud');s=s.replaceAll("fact('Política',detail.leave.policyVersionId || 'No informada')","fact('Régimen de referencia',actionLanguage.policy(detail.leave.policyVersionId))");s=s.replaceAll("fact('Regla',detail.leave.policyRuleId || 'No informada')","fact('Tipo de regla',actionLanguage.label(detail.leave.policyRuleId,'Regla pendiente de identificación'))");s=s.replaceAll("fact('Etapa',detail.stage || 'No informada')","fact('Etapa',actionLanguage.label(detail.stage,'Etapa no informada'))");s=s.replaceAll("item.status + (item.createdAt ?","actionLanguage.label(item.status) + (item.createdAt ?");
 return s;
});
edit('scripts/build-friendly.mjs',s=>{for(const f of ['assets/action-language.js','assets/payroll-summary-pdf.js','assets/workday-panel.js','assets/workday-panel.css','assets/workday-export.js'])if(!s.includes("'"+f+"'"))s=one(s,"  'assets/internal-capability-gate.js',","  'assets/internal-capability-gate.js',\n  '"+f+"',");return s});
edit('scripts/verify-clock-dashboard-browser.mjs',s=>s.replace("assert.equal(await page.locator('.ck-heat-cell').count(),168)","assert.equal(await page.locator('.ck-heat-cell').count(),0)").replace("checks.push('hour chart and weekly matrix')","checks.push('hour chart; weekly matrix removed')"));
