import {validateObservedBankFileComplete, PAYROLL_BANK_MAX_FILE_BYTES, PayrollBankProfileError} from './payroll-bank-fixed-width-profiles.js';

export const TRANSFERS_VAR_PROFILE = 'transferencias-varias-167.observed.v1';
export const TRANSFERS_VAR_LAYOUT = 'transferencias-varias-167.fields-observed.20261009.v1';
export const TRANSFERS_VAR_FIELDS = Object.freeze([
  ['CBU',1,22], ['Importe en centavos',23,32], ['CUIL',33,54],
  ['Apellido y nombre',55,94], ['Legajo',95,104], ['Referencia de haberes',105,164], ['Concepto VAR',165,167],
].map(([label,first,last]) => Object.freeze({label,first,last})));
const issues = Object.freeze({
  BANK_BOM_FORBIDDEN:['Archivo','Retirá el BOM; conservá Windows-1252.'],
  BANK_LINE_ENDING_INVALID:['Fin de fila','Conservá CRLF al terminar cada registro.'],
  BANK_FINAL_CRLF_REQUIRED:['Fin de archivo','Terminá también la última fila con CRLF.'],
  BANK_RECORD_WIDTH_MISMATCH:['Registro','Revisá las 167 posiciones; no recortes ni corras campos.'],
  BANK_ENCODING_CONSTRAINT_FAILED:['Registro','Usá bytes imprimibles Windows-1252; no conviertas a UTF-8.'],
  BANK_NO_RECORDS:['Archivo','Elegí un archivo con registros.'],
  VAR_CBU:['CBU · 1–22','Conservá exactamente 22 dígitos. Este control no verifica titularidad.'],
  VAR_AMOUNT:['Importe · 23–32','Conservá diez dígitos de centavos enteros, sin separadores ni redondeo.'],
  VAR_CUIL:['CUIL · 33–54','Conservá once dígitos y once espacios finales.'],
  VAR_NAME:['Apellido y nombre · 55–94','Informá el campo de 40 posiciones, sin espacios iniciales.'],
  VAR_EMPLOYEE:['Legajo · 95–104','Conservá diez dígitos con sus ceros iniciales.'],
  VAR_REFERENCE:['Referencia · 105–164','Usá HABERES mes-año, mes de 1 a 12, cuatro dígitos de año y espacios finales.'],
  VAR_LITERAL:['Concepto · 165–167','Conservá el literal exacto VAR, en mayúsculas.'],
  VAR_PERIOD_MIXED:['Archivo','Separá expresamente los períodos; este control no recorta ni divide el archivo.'],
});
const verified = new WeakSet();
const freeze = v => {if(v && typeof v === 'object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const literal = bytes => Array.from(bytes, b => String.fromCharCode(b)).join('');

/** Private bytes in, non-nominal evidence out. No row values or source bytes survive. */
export async function reviewTransfersVarFile(bytes, options = {}) {
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>PAYROLL_BANK_MAX_FILE_BYTES)throw new PayrollBankProfileError('BANK_FILE_SIZE_INVALID','Elegí un archivo de entre 1 byte y 4 MiB.');
  bytes=bytes.slice();
  try {
  const physical = await validateObservedBankFileComplete({profileId:TRANSFERS_VAR_PROFILE,scope:'unsegmented',bytes},options);
  const observations = physical.diagnostics.rows.flatMap(r => r.errorCodes.map(code => ({rowNumber:r.rowNumber,code})));
  for(const {code} of physical.diagnostics.byCode)if(!physical.diagnostics.rows.some(r=>r.errorCodes.includes(code)))observations.push({rowNumber:null,code});
  let ordinal=0, start=bytes.length>=3 && bytes[0]===239 && bytes[1]===187 && bytes[2]===191 ? 3 : 0;
  let sum=0n;
  const periods=new Set();
  const inspect=(end)=>{
    ordinal++;
    if(end-start!==167)return;
    const row=bytes.subarray(start,end), add=code=>observations.push({rowNumber:ordinal,code});
    if(!/^\d{22}$/.test(literal(row.subarray(0,22))))add('VAR_CBU');
    const amount=literal(row.subarray(22,32));
    if(!/^\d{10}$/.test(amount))add('VAR_AMOUNT');else sum+=BigInt(amount);
    if(!/^\d{11} {11}$/.test(literal(row.subarray(32,54))))add('VAR_CUIL');
    const name=row.subarray(54,94);
    if(name[0]===32 || !name.some(b=>b!==32))add('VAR_NAME');
    if(!/^\d{10}$/.test(literal(row.subarray(94,104))))add('VAR_EMPLOYEE');
    const reference=/^HABERES ([1-9]|1[0-2])-(\d{4}) +$/.exec(literal(row.subarray(104,164)));
    if(!reference || reference[2]==='0000')add('VAR_REFERENCE');else periods.add(reference[2]+'-'+reference[1].padStart(2,'0'));
    if(literal(row.subarray(164,167))!=='VAR')add('VAR_LITERAL');
  };
  for(let cursor=start;cursor<bytes.length;cursor++)if(bytes[cursor]===13||bytes[cursor]===10){
    inspect(cursor);
    if(bytes[cursor]===13&&bytes[cursor+1]===10)cursor++;
    start=cursor+1;
  }
  if(start<bytes.length)inspect(bytes.length);
  if(periods.size>1)observations.push({rowNumber:null,code:'VAR_PERIOD_MIXED'});
  observations.sort((a,b)=>(a.rowNumber??0)-(b.rowNumber??0)||a.code.localeCompare(b.code));
  const complete=observations.length===0 && physical.structureMatches;
  const result={version:TRANSFERS_VAR_LAYOUT,sha256:physical.sha256,recordCount:physical.recordCount,
    matchesObservedFields:complete,period:complete&&periods.size===1?[...periods][0]:null,totalCents:complete?sum.toString():null,
    observations:observations.map(r=>({...r,field:issues[r.code][0],action:issues[r.code][1]})),
    generationAllowed:false,officialSubmissionAllowed:false,bankSubmitted:false,paymentExecuted:false};
  freeze(result);verified.add(result);return result;
  } finally {bytes.fill(0);}
}

export function transfersVarObservationsCsv(review) {
  if(!verified.has(review))throw Error('Revisá el archivo completo antes de descargar las incidencias.');
  const cell=v=>'"'+String(v).replaceAll('"','""')+'"';
  const rows=[['Fila de origen','Estado','Campo / posiciones','Acción sugerida']];
  for(const r of review.observations)rows.push([r.rowNumber??'Global','Revisar',r.field,r.action]);
  if(!review.observations.length)rows.push(['Global','Sin observaciones','Archivo','La revisión completa coincide con los campos observados. No certifica aceptación bancaria.']);
  return {bytes:new TextEncoder().encode('\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n'),filename:'incidencias-transferencias-varias.csv'};
}
