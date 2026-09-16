import {storedZip} from './clock-dashboard-zip.js';
const xml=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
const col=n=>String.fromCharCode(65+n);
const integer=new Intl.NumberFormat('es-AR');
function checked(d){if(!d||!Array.isArray(d.columns)||d.columns.length<2||d.columns.length>8||!Array.isArray(d.rows)||d.rows.length>2000||!Array.isArray(d.metadata)||d.metadata.length>30||!Array.isArray(d.notes)||d.notes.length>10||!/^municontrol_[a-z0-9_-]+$/.test(d.filename))throw Error('Reporte no válido');for(const row of d.rows){if(row.length!==d.columns.length)throw Error('Columnas inconsistentes');row.forEach((v,i)=>{const t=d.columns[i].type;if(v===null)return;if(t==='integer'&&!Number.isSafeInteger(v))throw Error('Conteo inválido');if(t==='money'&&(!/^-?\d{1,13}\.\d{2}$/.test(v)||!Number.isSafeInteger(Number(v.replace('.','')))))throw Error('Importe inválido');if(t==='text'&&(typeof v!=='string'||v.length>1000))throw Error('Texto inválido')})}if(d.salaryCost!==undefined)checkedCost(d.salaryCost);return d}
const shown=(v,c)=>v===null?'No informado':c.type==='money'?new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(v)):c.type==='integer'?integer.format(v):String(v);
const csvCell=v=>'"'+String(v??'').replace(/^[\s\u0000-\u001f]*[=+@-]/,"'$&").replaceAll('"','""')+'"';
export function reportCsv(d){checked(d);return '\ufeff'+[d.columns.map(c=>c.label),...d.rows.map(row=>row.map((v,i)=>v===null?'':d.columns[i].type==='money'?v.replace('.',','):v))].map(r=>r.map(csvCell).join(';')).join('\r\n')+'\r\n'}
function reportRowHeight(row,widths,header){return Math.max(header?32:30,...row.map((v,i)=>typeof v==='string'?lines(v,Math.max(6,Math.floor((widths[i]||23)*0.85))).length*15+10:30))}
function sheet(rows,widths,filter=false,numericTypes=[]){
 const cells=rows.map((row,i)=>`<row r="${i+1}" ht="${reportRowHeight(row,widths,i===0)}" customHeight="1">`+row.map((value,j)=>{const ref=col(j)+(i+1);if(value&&typeof value==='object'&&'formula'in value)return`<c r="${ref}" s="${value.money?3:2}"><f>${xml(value.formula)}</f><v>${value.value}</v></c>`;if(i>0&&typeof value==='number')return`<c r="${ref}" s="${numericTypes[j]==='money'?3:2}"><v>${value}</v></c>`;return`<c r="${ref}" t="inlineStr" s="${i===0?1:0}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`}).join('')+'</row>').join('');
 return`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${cells}</sheetData>${filter?`<autoFilter ref="A1:${col(widths.length-1)}${Math.max(1,rows.length)}"/>`:''}<printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.6" bottom="0.6" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;LMuniControl · consulta de datos&amp;RPágina &amp;P de &amp;N</oddFooter></headerFooter></worksheet>`;
}
export function reportXlsx(d){checked(d);
 const data=[d.columns.map(c=>c.label),...d.rows.map(r=>r.map((v,i)=>v===null?'No informado':d.columns[i].type==='money'?Number(v):v))];
 const totals=[['Control del filtro','Resultado'],['Filas exportadas',d.rows.length?{formula:`COUNTA(Datos!A2:A${data.length})`,value:d.rows.length}:0]];
 for(const j of d.totals||[]){if(!Number.isSafeInteger(j)||j<0||j>=d.columns.length||d.columns[j].type==='text')throw Error('Total no válido');const missing=d.rows.some(r=>r[j]===null);const money=d.columns[j].type==='money';const val=money?Number(d.rows.reduce((s,r)=>s+(r[j]===null?0n:BigInt(r[j].replace('.',''))),0n))/100:d.rows.reduce((s,r)=>s+(r[j]??0),0);totals.push([d.columns[j].label,missing?'No evaluable: valores ausentes':!d.rows.length?0:{formula:`SUM(Datos!${col(j)}2:${col(j)}${data.length})`,value:val,money}])}
 const names=['Datos','Totales','Control',...(d.salaryCost?['Costo salarial']:[])],control=[['Trazabilidad','Valor'],['Reporte',d.title],...d.metadata,...d.notes.map((n,i)=>['Nota '+(i+1),n])];
 const styles=`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/><color rgb="FF173B4C"/></font><font><sz val="11"/><name val="Calibri"/><b/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF143849"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 return storedZip([['[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],['xl/workbook.xml',`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n,i)=>`<sheet name="${n}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`],['xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],['xl/styles.xml',styles],['xl/worksheets/sheet1.xml',sheet(data,d.columns.map(c=>c.width||23),true,d.columns.map(c=>c.type))],['xl/worksheets/sheet2.xml',sheet(totals,[42,38])],['xl/worksheets/sheet3.xml',sheet(control,[32,100])],...(d.salaryCost?[['xl/worksheets/sheet4.xml',sheet(costSheet(d.salaryCost),[12,57,26],false,['text','text','money'])]]:[])]);
}
const chars={0x20ac:128,0x2013:150,0x2014:151,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149};
function hex(s){return '<'+[...String(s)].map(c=>{const n=c.codePointAt(0);return(n<=255?n:(chars[n]??63)).toString(16).padStart(2,'0')}).join('')+'>'}
function lines(s,max){const out=[];let current='';for(const word0 of String(s).split(/\s+/)){const words=word0.match(new RegExp('.{1,'+max+'}','g'))||[''];for(const w of words){if((current+' '+w).trim().length>max&&current){out.push(current);current=w}else current=(current+' '+w).trim()}}if(current)out.push(current);return out.length?out:['']}
export function reportPdf(d){checked(d);if(d.salaryCost&&d.layout==='compact-concepts.v1')return compactConceptPdf(d);const landscape=d.columns.length>5,W=landscape?842:595,H=landscape?595:842,left=36,width=W-72,pages=[];let ops,y;
 const text=(x,top,s,size=9,bold=false,color='0.08 0.22 0.29')=>ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${H-top} Tm ${hex(s)} Tj ET`);
 const rect=(x,top,w,h,c)=>ops.push(`${c} rg ${x} ${H-top-h} ${w} ${h} re f`);
 const footer=()=>{text(left,H-31,'MuniControl · Datos de consulta · Sin firma ni presentación oficial',8);text(W-109,H-31,'Página '+pages.length,8);text(left,H-17,(d.metadata.find(r=>r[0]==='SHA-256')?.[1]||'').slice(0,82),6.5)};
 const widths=d.columns.map(c=>(c.width||23)/d.columns.reduce((n,c)=>n+(c.width||23),0)*width);
 function head(){ops=[];pages.push(ops);rect(0,0,W,85,'0.045 0.15 0.20');rect(0,85,W,3,'0.0 0.50 0.46');text(left,27,'MuniControl | Centro de reportes',11,true,'1 1 1');text(left,56,d.title,18,true,'1 1 1');text(left,75,String(d.metadata.find(r=>r[0]==='Corte de la fuente')?.[1]||d.metadata.find(r=>r[0]==='Período')?.[1]||'Consulta'),9,false,'0.80 0.91 0.92');y=112;
  const contextKeys=new Set(['Municipio','Fuente','Estado','Tipo','Legajos de la corrida','Filas del filtro']);
  for(const [label,value] of d.metadata.filter(r=>contextKeys.has(r[0]))){
   for(const l of lines(label+': '+value,Math.floor(width/4.5))){text(left,y,l,8.5,label==='Estado');y+=12}
  }
  y+=10;
  for(const note of d.notes){for(const l of lines(note,Math.floor(width/4.5))){text(left,y,l,8);y+=11}y+=5}
  y+=8;rect(left,y,width,32,'0.09 0.24 0.30');let x=left;d.columns.forEach((c,i)=>{lines(c.label,Math.max(7,Math.floor((widths[i]-12)/4.5))).forEach((l,j)=>text(x+6,y+12+j*10,l,8,true,'1 1 1'));x+=widths[i]});y+=32;footer();
 }
 head();d.rows.forEach((r,index)=>{const parts=r.map((v,i)=>lines(shown(v,d.columns[i]),Math.max(7,Math.floor((widths[i]-12)/4.3))));const height=Math.max(...parts.map(p=>p.length))*12+14;if(y+height>H-62)head();if(index%2===0)rect(left,y,width,height,'0.94 0.97 0.97');let x=left;parts.forEach((p,i)=>{p.forEach((l,j)=>text(x+6,y+15+j*12,l,8.5,i>0&&d.columns[i].type!=='text'));x+=widths[i]});y+=height});
 if(!d.rows.length)text(left,y+25,'Sin resultados para los filtros seleccionados.',10);
 const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'],kids=[];
 for(const page of pages){const id=objects.length;const content=page.join('\n');kids.push(id+' 0 R');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id+1} 0 R >>`,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)}objects[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;let out='%PDF-1.4\n',offsets=[0];objects.slice(1).forEach((v,i)=>{offsets.push(out.length);out+=(i+1)+' 0 obj\n'+v+'\nendobj\n'});const pos=out.length;out+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;return new TextEncoder().encode(out);
}
export function saveReport(d,format){checked(d);if(!['pdf','xlsx','csv'].includes(format))throw Error('Formato inválido');const bytes=format==='pdf'?reportPdf(d):format==='xlsx'?reportXlsx(d):reportCsv(d),mime={pdf:'application/pdf',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',csv:'text/csv;charset=utf-8'}[format];const url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement('a');a.href=url;a.download=d.filename+'.'+format;a.rel='noopener';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);return a.download}


// Optional salary-cost annex. Other report types retain their current output.
const costDecimal = value => value === null || typeof value === 'string' && /^-?\d{1,14}\.\d{2}$/.test(value) && Number.isSafeInteger(Number(value.replace('.', '')));
const costCent = value => value === null ? null : BigInt(value.replace('.', ''));
const exactCostMoney = value => value === null ? 'No calculable' : '$ ' + (value.startsWith('-') ? '-' : '') + value.replace('-', '').split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + value.split('.')[1];
function checkedCost(c) {
  const codes = ['993', '994', '995', '701', '703'];
  if (!c || c.version !== 'salary-cost.v1' || c.scope !== 'complete-dataset' || c.formula !== codes.join(' + ') || c.official !== false || c.payrollModified !== false || !Array.isArray(c.components) || c.components.length !== 5) throw Error('Costo salarial inválido');
  if (!['amount', 'earnings', 'contributions'].every(k => costDecimal(c[k])) || !c.controls || !['contributionsReported','contributionsDifference','withholdings','netCalculated','netReported','netDifference'].every(k => costDecimal(c.controls[k]))) throw Error('Importe de costo inválido');
  c.components.forEach((r, i) => { if (r.code !== codes[i] || !costDecimal(r.amount) || typeof r.description !== 'string' || r.description.length > 240) throw Error('Componente de costo inválido'); });
  const sum = rows => rows.some(r => r.amount === null) ? null : rows.reduce((a, r) => a + costCent(r.amount), 0n);
  const sub = (a, b) => a === null || b === null ? null : a - b;
  const earnings = sum(c.components.slice(0, 3)), contributions = sum(c.components.slice(3));
  const net = sub(earnings, costCent(c.controls.withholdings));
  const matches = costCent(c.amount) === sum(c.components) && costCent(c.earnings) === earnings && costCent(c.contributions) === contributions && costCent(c.controls.netCalculated) === net && costCent(c.controls.contributionsDifference) === sub(costCent(c.controls.contributionsReported), contributions) && costCent(c.controls.netDifference) === sub(costCent(c.controls.netReported), net);
  const missing = c.components.filter(r => r.amount === null).map(r => r.code);
  if (!matches || JSON.stringify(missing) !== JSON.stringify(c.missingCodes)) throw Error('Costo salarial inconsistente');
}
function costSheet(c) {
  const value = amount => amount === null ? 'No informado' : Number(amount);
  const formula = (f, amount) => amount === null ? 'No calculable' : { formula: f, value: Number(amount), money: true };
  return [
    ['Código', 'Componente / control de corrida completa', 'Importe ARS'],
    ...c.components.map(r => [r.code, r.description, value(r.amount)]),
    ['', '', ''],
    ['', 'COSTO SALARIAL · 993 + 994 + 995 + 701 + 703', formula('SUM(C2:C6)', c.amount)],
    ['', '', ''],
    ['', 'Aportes patronales calculados', formula('SUM(C5:C6)', c.contributions)],
    ['990', 'Contribución patronal informada (control, no se suma)', value(c.controls.contributionsReported)],
    ['', 'Diferencia: 990 menos 701 + 703', formula('C11-C10', c.controls.contributionsDifference)],
    ['', '', ''],
    ['', 'Haberes y asignaciones', formula('SUM(C2:C4)', c.earnings)],
    ['996', 'Retenciones informadas del empleado', value(c.controls.withholdings)],
    ['', 'Neto calculado para control', formula('C14-C15', c.controls.netCalculated)],
    ['999', 'Neto a pagar informado', value(c.controls.netReported)],
    ['', 'Diferencia: 999 menos neto calculado', formula('C17-C16', c.controls.netDifference)],
    ['', '', ''],
    ['', 'Alcance: corrida completa. El filtro sólo afecta la hoja Datos.', ''],
    ['', 'Una ausencia de importe no se presume cero. No se modifica la fuente.', ''],
    ['', 'No acredita cierre, pago, firma ni una nueva liquidación.', ''],
  ];
}
function compactConceptPdf(d) {
  const W=595, H=842, left=36, width=W-72, widths=[36,207,105,64,111], pages=[];
  let ops, y;
  const text=(x,top,s,size=8.5,bold=false,color='0.08 0.22 0.29')=>ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${H-top} Tm ${hex(s)} Tj ET`);
  const rect=(x,top,w,h,color)=>ops.push(`${color} rg ${x} ${H-top-h} ${w} ${h} re f`);
  const wrap=(s,w,size=8.5)=>lines(s,Math.max(7,Math.floor(w/(size*.52))));
  const meta=key=>d.metadata.find(r=>r[0]===key)?.[1];
  function head(first) {
    ops=[];pages.push(ops);
    rect(0,0,W,first?58:43,'0.045 0.15 0.20');rect(0,first?58:43,W,3,'0.0 0.50 0.46');
    text(left,22,'MuniControl | Centro de reportes',9,true,'1 1 1');
    text(left,first?45:35,d.title,first?16:10,true,'1 1 1');y=first?79:65;
    text(left,y,`${meta('Período')} · Tipo ${meta('Tipo')} · ${meta('Legajos de la corrida')} legajos · ${meta('Estado')}`,8);y+=13;
    if(first){for(const line of wrap('Fuente: '+meta('Fuente'),width,8)){text(left,y,line,8);y+=11;}y+=8;
      const c=d.salaryCost;
      rect(left,y,width,84,'0.91 0.96 0.94');
      text(left+12,y+17,'COSTO SALARIAL · CORRIDA COMPLETA',9,true);
      text(left+12,y+42,exactCostMoney(c.amount),22,true);
      text(left+12,y+59,c.formula,9,true);
      text(left+12,y+75,'Haberes y asignaciones: '+exactCostMoney(c.earnings)+'  |  Aportes: '+exactCostMoney(c.contributions),8);
      y+=98;
      const checks=[['Control 990 menos (701 + 703)',c.controls.contributionsDifference],['Control 999 menos neto calculado',c.controls.netDifference]];
      for(const [label,v] of checks){text(left,y,label+': '+(v===null?'No evaluable':v==='0.00'?'Coincide':'Diferencia '+exactCostMoney(v)),8.5,v!==null&&v!=='0.00');y+=12;}
      if(c.missingCodes.length){text(left,y,'Costo no calculable. Importes ausentes/incompletos: '+c.missingCodes.join(', '),8.5,true);y+=13;}
      for(const note of d.notes){for(const line of wrap(note,width,7.8)){text(left,y,line,7.8);y+=10;}y+=3;}
      text(left,y,'El costo no cambia con el filtro. Los controles no ajustan la fuente.',8);y+=15;
    } else {text(left,y,`${meta('Filas del filtro')} conceptos en el detalle · continuación de la misma fuente`,8);y+=16;}
    rect(left,y,width,27,'0.09 0.24 0.30');let x=left;
    d.columns.forEach((c,i)=>{wrap(c.label,widths[i]-10,7.7).forEach((line,j)=>text(x+5,y+10+j*9,line,7.7,true,'1 1 1'));x+=widths[i];});y+=27;
  }
  head(true);
  d.rows.forEach((r,index)=>{
    const parts=r.map((v,i)=>wrap(v===null?'No informado':d.columns[i].type==='money'?exactCostMoney(v):shown(v,d.columns[i]),widths[i]-10,8.3));
    const height=Math.max(...parts.map(p=>p.length))*10.5+7;
    if(y+height>H-49)head(false);
    if(index%2===0)rect(left,y,width,height,'0.94 0.97 0.97');let x=left;
    parts.forEach((p,i)=>{p.forEach((line,j)=>text(x+5,y+11+j*10.5,line,8.3,d.columns[i].type==='money'));x+=widths[i];});y+=height;
  });
  if(!d.rows.length)text(left,y+20,'Sin conceptos en el filtro. El costo conserva el alcance de la corrida.',9);
  const saved=ops;
  for(let i=0;i<pages.length;i++){ops=pages[i];text(left,H-27,'MuniControl · Consulta interna · Sin firma ni presentación oficial',7.2);text(W-110,H-27,`Página ${i+1} de ${pages.length}`,7.2);text(left,H-14,String(meta('SHA-256')||''),6.2);}ops=saved;
  const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'],kids=[];
  for(const page of pages){const id=objects.length,content=page.join('\n');kids.push(id+' 0 R');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id+1} 0 R >>`,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);}
  objects[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;let out='%PDF-1.4\n',offsets=[0];
  objects.slice(1).forEach((v,i)=>{offsets.push(out.length);out+=(i+1)+' 0 obj\n'+v+'\nendobj\n';});const pos=out.length;
  out+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
