// Idempotent, source-only integration. Used once to generate tracked changes;
// kept as a reproducible migration helper. Never reads credentials or data.
import fs from 'node:fs';
function update(path,fn){const before=fs.readFileSync(path,'utf8'),after=fn(before);if(after!==before)fs.writeFileSync(path,after);}
function replaceOne(s,anchor,replacement){if(!s.includes(anchor))throw new Error('Integration anchor missing; review source before changing it');return s.replace(anchor,replacement)}
update('api/internal-attendance.js',s=>{
 if(s.includes("resource === 'clock-operations'"))return s;
 s="import { getAttendanceClockOperations } from '../lib/internal-attendance-clock-operations.js';\n"+s;
 s=replaceOne(s,'  const apply = dependencies.applyAttendanceCommand ?? applyAttendanceCommand;','  const apply = dependencies.applyAttendanceCommand ?? applyAttendanceCommand;\n  const clockOperations = dependencies.getAttendanceClockOperations ?? getAttendanceClockOperations;');
 return replaceOne(s,"        if (resource === 'bootstrap') {",`        if (resource === 'clock-operations') {
          assertQueryKeys(req, new Set(['resource', 'site', 'from', 'to', 'page', 'pageSize']));
          const result = await clockOperations(sql, access.principal, {
            site: queryValue(req, 'site', 'pm-10'),
            from: queryValue(req, 'from'), to: queryValue(req, 'to'),
            page: queryValue(req, 'page', '1'), pageSize: queryValue(req, 'pageSize', '50'),
          }, tenantSession);
          return send(res, 200, { ok: true, ...result });
        }
        if (resource === 'bootstrap') {`);
});
update('relojes-marcaciones.html',s=>{
 if(s.includes('id="clockOperations"'))return s;
 s=replaceOne(s,'  <style>','  <link rel="stylesheet" href="assets/attendance-clock-operations.css">\n  <script src="assets/attendance-clock-operations.js" defer></script>\n  <style>');
 s=replaceOne(s,'        <section class="truth-strip"',fs.readFileSync('assets/attendance-clock-panel.html','utf8')+'\n        <section class="truth-strip"');
 s=replaceOne(s,'renderResourceCopy();renderSummary();await Promise.all([loadReportedInventory(),loadList()])',"renderResourceCopy();renderSummary();document.dispatchEvent(new Event('mc:attendance-ready'));await Promise.all([loadReportedInventory(),loadList()])");
 s=replaceOne(s,'popup.append(title,list,pending);return popup}',"var open=document.createElement('button');open.type='button';open.className='button';open.textContent='Ver marcaciones de '+site.code;open.addEventListener('click',function(){document.dispatchEvent(new CustomEvent('mc:attendance-site',{detail:{site:site.code.toLowerCase()}}))});popup.append(title,list,pending,open);return popup}");
 s=replaceOne(s,"connected?'Hardware con recepción reciente confirmada':'Equipos todavía no conectados'","connected?'Hardware con recepción reciente confirmada':number(summary.punchCount)>0?'Fichadas recibidas · automatización pendiente':'Equipos todavía no conectados'");
 return replaceOne(s,"'El backend no informó recepción reciente desde un reloj físico activo. El inventario relevado permanece separado de los datos operativos.'","number(summary.punchCount)>0?'Hay marcaciones guardadas en MuniControl. No hay un colector con recepción reciente confirmada; consultá la fecha de extracción de cada captura.':'El backend no informó recepción reciente desde un reloj físico activo. El inventario relevado permanece separado de los datos operativos.'");
});
update('scripts/build-friendly.mjs',s=>s.includes("'assets/attendance-clock-operations.js'")?s:replaceOne(s,"  'assets/internal-capability-gate.js',","  'assets/internal-capability-gate.js',\n  'assets/attendance-clock-operations.css',\n  'assets/attendance-clock-operations.js',"));
