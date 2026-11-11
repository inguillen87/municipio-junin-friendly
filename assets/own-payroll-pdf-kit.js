// Drawing kit for the PDF documents of own payroll (receipts and payroll sheets): the two standard fonts every reader already
// has, measured with their real widths, and a page cursor with the few shapes those documents use. It knows no payroll rule and
// never adds, rounds or completes an amount: values are printed exactly as the closed liquidation gives them.
import {formatOwnRunDecimal} from './own-payroll-run-workspace-model.js';
const mapping={0x20ac:128,0x2013:150,0x2014:151,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149,0x2212:45};
// Advance widths of Helvetica and Helvetica-Bold (Adobe AFM, thousandths of the font size) for WinAnsi 32–255, two base-36 digits
// each. With real widths, amounts line up on the right edge and labels wrap where the column ends, not at a guessed character count.
const WIDTHS=[
 '7q7q9vfgfgopij5b9999atg87q997q7qfgfgfgfgfgfgfgfgfgfg7q7qg8g8g8fgs7ijijk2k2ijgzlmk27qdwijfgn5k2lmijlmk2ijgzk2ijq8ijijgz7q7q7qd1fg99fgfgdwfgfg7qfgfg6666dw66n5fgfgfgfg99dw7qfgdwk2dwdwdw9a789ag800000066fg99rsfgfg99rsij99rs00gz0000666699999qfgrs99rsdw99q800dwij7q99fgfgfgfg78fg99khaafgg899kh99b4g8000099fgex7q9900a5fgn6n6n6gzijijijijijijrsk2ijijijij7q7q7q7qk2k2lmlmlmlmlmg8lmk2k2k2k2ijijgzfgfgfgfgfgfgopdwfgfgfgfg7q7q7q7qfgfgfgfgfgfgfgg8gzfgfgfgfgdwfgdw',
 '7q99d6fgfgopk26m9999atg87q997q7qfgfgfgfgfgfgfgfgfgfg9999g8g8g8gzr3k2k2k2k2ijgzlmk27qfgk2gzn5k2lmijlmk2ijgzk2ijq8ijijgz997q99g8fg99fggzfggzfg99gzgz7q7qfg7qopgzgzgzgzatfg99gzfglmfgfgdwat7satg80000007qfgdwrsfgfg99rsij99rs00gz00007q7qdwdw9qfgrs99rsfg99q800dwij7q99fgfgfgfg7sfg99khaafgg899kh99b4g8000099gzfg7q9900a5fgn6n6n6gzk2k2k2k2k2k2rsk2ijijijij7q7q7q7qk2k2lmlmlmlmlmg8lmk2k2k2k2ijijgzfgfgfgfgfgfgopfgfgfgfgfg7q7q7q7qgzgzgzgzgzgzgzg8gzgzgzgzgzfggzfg',
].map(table=>table.match(/../g).map(pair=>parseInt(pair,36)||556));
export const OWN_PDF_INK='0.07 0.20 0.25',OWN_PDF_MUTED='0.33 0.42 0.47',OWN_PDF_LINE='0.80 0.85 0.86',OWN_PDF_STRONG='0.55 0.62 0.65',OWN_PDF_TINT='0.94 0.97 0.97';
const UNIT_LABELS={hours:'horas',minutes:'minutos',days:'días',percent:'%',units:'unidades',coefficient:'coeficiente',years:'años',months:'meses'};
export const ownPdfUnitText=unit=>unit==='money'?'':(UNIT_LABELS[unit]??unit);
const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
// Presentation only: the same period, date and CUIT/CUIL, written the way a pay slip shows them. Anything unexpected is printed as received.
export const ownPdfPeriodText=value=>{const m=/^((?:19|20)\d{2})-(0[1-9]|1[0-2])$/.exec(String(value));return m?`${MONTHS[+m[2]-1]} de ${m[1]}`:String(value);};
export const ownPdfDateText=value=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value??''));return m?`${m[3]}/${m[2]}/${m[1]}`:'No informada';};
export const ownPdfTaxIdText=value=>{const m=/^(\d{2})(\d{8})(\d)$/.exec(String(value));return m?`${m[1]}-${m[2]}-${m[3]}`:String(value);};

// Text measured and encoded for the standard fonts. A character they cannot draw stops the document with `unsupported`:
// nothing is replaced or left out.
export function ownPdfText(unsupported){
 const bytes=value=>[...String(value)].map(c=>{const n=c.codePointAt(0);if(!(n>=32&&n<=255||mapping[n]!==undefined))throw Error(unsupported);return mapping[n]??n;});
 const hex=value=>'<'+bytes(value).map(n=>n.toString(16).padStart(2,'0')).join('')+'>';
 const width=(value,size,bold=false)=>{const table=WIDTHS[bold?1:0];return bytes(value).reduce((sum,n)=>sum+table[n-32],0)*size/1000;};
 // Lines that fit a width in points. A word wider than the column is cut by characters; no text is dropped.
 const fit=(value,max,size,bold=false)=>{
  const lines=[];let line='';
  for(const whole of String(value).split(/\s+/).filter(Boolean)){
   let word=[...whole];
   while(word.length>1&&width(word.join(''),size,bold)>max){
    if(line){lines.push(line);line='';}
    let cut=1;while(cut<word.length&&width(word.slice(0,cut+1).join(''),size,bold)<=max)cut++;
    lines.push(word.slice(0,cut).join(''));word=word.slice(cut);
   }
   const text=word.join(''),next=line?line+' '+text:text;
   if(line&&width(next,size,bold)>max){lines.push(line);line=text;}else line=next;
  }
  if(line)lines.push(line);return lines.length?lines:[''];
 };
 // Largest size, down to 6 pt, at which a short value fits its cell.
 const shrink=(value,max,size,bold=false)=>{let s=size;while(s>6&&width(value,s,bold)>max)s-=0.5;return s;};
 return {hex,width,fit,shrink};
}

