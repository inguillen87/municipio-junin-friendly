import { storedZip } from './clock-dashboard-zip.js';
import {workdayTime} from './workday-panel-model.js';
export const duration=seconds=>{if(!Number.isSafeInteger(seconds)||seconds<0)return '—';return String(Math.floor(seconds/3600)).padStart(2,'0')+':'+String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')};
const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
const continuous = data => data?.version === 'clock-workdays.v2';
const refs = interval => interval.startEventRef ? [interval.startEventRef,...interval.pauseEventRefs,interval.endEventRef] : [interval.startOrdinal,...interval.pauseOrdinals,interval.endOrdinal];
const sourceLabel = data => continuous(data) ? 'Histórico y recepciones completas en el corte consultado' : 'Captura conservada en MuniControl';
const timeCell=(row,kind,data,xlsx=false)=>{
 const seconds=continuous(data)?workdayTime(row,kind).seconds:row[kind+'Seconds'];
 return seconds===null?'No reconstruido':xlsx?{seconds}:duration(seconds);
};
const reviewLabel=(row,data)=>{
 const original=row.issues.map(i=>i.label);
 if(continuous(data)&&workdayTime(row,'extra').pending.length)original.push('Marcas extra sin tramo completo; no se asigna duración a esas marcas');
 if(continuous(data))for(const proof of row.reconstructedEvents||[]){
  if(proof.day!==row.day){const event=row.events.find(e=>e.eventRef===proof.eventRef);original.push('Marca '+event.localTimestamp+' en tramo '+(proof.kind==='extra'?'extra':'ordinario')+' del '+proof.day)}
 }
 return original.join(' | ');
};
export function workdayCsv(rows,data){
 const v2=continuous(data),head=['Fecha de inicio','Persona','Legajo','Ordinario registrado','Extra registrado','Pausas','Tramos cerrados','Estado de secuencia','Observaciones','Efecto en nómina'];
 if(v2)head.push('Fuente','Corte de lectura','Reglas','Referencias de eventos','Observaciones de fuente sin ubicación en el contexto');
 return '\ufeff'+[head,...rows.map(r=>{
  const values=[r.day,r.personLabel,r.legajo,timeCell(r,'ordinary',data),timeCell(r,'extra',data),timeCell(r,'pause',data),r.closedIntervalCount,r.status==='closed'?'Secuencia completa':'Revisar',reviewLabel(r,data),v2?'Referencia no homologada · sin aprobación salarial':'No aprobado para liquidar'];
  if(v2)values.push(sourceLabel(data),data.snapshotId,data.rules.version,r.events.map(e=>e.eventRef).join(' | '),data.observationSummary.unplaced);
  return values;
 })].map(r=>r.map(cell).join(';')).join('\r\n')+'\r\n';
}
const xml=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
function sheet(rows,widths){return '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')+'</cols><sheetData>'+rows.map((r,i)=>`<row r="${i+1}" ht="${i?32:28}" customHeight="1">`+r.map((v,j)=>typeof v==='object'&&v!==null?`<c r="${String.fromCharCode(65+j)}${i+1}" s="2"><v>${v.seconds/86400}</v></c>`:typeof v==='number'?`<c r="${String.fromCharCode(65+j)}${i+1}" s="0"><v>${v}</v></c>`:`<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr" s="${i?0:1}"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')+'</row>').join('')+'</sheetData><autoFilter ref="A1:'+String.fromCharCode(64+widths.length)+rows.length+'"/></worksheet>'}
export function workdayXlsx(data,rows){
 const names=['Jornadas','Tramos','Control'],content=[
 [['Fecha de inicio','Persona','Legajo','Tiempo ordinario','Tiempo extra','Pausas','Tramos','Estado','Observaciones'],...rows.map(r=>[r.day,r.personLabel,r.legajo,timeCell(r,'ordinary',data,true),timeCell(r,'extra',data,true),timeCell(r,'pause',data,true),r.closedIntervalCount,r.status==='closed'?'Secuencia completa':'Revisar',reviewLabel(r,data)])],
 [['Fecha de inicio','Persona','Legajo','Tipo','Entrada','Salida','Duración bruta','Pausas','Duración neta',continuous(data)?'Referencias estables de eventos':'Filas de origen'],...rows.flatMap(r=>r.intervals.map(i=>[r.day,r.personLabel,r.legajo,i.kind==='ordinary'?'Ordinario':'Extra',i.startLocal,i.endLocal,{seconds:i.elapsedSeconds},{seconds:i.pauseSeconds},{seconds:i.netSeconds},refs(i).join(', ')]))],
 [['Control','Valor'],['Alcance','Filtro completo de jornadas reconstruidas; no recibo ni novedad salarial'],['Punto',data.site?.label||'Sin punto'],['Desde',data.filters.from],['Hasta',data.filters.to],['Búsqueda',data.filters.search||'Sin búsqueda'],['Estado',({all:'Todos',review:'Revisar',closed:'Secuencia completa',extra:'Con tiempo extra',extra_open:'Marcas extra sin tramo completo',unlinked:'Sin vínculo'})[data.filters.status]],['Captura',data.snapshotId],['Reglas',data.rules.version],['Asignación diaria','Fecha de entrada del tramo; contexto previo y posterior'],['Redondeo','Ninguno; segundos exactos'],['Horas pagables','No calculadas: requiere turno y aprobación'],['Firma','Sin firma ni certificación'],['Fuente','Captura conservada en MuniControl']]
 ];
 if(continuous(data)){
  const control=content[2];
  control.find(row=>row[0]==='Captura')[0]='Corte de lectura';
  control.find(row=>row[0]==='Fuente')[1]=sourceLabel(data);
  control.push(['Homologación','Referencia no homologada · sin aprobación salarial'],['Cobertura del período','No certificada'],
   ['Integridad de fuentes seleccionadas','Capturas y lotes completos; no certifica cobertura del período'],
   ['Observaciones sin ubicación en el contexto',data.observationSummary.unplaced],
   ['Observaciones incluidas en este archivo',data.observationSummary.returned],
   ['Alcance de observaciones',data.observationSummary.hasMore?'Detalle parcial: sólo las primeras 100; ver todas las observaciones en la fuente':'Contexto del día anterior y posterior, incluidos registros sin fecha'],
   ['Persistencia del corte','Revisión comprobada al exportar; no es una captura histórica congelada']);
  names.push('Eventos','Observaciones');
  content.push([
   ['Fecha de jornada','Persona','Legajo','Referencia del evento','Fecha y hora local','Código declarado','Estado declarado','Tipo de fuente','Identificador de fuente','Fila original','Observaciones'],
   ...rows.flatMap(r=>r.events.map(e=>[r.day,r.personLabel,r.legajo,e.eventRef,e.localTimestamp,e.code,e.label,e.source.kind==='receipt'?'Recepción confirmada':'Captura histórica',e.source.id,e.source.ordinal,e.issues.join(' | ')]))
  ],[
   ['Referencia del evento','Equipo (referencia)','Fecha y hora local','Tipo de fuente','Identificador de fuente','Fila original','Observaciones'],
   ...data.observations.map(e=>[e.eventRef,e.deviceKey,e.localTimestamp,e.source.kind==='receipt'?'Recepción confirmada':'Captura histórica',e.source.id,e.source.ordinal,e.issues.join(' | ')])
  ]);
 }
 const manifest='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+names.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>';
 const styles='<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="[h]:mm:ss"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123649"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
 const widths=[[14,32,12,20,20,18,10,23,65],[14,32,12,14,23,23,20,18,20,continuous(data)?68:25],[38,95],[18,32,12,68,23,16,26,24,42,16,50],[68,68,23,24,42,16,50]];
 return storedZip([['[Content_Types].xml',manifest],['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],['xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+names.map((n,i)=>`<sheet name="${n}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets></workbook>'],['xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+names.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+'<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],['xl/styles.xml',styles],...content.map((rows,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',sheet(rows,widths[i])])]);
}
