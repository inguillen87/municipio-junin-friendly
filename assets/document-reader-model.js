// Local extractive reading: quotations retain their source page and exact offsets.
export const READER_LIMITS=Object.freeze({bytes:8*1024*1024,pages:30,totalChars:300000,pageChars:50000,pixels:4000000,ocrMs:90000});
const validHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function validatePages(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>READER_LIMITS.pages)throw Error('Cantidad de páginas no admitida.');let chars=0;
 for(let i=0;i<pages.length;i++){
  const p=pages[i];
  if(!p||p.number!==i+1||typeof p.text!=='string'||p.text.length>READER_LIMITS.pageChars||!['native','ocr','empty'].includes(p.method)||typeof p.reviewed!=='boolean')throw Error('Texto de página no verificable.');
  if(p.method==='ocr'&&(!Number.isFinite(p.confidence)||p.confidence<0||p.confidence>100))throw Error('Resultado OCR no verificable.');
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(p.text))throw Error('Texto no admitido.');chars+=p.text.length;
 }
 if(chars>READER_LIMITS.totalChars)throw Error('El documento supera el límite de texto.');return pages;
}
export function applyOcrPage(pages,number,result,expectedHash,currentHash){
 validatePages(pages);
 if(!validHash(expectedHash)||expectedHash!==currentHash||!Number.isInteger(number)||!pages[number-1]||pages[number-1].method==='native'||typeof result?.text!=='string'||!Number.isFinite(result.confidence))throw Error('El archivo o la página cambiaron.');
 return validatePages(pages.map(p=>p.number===number?{number,text:result.text.trim(),method:'ocr',confidence:result.confidence,reviewed:false}:{...p}));
}
const terms=/\b(?:art[ií]culo|objeto|disp[oó]nese|establece|deber[aá]|plazo|proh[ií]be|excepci[oó]n|modifica|deroga|obligaci[oó]n|vigencia|resuelve|ordena|presupuesto)\b/gi;
export function extractiveDigest(pages,{sha256,maxQuotes=8}={}){
 validatePages(pages);if(!validHash(sha256)||!Number.isInteger(maxQuotes)||maxQuotes<1||maxQuotes>12)throw Error('Documento no verificable.');
 const candidates=[],excluded=[];
 for(const p of pages){
  if(!p.text.trim()||p.method==='ocr'&&!p.reviewed){excluded.push(p.number);continue;}
  // Preserve each whole paragraph. Overlong paragraphs are explicit, bounded fragments.
  const expression=/[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g;let m;
  while((m=expression.exec(p.text))){
   let text=m[0],start=m.index;const trim=text.trimStart();start+=text.length-trim.length;text=trim.trimEnd();if(text.length<40)continue;
   if(text.length>1000){
    for(let at=0;at<text.length;){let end=Math.min(text.length,at+750);if(end<text.length){const cut=text.slice(at,end).lastIndexOf('. ');if(cut>150)end=at+cut+1;}
     const part=text.slice(at,end);if(part.trim().length>=40)candidates.push({page:p.number,start:start+at,end:start+end,text:part,method:p.method,partialParagraph:true,score:(part.match(terms)||[]).length+Math.min(part.length,500)/500});at=end;
    }
   }else candidates.push({page:p.number,start,end:start+text.length,text,method:p.method,partialParagraph:false,score:(text.match(terms)||[]).length+Math.min(text.length,500)/500});
  }
 }
 const ranked=candidates.sort((a,b)=>b.score-a.score||a.page-b.page||a.start-b.start),chosen=[],seen=new Set();
 for(const c of ranked){if(chosen.length>=maxQuotes)break;if(!seen.has(c.page)){chosen.push(c);seen.add(c.page);}}
 for(const c of ranked){if(chosen.length>=maxQuotes)break;if(!chosen.includes(c))chosen.push(c);}
 const quotes=chosen.sort((a,b)=>a.page-b.page||a.start-b.start).map(({score,...q})=>q);
 for(const q of quotes)if(pages[q.page-1].text.slice(q.start,q.end)!==q.text)throw Error('El extracto no coincide con su fuente.');
 return {version:'document-extracts.v1',method:'extractive-not-generative',sha256,quotes,totalPages:pages.length,excludedPages:excluded,representedPages:[...new Set(quotes.map(q=>q.page))],legalValidation:false};
}
export function digestText(digest,name){return ['MuniControl · Lectura documental local','Archivo: '+String(name).replace(/[\r\n]/g,' '),'SHA-256: '+digest.sha256,'Extractos seleccionados automáticamente. No es una interpretación jurídica ni un resumen exhaustivo.','Páginas sin texto utilizable: '+(digest.excludedPages.join(', ')||'ninguna'),'',...digest.quotes.flatMap(q=>['Página '+q.page+' · '+(q.method==='ocr'?'OCR revisado por el operador':'Texto nativo')+(q.partialParagraph?' · fragmento de párrafo':''),q.text,''])].join('\n');}
