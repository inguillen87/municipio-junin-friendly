// Comparación de definiciones de PostgreSQL entre el respaldo y la restauración.
// Únicamente reconoce casts de arrays de constantes varchar a text; no ejecuta SQL.
function tokenize(sql) {
 if(typeof sql!=='string'||sql.length>1024*1024)throw Error('RESTORATION_EXPRESSION_INVALID');
 const tokens=[];let pos=0;
 const add=(kind,start,end)=>{tokens.push({kind,text:sql.slice(start,end),start,end});pos=end;};
 while(pos<sql.length){
  const start=pos,c=sql[pos];if(/\s/.test(c)){pos++;continue;}
  if(sql.startsWith('--',pos)){const end=sql.indexOf('\n',pos);add('protected',start,end<0?sql.length:end);continue;}
  if(sql.startsWith('/*',pos)){let end=pos+2,depth=1;while(end<sql.length&&depth){if(sql.startsWith('/*',end)){depth++;end+=2;}else if(sql.startsWith('*/',end)){depth--;end+=2;}else end++;}add('protected',start,end);continue;}
  const dollar=/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.exec(sql.slice(pos));
  if(dollar){const end=sql.indexOf(dollar[0],pos+dollar[0].length);add('protected',start,end<0?sql.length:end+dollar[0].length);continue;}
  const escaped=/^[eEbBxX]'/.test(sql.slice(pos,pos+2));
  if(c==="'"||c==='"'||escaped){const quote=escaped?"'":c;let end=pos+(escaped?2:1),closed=false;
   while(end<sql.length){if(escaped&&sql[end]==='\\'){end+=2;continue;}if(sql[end]===quote){if(sql[end+1]===quote){end+=2;continue;}end++;closed=true;break;}end++;}
   add(closed&&!escaped&&quote==="'"?'literal':'protected',start,Math.min(end,sql.length));continue;
  }
  const word=/^[A-Za-z_][A-Za-z_0-9$]*/.exec(sql.slice(pos));if(word){add('word',start,pos+word[0].length);continue;}
  if(sql.startsWith('::',pos)){add('symbol',start,pos+2);continue;}add('symbol',start,pos+1);
 }
 return tokens;
}
export function canonicalRestorationExpression(sql){
 const tokens=tokenize(sql);
 const word=(i,v)=>tokens[i]?.kind==='word'&&tokens[i].text.toLowerCase()===v;
 const sym=(i,v)=>tokens[i]?.kind==='symbol'&&tokens[i].text===v;
 const literal=i=>tokens[i]?.kind==='literal'||word(i,'null');
 const varchar=i=>word(i,'character')&&word(i+1,'varying')?i+2:word(i,'varchar')?i+1:null;
 function candidate(start,individual){
  let i=start;if(!individual){if(!sym(i,'('))return null;i++;}
  if(!word(i,'array')||!sym(i+1,'['))return null;i+=2;const values=[];
  for(;;){if(individual){if(!sym(i,'('))return null;i++;}
   if(!literal(i)||!sym(i+1,'::'))return null;const value=tokens[i].text;i+=2;i=varchar(i);if(i===null)return null;
   if(individual){if(!sym(i,')')||!sym(i+1,'::')||!word(i+2,'text'))return null;i+=3;}
   values.push(value);if(sym(i,',')){i++;continue;}if(!sym(i,']'))return null;i++;break;
  }
  if(!individual){if(!sym(i,')')||!sym(i+1,'::')||!word(i+2,'text')||!sym(i+3,'[')||!sym(i+4,']'))return null;i+=5;}
  return {end:i,text:'ARRAY['+values.map(v=>v+'::text').join(', ')+']'};
 }
 let result='',last=0,replacements=0;
 for(let i=0;i<tokens.length;i++){const match=candidate(i,false)||candidate(i,true);if(!match)continue;result+=sql.slice(last,tokens[i].start)+match.text;last=tokens[match.end-1].end;i=match.end-1;replacements++;}
 const boolean=booleanGroups(result+sql.slice(last));
 return {sql:boolean.sql,replacements:replacements+boolean.replacements};
}
function booleanGroups(sql){
 const tokens=tokenize(sql),pairs=new Map(),stack=[],cache=new Map();let replacements=0;
 for(let i=0;i<tokens.length;i++){if(tokens[i].kind!=='symbol')continue;if(tokens[i].text==='(')stack.push(i);else if(tokens[i].text===')'){if(!stack.length)return {sql,replacements:0};pairs.set(stack.pop(),i);}}
 if(stack.length)return {sql,replacements:0};
 function node(open,depth){
  if(cache.has(open))return cache.get(open);
  if(depth>128)throw Error('RESTORATION_EXPRESSION_TOO_DEEP');const close=pairs.get(open),children=[];let i=open+1,op=null,homogeneous=true;
  while(i<close){if(!pairs.has(i)){homogeneous=false;break;}const end=pairs.get(i),child=node(i,depth+1);children.push(child);i=end+1;if(i===close)break;
   const token=tokens[i],operator=token?.kind==='word'?token.text.toUpperCase():null;
   if(!['AND','OR'].includes(operator)||op&&op!==operator){homogeneous=false;break;}op=operator;i++;
  }
  let text,terms;
  if(homogeneous&&i===close&&children.length>1&&op){terms=children.flatMap(c=>c.op===op?c.terms:[c.text]);text='('+terms.join(' '+op+' ')+')';}
  else if(homogeneous&&children.length===1&&children[0].op){({text,op,terms}=children[0]);}
  else{op=null;terms=null;let last=tokens[open].end;text='(';for(let j=open+1;j<close;j++){if(!pairs.has(j))continue;const end=pairs.get(j);text+=sql.slice(last,tokens[j].start)+node(j,depth+1).text;last=tokens[end].end;j=end;}text+=sql.slice(last,tokens[close].start)+')';}
  if(text!==sql.slice(tokens[open].start,tokens[close].end))replacements++;const result={text,op,terms};cache.set(open,result);return result;
 }
 let result='',last=0;
 for(let i=0;i<tokens.length;i++){if(!pairs.has(i))continue;const end=pairs.get(i);result+=sql.slice(last,tokens[i].start)+node(i,0).text;last=tokens[end].end;i=end;}
 return {sql:result+sql.slice(last),replacements};
}
