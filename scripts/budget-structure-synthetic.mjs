/** Entirely invented source records. This fixture is never included in the public build. */
import {STRUCTURE_COLUMNS} from '../assets/budget-structure-model.js';
const xs=[49,125,166,208,247,282,326,375,650,683,716,770];
const item=(text,x,y)=>({text:String(text),x,y});
const page=number=>({number,width:842,height:595,items:[item('ESTRUCTURA PRESUPUESTARIA DE CARGOS',220,60),item('Número Página: '+number,700,96),item('23/09/2026 12:20 PM',700,79),...STRUCTURE_COLUMNS.map((s,i)=>item(s,xs[i],112)),item('MUNICIPALIDAD DE JUNIN - MENDOZA - PRESUPUESTO DE CARGOS',170,570)]});
const values=(id,title,count)=>[String(id),'1','00','00','00','00','00',title,String(count),'12-H','Ocupado','Titular'];
const group=(p,y,v)=>p.items.push(...v.map((s,i)=>item(s,xs[i],y)));
const member=(p,y,number,name)=>p.items.push(item(number,375,y),item(name,445,y));
export function syntheticStructurePages(){
 const pages=[page(1),page(2),page(3)];
 group(pages[0],140,values(1,'ÁREA SINTÉTICA PRINCIPAL',30));
 pages[0].items.push(item('LEGAJO',375,160),item('NOMBRE',445,160));
 for(let i=0;i<18;i++)member(pages[0],180+i*18,String(i+1).padStart(4,'0'),'PERSONA QA '+String(i+1).padStart(3,'0'));
 for(let i=18;i<30;i++)member(pages[1],140+(i-18)*18,String(i+1).padStart(4,'0'),'PERSONA QA '+String(i+1).padStart(3,'0'));
 group(pages[1],385,values(2,'CARGO SINTÉTICO CERO',0));
 group(pages[1],420,values(3,'CARGO CON OBSERVACIÓN',0));member(pages[1],440,'0031','NOMBRE QA REPETIDO');
 for(let i=4;i<=7;i++){const y=140+(i-4)*80;group(pages[2],y,values(i,'ESTRUCTURA QA '+i,1));member(pages[2],y+23,String(i+30).padStart(4,'0'),i===4?'NOMBRE QA REPETIDO':'PERSONA QA '+i);}
 return pages;
}
export function syntheticStructurePdf(pages=syntheticStructurePages()){
 const hex=s=>'<'+Array.from(s,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('')+'>';
 const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'],kids=[];
 for(const p of pages){const id=objects.length,stream=p.items.map(i=>`BT /F1 8 Tf 1 0 0 1 ${i.x} ${595-i.y} Tm ${hex(i.text)} Tj ET`).join('\n');kids.push(id+' 0 R');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id+1} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);}
 objects[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;let output='%PDF-1.4\n',offsets=[0];for(let i=1;i<objects.length;i++){offsets.push(output.length);output+=i+' 0 obj\n'+objects[i]+'\nendobj\n'}const xref=output.length;output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(output);
}
