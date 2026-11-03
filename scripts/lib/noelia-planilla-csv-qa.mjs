// QA-only validator for the actual complete classified planilla download.
// Expected participants come from the original closed snapshot, never this CSV.
import assert from 'node:assert/strict';
const CONTEXT=Object.freeze(['Períodos','Jurisdicción elegida','Repartición elegida','Convenio elegido','Rangos','Selección de legajos']);
function csvRows(csv){
 assert.equal(typeof csv,'string','QA_NOELIA_CSV_TEXT');
 assert.ok(csv.startsWith('\ufeff')&&csv.endsWith('\r\n'),'QA_NOELIA_CSV_COMPLETE');
 const rows=[];let cells=[],cell='',state='start';
 const push=()=>{cells.push(cell);cell='';state='start';};
 for(let i=1;i<csv.length;i++){
  const ch=csv[i];
  if(state==='quoted'){
   if(ch==='"'){if(csv[i+1]==='"'){cell+='"';i++;}else state='closed';}
   else cell+=ch;
   continue;
  }
  if(ch===';'){push();continue;}
  if(ch==='\r'){
   assert.equal(csv[++i],'\n','QA_NOELIA_CSV_RECORD_END');
   push();rows.push(cells);cells=[];continue;
  }
  assert.notEqual(ch,'\n','QA_NOELIA_CSV_RECORD_END');
  assert.notEqual(state,'closed','QA_NOELIA_CSV_AFTER_QUOTE');
  if(ch==='"'){assert.equal(state,'start','QA_NOELIA_CSV_QUOTE');state='quoted';}
  else{cell+=ch;state='unquoted';}
 }
 assert.ok(state==='start'&&cell===''&&cells.length===0&&rows.length>0,'QA_NOELIA_CSV_TRUNCATED');
 return rows;
}
export function assertNoeliaClassifiedPlanillaCsv(csv,{jurisdiction,employeeNumbers,context}){
 assert.ok(['42','55'].includes(jurisdiction),'QA_NOELIA_CSV_SCOPE');
 assert.ok(Array.isArray(employeeNumbers)&&employeeNumbers.length>0&&employeeNumbers.every(n=>typeof n==='string'&&n.length>0)&&new Set(employeeNumbers).size===employeeNumbers.length,'QA_NOELIA_CSV_EXPECTED_COHORT');
 assert.ok(context&&Object.keys(context).sort().join('|')===[...CONTEXT].sort().join('|')&&Object.values(context).every(v=>typeof v==='string'),'QA_NOELIA_CSV_EXPECTED_CONTEXT');
 const [header,...rows]=csvRows(csv);
 assert.ok(header.every(h=>h.length>0)&&new Set(header).size===header.length,'QA_NOELIA_CSV_HEADER');
 const required=['Legajo','Jurisdicción conservada',...CONTEXT],indices=new Map();
 for(const key of required){const index=header.indexOf(key);assert.ok(index>=0,'QA_NOELIA_CSV_HEADER: '+key);indices.set(key,index);}
 assert.equal(rows.length,employeeNumbers.length,'QA_NOELIA_CSV_COHORT_COUNT');
 for(const row of rows){
  assert.equal(row.length,header.length,'QA_NOELIA_CSV_COLUMNS');
  assert.equal(row[indices.get('Jurisdicción conservada')],jurisdiction,'QA_NOELIA_CSV_JURISDICTION');
  for(const key of CONTEXT)assert.equal(row[indices.get(key)],context[key],'QA_NOELIA_CSV_CONTEXT: '+key);
 }
 const actual=rows.map(row=>row[indices.get('Legajo')]);
 assert.deepEqual([...actual].sort(),[...employeeNumbers].sort(),'QA_NOELIA_CSV_COHORT');
 return{header,rows,employeeNumbers:actual};
}
