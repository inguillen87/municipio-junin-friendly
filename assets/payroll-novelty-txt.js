/** Explicit TXT input adapters. Only document preparation: no approval or payroll calculation. */
import {reviewNoveltyCsv,NoveltyReviewError,NOVELTY_CSV_HEADER,NOVELTY_REVIEW_MAX_BYTES,NOVELTY_REVIEW_MAX_ROWS} from './payroll-novelty-review.js';
export const NOVELTY_INPUT_FORMATS=Object.freeze({csv:'CSV / TXT de 10 columnas',columns:'TXT por columnas',retro:'TXT RETRO · legajo e importe',fixed:'TXT por posiciones · legajo'});
export const TXT_LAYOUTS=Object.freeze({both:['legajo','concepto','unidades','importe_ars'],quantity:['legajo','concepto','unidades'],amount:['legajo','concepto','importe_ars'],commonQuantity:['legajo','unidades'],commonAmount:['legajo','importe_ars']});
const fail=(message,line=1)=>{throw new NoveltyReviewError([{rowOrdinal:null,line,code:'structure',message}]);};
const issue=(message,line,rowOrdinal)=>({rowOrdinal,line,code:'row',message});
const integer=(v,min,max)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const sourceId=value=>{if(typeof value!=='string'||!/^\d{1,20}$/.test(value.trim()))throw Error('Legajo o concepto inválido: se requiere un identificador numérico, no un DNI ni un nombre.');return BigInt(value.trim()).toString();};
export function decodeNoveltyInput(bytes,{name='',encoding='utf-8'}={}){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength===0||bytes.byteLength>NOVELTY_REVIEW_MAX_BYTES||!/^.+\.(csv|txt)$/i.test(name))throw Error('Usá un archivo .txt o .csv de hasta 480 KiB.');
 if(!['utf-8','windows-1252'].includes(encoding))throw Error('Elegí UTF-8 o Windows-1252.');
 if(bytes[0]===255&&bytes[1]===254||bytes[0]===254&&bytes[1]===255)throw Error('UTF-16 no está admitido. Exportá el archivo como UTF-8 o Windows-1252.');
 let text;try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{throw Error('La codificación elegida no coincide con el archivo. Elegí la correcta; no se reemplazan caracteres.');}
 if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\ufffd]/.test(text))throw Error('El archivo contiene caracteres de control, binarios o reemplazos. No se importó.');
 return text;
}
function numeric(value,{decimal='point',scale=2,amount=false}={}){
 const raw=String(value).trim();if(raw==='')return '';
 if(!['point','comma','implied'].includes(decimal)||decimal==='implied'&&!integer(scale,0,6)||amount&&decimal==='implied'&&scale>2)throw Error('Escala o separador decimal inválido; no se redondean importes.');
 let m;if(decimal==='implied'){m=/^(-?)(\d{1,24})$/.exec(raw);if(!m)throw Error('El campo con decimales implícitos debe contener sólo signo opcional y dígitos.');const padded=m[2].padStart(scale+1,'0');m=[null,m[1],scale?padded.slice(0,-scale):padded,scale?padded.slice(-scale):''];}
 else{m=(decimal==='point'?/^(-?)(\d{1,20})(?:\.(\d{1,6}))?$/:/^(-?)(\d{1,20})(?:,(\d{1,6}))?$/).exec(raw);if(!m)throw Error('El valor no coincide con el separador decimal elegido; no se aceptan separadores de miles.');}
 const whole=BigInt(m[2]).toString(),fraction=m[3]||'';if(m[1]&&whole==='0'&&!/[1-9]/.test(fraction))throw Error('No se admite cero negativo.');
 if(amount&&fraction.length>2)throw Error('El importe tiene más de dos decimales; no se redondea automáticamente.');return m[1]+whole+(fraction?'.'+fraction:'');
}
function fixedConfig(o){
 const p=o.format==='retro'?{recordWidth:18,idStart:1,idLength:8,valueStart:9,valueLength:10,valueKind:'amount',decimal:'point',scale:2}:o;
 for(const k of ['recordWidth','idStart','idLength','valueStart','valueLength'])if(!integer(p[k],1,512))fail('Indicá posiciones y longitudes enteras entre 1 y 512.');
 if(p.idLength>20||p.valueLength>30||!['quantity','amount'].includes(p.valueKind))fail('El campo de legajo o valor excede el formato admitido.');
 const a=p.idStart-1,b=p.valueStart-1;if(a+p.idLength>p.recordWidth||b+p.valueLength>p.recordWidth||a<b+p.valueLength&&b<a+p.idLength)fail('Los campos se superponen o quedan fuera de la longitud de registro.');return p;
}
export function reviewNoveltyInput(raw,parseRow,periodMonth,options={format:'csv'}){
 if(!Object.hasOwn(NOVELTY_INPUT_FORMATS,options.format))fail('Elegí el formato de importación.');
 if(options.format==='csv')return reviewNoveltyCsv(raw,parseRow,periodMonth);
 if(typeof raw!=='string'||!raw.trim())fail('Cargá o pegá un TXT antes de validar.');
 if(new TextEncoder().encode(raw).byteLength>NOVELTY_REVIEW_MAX_BYTES)fail('El archivo supera 480 KiB.');
 if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\ufffd]/.test(raw))fail('El TXT contiene caracteres no admitidos.');
 let lines=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');if(lines.at(-1)==='')lines.pop();let start=1;
 const columns=options.format==='columns',fields=columns&&Object.hasOwn(TXT_LAYOUTS,options.layout)?TXT_LAYOUTS[options.layout]:null,p=columns?null:fixedConfig(options);
 let separator;if(columns){separator={semicolon:';',tab:'\t',pipe:'|'}[options.separator];if(!fields||!separator||typeof options.header!=='boolean')fail('Elegí las columnas, el separador y si existe encabezado.');if(options.header){if(lines[0]?.split(separator).map(v=>v.trim().toLowerCase()).join('|')!==fields.join('|'))fail('El encabezado debe coincidir exactamente con '+fields.join(separator)+'.');lines.shift();start=2;}}
 if(!lines.length||lines.length>NOVELTY_REVIEW_MAX_ROWS)fail('El TXT debe contener entre 1 y 500 registros.');
 let common=null;if(!columns||!fields.includes('concepto')){try{common=sourceId(options.concept??'');}catch{fail('Completá el concepto común del archivo antes de validar.');}}
 const rows=[],issues=[],seen=new Map();
 lines.forEach((line,index)=>{const ordinal=index+1,physical=start+index;try{
  if(!line.trim())throw Error('Hay una línea vacía dentro del archivo. Corregí el archivo completo; no se omiten filas.');
  let id,concept=common,quantity='',amount='';
  if(columns){const cells=line.split(separator);if(cells.length!==fields.length)throw Error('Cantidad de columnas distinta de '+fields.length+'. Revisá el separador elegido.');const v=Object.fromEntries(fields.map((name,i)=>[name,cells[i]]));id=sourceId(v.legajo);if(v.concepto!==undefined)concept=sourceId(v.concepto);quantity=numeric(v.unidades??'',{decimal:options.decimal,scale:options.scale});amount=numeric(v.importe_ars??'',{decimal:options.decimal,scale:options.scale,amount:true});}
  else{if(!/^[\x20-\x7e]*$/.test(line)||line.length!==p.recordWidth)throw Error('El registro debe tener exactamente '+p.recordWidth+' caracteres ASCII, sin quitar sus espacios.');
   const a=p.idStart-1,b=p.valueStart-1;id=sourceId(line.slice(a,a+p.idLength));const value=numeric(line.slice(b,b+p.valueLength),{decimal:p.decimal,scale:p.scale,amount:p.valueKind==='amount'});if(p.valueKind==='quantity')quantity=value;else amount=value;
   const unused=[...line].filter((_,i)=>!(i>=a&&i<a+p.idLength)&&!(i>=b&&i<b+p.valueLength)).join('');if(unused.trim())throw Error('Hay contenido fuera de los campos definidos; no se descarta información desconocida.');
  }
  const row=parseRow([id,concept,'','',quantity,amount,'','','','NO'],ordinal,periodMonth),key=[row.legajo,row.conceptSourceId].join('|');
  if(seen.has(key))throw Error('Duplica la fila '+seen.get(key)+': mismo legajo y concepto.');seen.set(key,ordinal);rows.push(row);
 }catch(e){issues.push(issue(String(e.message||'Registro inválido').replace(/^Fila \d+:\s*/,''),physical,ordinal));}});
 if(issues.length)throw new NoveltyReviewError(issues,lines.length);return rows;
}
export function noveltyInputTemplate(format='csv',options={}){
 if(format==='csv')return NOVELTY_CSV_HEADER.join(';')+'\r\n';
 if(format==='columns'){const columns=TXT_LAYOUTS[options.layout],separator={semicolon:';',tab:'\t',pipe:'|'}[options.separator];if(!columns||!separator)fail('Elegí columnas y separador.');return columns.join(separator)+'\r\n';}
 fail('Los formatos por posiciones no llevan encabezado. Usá el archivo original y revisá sus campos.');
}
