// Helvetica AFM widths (ASCII 32..126), in thousandths of an em.
const regular=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const bold=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
function glyph(char,strong){
 const base=char.normalize('NFD').replace(/[\u0300-\u036f]/g,''),code=base.codePointAt(0);
 // Latin accents retain the base glyph width. The remaining WinAnsi glyphs
 // use the font's maximum width as a conservative bound, not an average.
 return base.length===1&&code>=32&&code<=126?(strong?bold:regular)[code-32]:1015;
}
export function reportPdfTextWidth(value,size=8.5,strong=false){return [...String(value)].reduce((width,char)=>width+glyph(char,strong)*size/1000,0);}
export function reportPdfTextLines(value,width,size=8.5,strong=false){
 if(!Number.isFinite(width)||width<=0||!Number.isFinite(size)||size<=0)throw Error('Medida de texto PDF inválida.');
 const result=[];let line='',used=0;
 for(const word of String(value).trim().split(/\s+/u)){
  const gap=line?glyph(' ',strong)*size/1000:0,wordWidth=reportPdfTextWidth(word,size,strong);
  if(line&&used+gap+wordWidth<=width){line+=' '+word;used+=gap+wordWidth;continue;}
  if(line){result.push(line);line='';used=0;}
  for(const char of word){const next=glyph(char,strong)*size/1000;
   if(next>width)throw Error('La columna PDF no admite un carácter completo.');
   if(line&&used+next>width){result.push(line);line='';used=0;}
   line+=char;used+=next;
  }
 }
 if(line)result.push(line);return result.length?result:[''];
}
