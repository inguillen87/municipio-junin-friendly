import { payrollSourceReport } from './payroll-source-report-model.js';

const valid = new WeakSet();
const fold = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const cents = value => BigInt(value.replace('.', ''));
const decimal = value => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, '0')}`;
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const closure = value => ({closed:'Cierre informado',open:'Abierta / preliquidación',unknown:'Cierre no informado'})[value];
const statusLabels = { changed:'Importe diferente', same:'Sin cambios', onlyA:'Sólo en A', onlyB:'Sólo en B', missing:'Importe no informado', definition:'Definición diferente', metadata:'Descripción o cobertura diferente' };
const percent = (difference, base) => {
  if (base <= 0n) return base === 0n ? 'No evaluable: base cero' : 'No evaluable: base negativa';
  const magnitude = difference < 0n ? -difference : difference;
  const rounded = (magnitude * 10000n + base / 2n) / base;
  return `${difference < 0n && rounded !== 0n ? '-' : ''}${rounded / 100n},${String(rounded % 100n).padStart(2, '0')} %`;
};
function source(raw) {
  const d = payrollSourceReport(raw);
  if (d.mode !== 'report' || !d.found) throw Error('La liquidación ya no está disponible.');
  const codes = new Set();
  for (const row of d.rows) {
    const key = String(Number(row.code));
    if (codes.has(key)) throw Error('Códigos de concepto ambiguos en la fuente.');
    codes.add(key);
    for (const key of ['unit', 'totalGroup']) if (row[key] != null && (typeof row[key] !== 'string' || row[key].length > 80)) throw Error('Definición de concepto inválida.');
  }
  return d;
}
export function comparisonSourceKey(raw) {
  const d = source(raw);
  return JSON.stringify([d.datasetId,d.date,d.type,d.closureStatus,d.statementCount,d.lineCount,d.sourceLabel,d.payloadHash,d.reportHash,
    [...d.rows].sort((a,b)=>Number(a.code)-Number(b.code)).map(r=>[r.code,r.description,r.totalGroup??null,r.unit??null,r.sourceRows,r.missingAmounts,r.amount])]);
}
export function comparePayrollSources(left, right) {
  const a = source(left), b = source(right);
  if (a.datasetId === b.datasetId) throw Error('Elegí dos liquidaciones distintas.');
  if (a.type !== b.type) throw Error('Elegí liquidaciones del mismo tipo para comparar.');
  const index = d => new Map(d.rows.map(r=>[String(Number(r.code)),r]));
  const aa = index(a), bb = index(b), keys = [...new Set([...aa.keys(),...bb.keys()])].sort((a,b)=>Number(a)-Number(b));
  if (keys.length > 1000) throw Error('La comparación supera 1.000 conceptos. No se exporta un resultado parcial.');
  const rows = keys.map(code => {
    const x=aa.get(code), y=bb.get(code);
    let status = !x ? 'onlyB' : !y ? 'onlyA' : x.amount === null || y.amount === null ? 'missing' : (x.totalGroup??null)!==(y.totalGroup??null) || (x.unit??null)!==(y.unit??null) ? 'definition' : 'same';
    const comparable = !!x && !!y && !['missing','definition'].includes(status);
    let delta=null, variation='No evaluable';
    if (comparable) {
      const value=cents(y.amount)-cents(x.amount);
      if (value > 999999999999999n || value < -999999999999999n) throw Error('Diferencia fuera del límite admitido. No se redondea ni trunca.');
      delta=decimal(value); variation=percent(value,cents(x.amount));
      status = value !== 0n ? 'changed' : x.description!==y.description || x.sourceRows!==y.sourceRows ? 'metadata' : 'same';
    }
    return {code,description:x&&y&&x.description!==y.description?`A: ${x.description} | B: ${y.description}`:(y||x).description,
      amountA:x?.amount??null,amountB:y?.amount??null,delta,variation,status,statusLabel:statusLabels[status],comparable,
      countA:x?.sourceRows??null,countB:y?.sourceRows??null,groups:[x?.totalGroup??null,y?.totalGroup??null],
      descriptionChanged:!!x&&!!y&&x.description!==y.description};
  });
  const info=d=>({datasetId:d.datasetId,date:d.date,type:d.type,closureStatus:d.closureStatus,statementCount:d.statementCount,sourceLabel:d.sourceLabel,reportHash:d.reportHash,payloadHash:d.payloadHash});
  const model=freeze({version:'payroll-comparison.v1',a:info(a),b:info(b),keyA:comparisonSourceKey(a),keyB:comparisonSourceKey(b),rows,
    changed:rows.filter(r=>r.status==='changed').length,review:rows.filter(r=>!r.comparable).length,
    warnings:[...(a.statementCount!==b.statementCount?['La cantidad de legajos difiere; los importes no reflejan una variación salarial individual.']:[]),
      ...(a.date===b.date?['Ambas fuentes tienen la misma fecha: se comparan versiones o corridas, no meses distintos.']:[]),
      ...(a.closureStatus!=='closed'||b.closureStatus!=='closed'?['Al menos una fuente está abierta o no informa cierre.']:[])]});
  valid.add(model); return model;
}
export function comparisonDocument(model, filter={}) {
  if (!valid.has(model)) throw Error('Consultá ambas liquidaciones antes de exportar.');
  const state=filter.state??'all', group=filter.group??'all', search=String(filter.search??'').trim(), sort=filter.sort??'code';
  if (!['all','changes','review','same'].includes(state)||!['all','earnings','discounts','contributions','totals'].includes(group)||!['code','magnitude'].includes(sort)||search.length>100) throw Error('Filtro de comparación inválido.');
  const groupCodes={earnings:['993','994','995'],discounts:['996'],contributions:['990']};
  const selected=model.rows.filter(r=>{
    const total=Number(r.code)>=990&&Number(r.code)<=999;
    return (state==='all'||state==='changes'&&r.status!=='same'||state==='review'&&!r.comparable||state==='same'&&r.status==='same')
      && (group==='all'||group==='totals'&&total||groupCodes[group]&&!total&&r.groups.some(g=>groupCodes[group].includes(g)))
      && (!search||fold(r.code+' '+r.description).includes(fold(search)));
  });
  if (sort==='magnitude') selected.sort((a,b)=>{
    if(a.delta===null||b.delta===null)return a.delta===null&&b.delta===null?Number(a.code)-Number(b.code):a.delta===null?1:-1;
    const abs=s=>{const n=cents(s);return n<0n?-n:n},x=abs(a.delta),y=abs(b.delta);return x===y?Number(a.code)-Number(b.code):x>y?-1:1;
  });
  const label=d=>`${d.date} · ${d.type} · ${d.statementCount} legajos · ${closure(d.closureStatus)}`;
  return {title:'Comparación de liquidaciones',columns:[{label:'Código',type:'text',width:11},{label:'Descripción',type:'text',width:44},{label:'Importe A',type:'money',width:25},{label:'Importe B',type:'money',width:25},{label:'Diferencia B - A',type:'money',width:25},{label:'Variación sobre A',type:'text',width:24},{label:'Legajos A / B',type:'text',width:18},{label:'Estado',type:'text',width:30}],
    rows:selected.map(r=>[r.code,r.description,r.amountA,r.amountB,r.delta,r.variation,`${r.countA??'Ausente'} / ${r.countB??'Ausente'}`,r.statusLabel]),totals:[],
    notes:[`A: ${label(model.a)}. B: ${label(model.b)}.`,
      'Comparación agregada, no aumento individual ni pago. No se suman totalizadores. Ausente no equivale a cero. Diferencia y porcentaje no evaluables con datos faltantes o definición diferente.',
      'Variación = (B - A) / A, sólo con base positiva; redondeada a dos decimales. ' + model.warnings.join(' '),
      `Filtro: ${({all:'Todos',changes:'Con cambios',review:'No comparables',same:'Sin cambios'})[state]} · ${({all:'Todos los grupos',earnings:'Haberes',discounts:'Descuentos',contributions:'Aportes patronales',totals:'Totalizadores'})[group]} · ${search||'Sin búsqueda'} · ${sort==='code'?'Código':'Mayor diferencia absoluta'}.`,
      `A SHA-256: ${model.a.reportHash}`,`B SHA-256: ${model.b.reportHash}`],
    metadata:[['Período',`${model.a.date} a ${model.b.date}`],['Fuente A',model.a.sourceLabel],['Fuente B',model.b.sourceLabel],['Dataset A',model.a.datasetId],['Dataset B',model.b.datasetId],['SHA-256 A',model.a.reportHash],['SHA-256 B',model.b.reportHash],['Conjunto A',model.a.payloadHash],['Conjunto B',model.b.payloadHash],['Filas del filtro',selected.length]],
    filename:`municontrol_comparacion_${model.a.date}_${model.a.type.toLowerCase()}_${model.b.date}_${model.b.type.toLowerCase()}_${model.b.datasetId.slice(-8)}`};
}
