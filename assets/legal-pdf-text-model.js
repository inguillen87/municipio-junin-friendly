// Local extraction is a transcription aid, not a signature or legal validation.
export const PDF_TEXT_MAX_BYTES=2*1024*1024, PDF_TEXT_MAX_PAGES=30, PDF_TEXT_MAX_CHARS=300000;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fail=()=>{throw Error('No se pudo verificar el texto extraído del PDF seleccionado.');};
export function pageTextFromItems(items){
  if(!Array.isArray(items)||items.length>15000)fail();
  let text='';
  for(const item of items){
    if(typeof item?.str!=='string')continue;
    if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(item.str))fail();
    text+=item.str+(item.hasEOL?'\n':' ');
    if(text.length>50000)fail();
  }
  return text.trim();
}
export function verifyPdfText(result,document){
  if(!exact(result,['version','sha256','byteLength','pageCount','pages','method','originalModified','legalReview'])||result.version!=='legal-pdf-text.v1'||result.method!=='pdf-text'||result.originalModified!==false||result.legalReview!==false)fail();
  if(!document||result.sha256!==document.sha256||!/^[a-f0-9]{64}$/.test(result.sha256)||!Number.isInteger(result.byteLength)||result.byteLength<5||result.byteLength>PDF_TEXT_MAX_BYTES)fail();
  if(!Number.isInteger(result.pageCount)||result.pageCount<1||result.pageCount>PDF_TEXT_MAX_PAGES||!Array.isArray(result.pages)||result.pages.length!==result.pageCount)fail();
  let total=0;for(const [i,p]of result.pages.entries()){
    if(!exact(p,['number','text'])||p.number!==i+1||typeof p.text!=='string'||p.text.length>50000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(p.text))fail();total+=p.text.length;
  }
  if(total>PDF_TEXT_MAX_CHARS)fail();return result;
}
export function preparePdfArticle(result,document,{page,label,text,reviewed},existing=[]){
 verifyPdfText(result,document);
 if(!Number.isInteger(page)||!result.pages[page-1]||!result.pages[page-1].text.trim())throw Error('Seleccioná una página con texto extraíble.');
 if(reviewed!==true)throw Error('Revisá el fragmento contra el PDF antes de incorporarlo.');
 if(typeof label!=='string'||!label.trim()||label.trim().length>60||/[\x00-\x1f\x7f<>]/.test(label))throw Error('Completá un identificador de artículo o anexo de hasta 60 caracteres.');
 if(typeof text!=='string'||!text.trim()||text.length>12000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))throw Error('Revisá el texto: no puede quedar vacío ni superar 12.000 caracteres.');
 if(!Array.isArray(existing)||existing.length>=150)throw Error('Se alcanzó el límite de artículos de esta versión.');
 if(existing.some(a=>String(a.label).normalize('NFC').trim().toLocaleLowerCase('es-AR')===label.normalize('NFC').trim().toLocaleLowerCase('es-AR')))throw Error('Ese identificador ya está en el borrador. Revisá el artículo existente.');
 return {label:label.normalize('NFC').trim(),text:text.trim(),page};
}
