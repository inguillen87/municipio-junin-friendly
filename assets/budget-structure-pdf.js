import {STRUCTURE_COLUMNS,verifyBudgetStructure,structureView} from './budget-structure-model.js';
const extra={0x20ac:128,0x2013:150,0x2014:151,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149};
const hex=s=>'<'+[...String(s)].map(c=>{const n=c.codePointAt(0),b=n>=32&&n<=255?n:extra[n];if(b===undefined)throw Error('El PDF contiene caracteres que esta exportación no puede representar. Conservá el original.');return b.toString(16).padStart(2,'0')}).join('')+'>';
const wrap=(value,max)=>{const result=[];let line='';for(const part of String(value).split(/\s+/)){for(const word of part.match(new RegExp('.{1,'+max+'}','gu'))??['']){if(line&&(line+' '+word).length>max){result.push(line);line=word}else line=(line+' '+word).trim()}}if(line)result.push(line);return result.length?result:['']};
/** Fixed twelve-column source report, not a signed receipt or a certified budget reconciliation. */
export function budgetStructurePdf(raw,filters={}){
 const data=verifyBudgetStructure(raw),view=structureView(data,filters),W=842,H=595,L=28,BOTTOM=548;
 const widths=[30,28,30,30,35,35,42,297,40,43,84,92]; // sum 886 scaled into the printable band
 const scale=(W-L*2)/widths.reduce((a,b)=>a+b,0),sizes=widths.map(n=>n*scale),pages=[];let ops,y,current=null;
 const text=(x,top,s,size=8,bold=false,color='0.08 0.18 0.22')=>ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${(H-top).toFixed(2)} Tm ${hex(s)} Tj ET`);
 const rect=(x,top,w,h,color)=>ops.push(`${color} rg ${x.toFixed(2)} ${(H-top-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
 const putLines=(s,size=7.5)=>{for(const line of wrap(s,Math.floor((W-L*2)/(size*.55)))){text(L,y,line,size);y+=size+3}};
 function header(){
  ops=[];pages.push(ops);rect(0,0,W,58,'0.06 0.18 0.23');text(L,21,'MuniControl | Reporte documental',10,true,'1 1 1');text(L,43,'Estructura presupuestaria de cargos',17,true,'1 1 1');y=75;
  putLines(data.issuer+' | Emisión informada: '+data.issuedAt);putLines('Vista '+(view.mode==='simple'?'simple':'detallada')+' | Orden: '+({source:'original',number:'número de legajo',name:'alfabético'})[view.order]+' | '+view.visibleGroups+' de '+view.sourceGroups+' estructuras | '+view.assignments+' filas nominales | Cant informada: '+view.reportedQuantity);
  putLines('Búsqueda: '+(view.query||'sin filtro')+'. Se incluyen completos los cargos coincidentes.');
  putLines('Fuente documental: no acredita cupo anual aprobado, cargo liquidado, pago ni vigencia del legajo. Cant y Estado se conservan sin reinterpretar.');
  rect(L,y,W-L*2,24,'0.09 0.25 0.30');let x=L;
  STRUCTURE_COLUMNS.forEach((label,i)=>{text(x+3,y+15,label,7.4,true,'1 1 1');x+=sizes[i]});y+=24;
 }
 function group(g,continuation=false){
  const parts=g.values.map((v,i)=>wrap(v,Math.max(2,Math.floor((sizes[i]-7)/(7.6*.56))))),height=Math.max(1,...parts.map(a=>a.length))*10+10;
  if(y+height+(!continuation&&view.mode==='detailed'&&g.members.length?25:0)>BOTTOM)header();
  rect(L,y,W-L*2,height,'0.89 0.94 0.94');let x=L;
  parts.forEach((p,i)=>{p.forEach((s,j)=>text(x+3,y+12+j*10,s,7.6,i===7));x+=sizes[i]});y+=height;
  if(view.mode==='detailed'){
   text(L+6,y+11,'Fuente pág. '+g.sourcePage+(continuation?' | continuación':''),7);
   text(L+120,y+11,'LEGAJO',7.5,true);text(L+190,y+11,'NOMBRE',7.5,true);text(W-L-64,y+11,'Pág. fuente',7,true);y+=18;
  }
 }
 header();
 if(!view.groups.length)putLines('Sin resultados para la búsqueda elegida.');
 for(const g of view.groups){current=g;group(g);
  if(view.mode==='detailed'){
   if(!g.members.length){text(L+120,y+10,'Sin detalle nominal en el archivo; no implica vacante.',8);y+=19;}
   for(const [i,m]of g.members.entries()){
    const lines=wrap(m.name,Math.floor((W-L-80-(L+190))/(8*.55))),height=lines.length*11+5;
    if(y+height>BOTTOM){header();group(current,true)}
    if(i%2===0)rect(L+115,y,W-L*2-115,height,'0.96 0.97 0.97');text(L+120,y+10,m.number,8);
    lines.forEach((s,j)=>text(L+190,y+10+j*11,s,8));text(W-L-53,y+10,m.sourcePage,8);y+=height;
   }
   if(!g.quantityMatchesDetail){if(y+20>BOTTOM){header();group(current,true)}text(L+6,y+12,'Observación: Cant informada y filas nominales no coinciden; se conserva la fuente.',7.5,true);y+=20;}
  }y+=5;
 }
 for(const [i,page]of pages.entries()){ops=page;text(L,570,'Consulta documental | Sin firma ni homologación presupuestaria | Página '+(i+1)+' de '+pages.length,7);text(L,584,'SHA-256 del PDF fuente: '+data.sha256,6.5);}
 const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'],kids=[];
 for(const page of pages){const id=objects.length,content=page.join('\n');kids.push(id+' 0 R');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id+1} 0 R >>`,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)}
 objects[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;let out='%PDF-1.4\n',offsets=[0];objects.slice(1).forEach((v,i)=>{offsets.push(out.length);out+=(i+1)+' 0 obj\n'+v+'\nendobj\n'});const at=out.length;
 out+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`;
 return new TextEncoder().encode(out);
}