// A document as a list of pages, each a list of PDF operations. `y` is the top of the next block; `header(doc)` draws the top of
// every page. Coordinates are points on an A4 sheet (595 × 842), origin at the bottom left.
export function ownPdfDocument({unsupported,bottom=76,top=806,header=null}){
 const {hex,width,fit,shrink}=ownPdfText(unsupported),pages=[],n=value=>+value.toFixed(2);let ops=null;
 const doc={y:0,pages,bottom,width,fit,shrink,
  page(){ops=[];pages.push(ops);doc.y=top;header?.(doc);},
  select(index){ops=pages[index];},
  ensure(height){if(doc.y-height<bottom){doc.page();return true;}return false;},
  put(x,y,value,size=9,bold=false,color=OWN_PDF_INK){ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${n(x)} ${n(y)} Tm ${hex(value)} Tj ET`);},
  right(xr,y,value,size=9,bold=false,color=OWN_PDF_INK){doc.put(xr-width(value,size,bold),y,value,size,bold,color);},
  line(x1,y1,x2,y2,shade=OWN_PDF_LINE,weight=0.6){ops.push(`${shade} RG ${weight} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);},
  box(x,y,w,h,{fill=null,stroke=OWN_PDF_LINE,weight=0.6}={}){if(fill)ops.push(`${fill} rg ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`);if(stroke)ops.push(`${stroke} RG ${weight} w ${n(x)} ${n(y)} ${n(w)} ${n(h)} re S`);},
  // A row of labelled values across [x, x+w]: small label above, value below.
  cells(items,x,w,{bold=false,size=9}={}){const each=w/items.length;items.forEach(([label,value],i)=>{const at=x+i*each;doc.put(at,doc.y,label,7,false,OWN_PDF_MUTED);doc.put(at,doc.y-size-2.5,value,shrink(value,each-8,size,bold),bold);});doc.y-=size+2.5;},
  // One concept as a row of a column `columnWidth` wide: code, label wrapped to the real width, value on the right edge.
  // Money goes without sign under a column that already says it is money; elsewhere `withSign` writes it.
  entry(concept,columnWidth,{size=8.5,withSign=false,lead=2.5,pad=2.5,labelX=38,reserve=62}={}){
   const inner=columnWidth-labelX-6,unit=ownPdfUnitText(concept.unit),value=formatOwnRunDecimal(concept.amount,withSign&&concept.unit==='money')+(unit?' '+unit:'');
   const valueSize=shrink(value,inner-66,size,true),label=fit(concept.label,Math.min(inner-reserve-6,inner-width(value,valueSize,true)-6),size);
   return {code:concept.code,label,size,lead,labelX,value,valueSize,height:label.length*(size+lead)+pad};
  },
  // Two columns between edges [x0, xm, x1] that advance together page by page. A heading never stays alone at the foot of a
  // page, and a row that cannot fit even on a fresh page stops the document instead of being cut. `head()` draws the heading
  // of each stretch; `frame` draws the outline and `divider` the line between both columns.
  columns(left,right,[x0,xm,x1],{head=null,headHeight=0,frame=true,divider=frame}={}){
   if(!left.length&&!right.length)return;
   const first=(items,at)=>at<items.length?items[at].height+(items[at].heading&&items[at+1]?items[at+1].height:0):0;
   const draw=(item,a,b,from)=>{
    if(item.heading)return doc.put(a+6,from-item.height+3.5,item.heading,item.size??7.5,true,OWN_PDF_MUTED);
    if(item.note)return doc.put(a+6,from-item.height+4.5,item.note,item.size??8,false,OWN_PDF_MUTED);
    const base=from-item.size-0.5;
    doc.put(a+6,base,item.code,shrink(item.code,item.labelX-8,item.size,true),true);
    item.label.forEach((part,i)=>doc.put(a+item.labelX,base-i*(item.size+item.lead),part,item.size));
    doc.right(b-6,base,item.value,item.valueSize,true);
   };
   let li=0,ri=0;
   for(;;){
    doc.ensure(headHeight+Math.max(first(left,li),first(right,ri))+4);
    const bandTop=doc.y;head?.();const from=doc.y;
    const column=(items,start,a,b)=>{let at=start,yy=from;while(at<items.length&&yy-first(items,at)>=bottom){draw(items[at],a,b,yy);yy-=items[at].height;at++;}return [at,yy];};
    const [nl,yl]=column(left,li,x0,xm),[nr,yr]=column(right,ri,xm,x1);
    if(nl===li&&nr===ri)throw Error('Un concepto no entra en una página. No se recortó ni se omitió.');
    li=nl;ri=nr;doc.y=Math.min(yl,yr)-2;
    if(divider)doc.line(xm,bandTop,xm,doc.y);
    if(frame){doc.line(x0,bandTop,x0,doc.y);doc.line(x1,bandTop,x1,doc.y);doc.line(x0,doc.y,x1,doc.y);}
    if(li>=left.length&&ri>=right.length)return;
    doc.page();
   }
  },
 };
 return doc;
}
