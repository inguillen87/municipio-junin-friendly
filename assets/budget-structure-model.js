/** Literal GRH report adapter. No approved quota, payroll, vacancy or employment-status inference. */
export const STRUCTURE_COLUMNS=Object.freeze(['Id','JUR','REG','AGR','TRAM','SUBT','CARGO','Denominación','Cant','Clas','Estado','Vacante']);
export const STRUCTURE_LIMITS=Object.freeze({bytes:8*1024*1024,pages:120,items:40000,groups:1000,assignments:10000});
const bounds=[35,110,157,198,235,271,307,369,638,672,704,753,822];
const fold=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const fail=code=>{throw Object.assign(Error('No se pudo verificar la estructura del reporte.'),{code})};
const clean=s=>{if(typeof s!=='string'||s.length>400||/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(s))fail('STRUCTURE_TEXT');return s.trim().replace(/\s+/g,' ')};
const digits=s=>/^\d{1,10}$/.test(s);
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
function dateStamp(s){
 const m=/^(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2}) (AM|PM)$/.exec(s);
 if(!m||+m[4]<1||+m[4]>12||+m[5]>59)fail('STRUCTURE_DATE');
 const iso=m[3]+'-'+m[2]+'-'+m[1],d=new Date(iso+'T00:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==iso)fail('STRUCTURE_DATE');
 return s; // The report does not declare its timezone or the approved budget exercise.
}
export function parseBudgetStructure(pages,{sha256}={}){
 if(!sha(sha256)||!Array.isArray(pages)||!pages.length||pages.length>STRUCTURE_LIMITS.pages)fail('STRUCTURE_INPUT');
 const groups=[],ids=new Set();let current=null,issuedAt='',itemCount=0,assignments=0;
 for(const [index,page]of pages.entries()){
  if(!page||!Number.isFinite(page.width)||!Number.isFinite(page.height)||page.number!==index+1||Math.abs(page.width-842)>2||Math.abs(page.height-595)>2||!Array.isArray(page.items))fail('STRUCTURE_PAGE');
  itemCount+=page.items.length;if(itemCount>STRUCTURE_LIMITS.items)fail('STRUCTURE_LIMIT');
  const items=page.items.map(t=>{
   if(!t||!Number.isFinite(t.x)||!Number.isFinite(t.y)||t.x<0||t.x>842||t.y<0||t.y>595)fail('STRUCTURE_COORDINATE');
   return{text:clean(t.text),x:t.x,y:t.y};
  }).filter(t=>t.text);
  if(items.filter(t=>t.y<100&&t.text==='ESTRUCTURA PRESUPUESTARIA DE CARGOS').length!==1
   ||items.filter(t=>t.y<100&&t.text==='Número Página: '+page.number).length!==1
   ||items.filter(t=>t.y>550&&t.text==='MUNICIPALIDAD DE JUNIN - MENDOZA - PRESUPUESTO DE CARGOS').length!==1)fail('STRUCTURE_HEADER');
  const stamps=items.filter(t=>t.x>640&&t.y<100&&/^\d{2}\/\d{2}\/\d{4}/.test(t.text));
  if(stamps.length!==1)fail('STRUCTURE_DATE');const stamp=dateStamp(stamps[0].text);
  if(issuedAt&&stamp!==issuedAt)fail('STRUCTURE_MIXED_DATES');issuedAt=stamp;
  const headers=items.filter(t=>t.y>105&&t.y<119).sort((a,b)=>a.x-b.x);
  if(headers.length!==12||headers.some((t,i)=>t.text!==STRUCTURE_COLUMNS[i]||t.x<bounds[i]||t.x>=bounds[i+1]))fail('STRUCTURE_COLUMNS');
  const body=items.filter(t=>t.y>=125&&t.y<=547).sort((a,b)=>a.y-b.y||a.x-b.x),lines=[];
  for(const t of body){let row=lines.at(-1);if(!row||Math.abs(row.y-t.y)>1){row={y:t.y,items:[]};lines.push(row)}row.items.push(t)}
  for(const line of lines){
   const tokens=line.items.sort((a,b)=>a.x-b.x);
   if(tokens[0].x<110){
    const cells=STRUCTURE_COLUMNS.map(()=>[]);
    for(const t of tokens){const column=bounds.findIndex((b,i)=>i<12&&t.x>=b&&t.x<bounds[i+1]);if(column<0)fail('STRUCTURE_ROW');cells[column].push(t.text)}
    const values=cells.map(c=>c.join(' '));
    if(values.slice(0,7).some(v=>!digits(v))||!digits(values[8])||values.some((v,i)=>!v&&i!==9)||values[9]!==''&&!/^\d{1,5}(?:-[A-Z])?$/.test(values[9])||ids.has(values[0]))fail('STRUCTURE_ROW');
    ids.add(values[0]);current={values,sourcePage:page.number,members:[]};groups.push(current);
    if(groups.length>STRUCTURE_LIMITS.groups)fail('STRUCTURE_LIMIT');
   }else{
    if(tokens.length===2&&tokens[0].text==='LEGAJO'&&tokens[1].text==='NOMBRE'&&Math.abs(tokens[0].x-375)<2&&Math.abs(tokens[1].x-445)<2)continue;
    if(!current||tokens.length<2||Math.abs(tokens[0].x-375)>2||!digits(tokens[0].text)||Math.abs(tokens[1].x-445)>2||tokens.slice(1).some(t=>t.x<443))fail('STRUCTURE_MEMBER');
    const name=clean(tokens.slice(1).map(t=>t.text).join(' '));if(!name||current.members.some(m=>m.number===tokens[0].text))fail('STRUCTURE_MEMBER_DUPLICATE');
    current.members.push({number:tokens[0].text,name,sourcePage:page.number});assignments++;
    if(assignments>STRUCTURE_LIMITS.assignments)fail('STRUCTURE_LIMIT');
   }
  }
 }
 if(!groups.length)fail('STRUCTURE_EMPTY');
 return verifyBudgetStructure({version:'budget-structure-source.v1',sha256,issuedAt,sourcePages:pages.length,issuer:'MUNICIPALIDAD DE JUNIN - MENDOZA',groups});
}
export function verifyBudgetStructure(d){
 if(d?.version!=='budget-structure-source.v1'||!sha(d.sha256)||d.issuer!=='MUNICIPALIDAD DE JUNIN - MENDOZA'||!Number.isSafeInteger(d.sourcePages)||d.sourcePages<1||d.sourcePages>STRUCTURE_LIMITS.pages||!Array.isArray(d.groups)||!d.groups.length||d.groups.length>STRUCTURE_LIMITS.groups)fail('STRUCTURE_DATA');dateStamp(d.issuedAt);
 const ids=new Set();let total=0;
 for(const g of d.groups){
  if(!Array.isArray(g.values)||g.values.length!==12||g.values.some((v,i)=>clean(v)!==v||!v&&i!==9)||g.values.slice(0,7).some(v=>!digits(v))||!digits(g.values[8])||g.values[9]!==''&&!/^\d{1,5}(?:-[A-Z])?$/.test(g.values[9])||ids.has(g.values[0])||!Number.isInteger(g.sourcePage)||g.sourcePage<1||g.sourcePage>d.sourcePages||!Array.isArray(g.members))fail('STRUCTURE_GROUP');
  ids.add(g.values[0]);const members=new Set();
  for(const m of g.members){if(!digits(m.number)||!m.name||clean(m.name)!==m.name||members.has(m.number)||!Number.isInteger(m.sourcePage)||m.sourcePage<g.sourcePage||m.sourcePage>d.sourcePages)fail('STRUCTURE_MEMBER');members.add(m.number)}
  total+=g.members.length;if(total>STRUCTURE_LIMITS.assignments)fail('STRUCTURE_LIMIT');
 }
 return d;
}
export function structureView(raw,{query='',order='source',mode='detailed'}={}){
 const d=verifyBudgetStructure(raw);if(typeof query!=='string'||query.length>120||!['source','number','name'].includes(order)||!['simple','detailed'].includes(mode))fail('STRUCTURE_FILTER');
 const q=fold(query.trim()),byName=new Intl.Collator('es-AR',{sensitivity:'base',numeric:true});
 const groups=d.groups.filter(g=>!q||fold([...g.values,...g.members.flatMap(m=>[m.number,m.name])].join(' ')).includes(q)).map(g=>{
  const members=g.members.slice();if(order!=='source')members.sort((a,b)=>order==='number'?Number(a.number)-Number(b.number)||byName.compare(a.name,b.name):byName.compare(a.name,b.name)||Number(a.number)-Number(b.number));
  return{...g,members,quantityMatchesDetail:Number(g.values[8])===members.length};
 });
 const numbers=groups.flatMap(g=>g.members.map(m=>m.number));
 return{groups,mode,order,query:query.trim(),sourceGroups:d.groups.length,visibleGroups:groups.length,assignments:numbers.length,distinctNumbers:new Set(numbers).size,reportedQuantity:groups.reduce((s,g)=>s+Number(g.values[8]),0),zeroQuantityGroups:groups.filter(g=>g.values[8]==='0').length,mismatchedGroups:groups.filter(g=>!g.quantityMatchesDetail).length};
}
