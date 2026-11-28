// «Valores del mes»: la vista de consulta del maestro salarial. Se elige convenio y mes y se ven la escala, los conceptos
// y los auxiliares con el valor escrito como se lee. El detalle de cada fila (vigencia, mes anterior, respaldo) se abre a
// pedido. Es sólo lectura: preparar una versión nueva sigue en la tabla completa.
import {useMemo,useState} from 'react';
import {salaryMonthChoices,salaryMonthView,salaryMonthTitle} from '../../assets/native-salary-month-view-model.js';

const TABS=[['scale','Escala','Clase','Tabla','Básico'],['concepts','Conceptos','Código','Nombre','Valor'],['auxiliaries','Auxiliares','Código','Nombre','Valor']];
const css=`.sm{margin:18px 0 8px;padding:20px;border:1px solid #dbe6e4;border-radius:14px;background:#fff;color:#153847}.sm header{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px}.sm h3{margin:0;font-size:1.25rem}.sm header p{margin:0;color:#4a5d61;font-size:.92rem}
.sm-pick{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:16px 0 14px}.sm-pick label{display:grid;gap:4px;font-size:.85rem;color:#4a5d61}.sm-pick select,.sm-pick input{min-height:44px;padding:0 12px;border:1px solid #c9d8d5;border-radius:8px;background:#fff;color:#153847;font:inherit}
.sm-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.sm-tabs button{min-height:44px;padding:0 16px;border:1px solid #c9d8d5;border-radius:999px;background:#fff;color:#33484d;font:inherit;font-weight:600;cursor:pointer}.sm-tabs button[aria-pressed="true"]{border-color:#15776f;background:#e6f3f0;color:#0d544e}.sm-tabs button:focus-visible,.sm-list summary:focus-visible{outline:3px solid #0b5c8a;outline-offset:2px}
.sm-head,.sm-list summary{display:grid;grid-template-columns:minmax(64px,110px) minmax(0,1fr) auto 92px;gap:12px;align-items:center}.sm-head{padding:8px 16px;font-size:.78rem;letter-spacing:.04em;text-transform:uppercase;color:#5b6e72}.sm-head span:nth-child(3){text-align:right}
.sm-list{margin:0;padding:0;list-style:none;border:1px solid #dbe6e4;border-radius:12px;overflow:hidden}.sm-list li+li{border-top:1px solid #e6eeec}.sm-list summary{min-height:52px;padding:8px 16px;cursor:pointer;list-style:none}.sm-list summary::-webkit-details-marker{display:none}.sm-list summary:hover{background:#f6faf9}.sm-list details[open] summary{background:#f1f7f5}
.sm-code{font-weight:700;overflow-wrap:anywhere}.sm-name{min-width:0;overflow-wrap:anywhere}.sm-name small{display:block;color:#5b6e72;font-size:.8rem}.sm-value{font-weight:700;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.sm-value.is-empty{font-weight:400;color:#5b6e72}
.sm-more{justify-self:end;color:#0b5c5a;font-size:.88rem;font-weight:600}.sm-more::after{content:'Ver detalle'}.sm-list details[open] .sm-more::after{content:'Ocultar'}
.sm-detail{padding:4px 16px 14px 138px;color:#33484d;font-size:.92rem;background:#f1f7f5}.sm-detail p{margin:4px 0;overflow-wrap:anywhere}.sm-empty{margin:8px 0 0;padding:16px;border:1px dashed #c9d8d5;border-radius:12px;color:#4a5d61}
@media(max-width:640px){.sm{padding:14px}.sm-head{display:none}.sm-list summary{grid-template-columns:minmax(0,1fr) auto;row-gap:2px}.sm-code{grid-column:1}.sm-name{grid-column:1 / -1;grid-row:2}.sm-value{grid-column:2;grid-row:1}.sm-more{grid-column:1 / -1;grid-row:3;justify-self:start}.sm-detail{padding-left:16px}}`;

export default function NativeSalaryMonthView({items,agreements,revision}){
 const choices=useMemo(()=>salaryMonthChoices(items,{agreementLabels:agreements}),[items,agreements]);
 const [chosenAgreement,setAgreement]=useState(null),[chosenMonth,setMonth]=useState(null),[tab,setTab]=useState('scale'),[query,setQuery]=useState('');
 const agreement=chosenAgreement!==null&&choices.agreements.some(a=>a.code===chosenAgreement)?chosenAgreement:choices.agreement;
 const month=chosenMonth!==null&&choices.months.includes(chosenMonth)?chosenMonth:choices.month;
 const view=useMemo(()=>salaryMonthView(items,{agreement,month,query}),[items,agreement,month,query]);
 if(!choices.months.length)return <section className="sm" data-salary-month><style>{css}</style><h3>Valores del mes</h3><p className="sm-empty">Todavía no hay valores habilitados en el maestro.</p></section>;
 const [, ,codeHead,nameHead,valueHead]=TABS.find(t=>t[0]===tab),rows=view[tab];
 return <section className="sm" data-salary-month aria-labelledby="salaryMonthTitle"><style>{css}</style>
  <header><h3 id="salaryMonthTitle">Valores del mes</h3><p data-salary-month-version>Versión {revision} del maestro · convenio {agreement} · {salaryMonthTitle(month)}</p></header>
  <div className="sm-pick">
   <label>Convenio<select data-salary-month-agreement aria-label="Convenio de los valores del mes" value={agreement} onChange={e=>setAgreement(e.target.value)}>{choices.agreements.map(a=><option key={a.code} value={a.code}>{a.code}{a.label?' · '+a.label:''}</option>)}</select></label>
   <label>Mes<select data-salary-month-month aria-label="Mes de los valores" value={month} onChange={e=>setMonth(e.target.value)}>{choices.months.map(m=><option key={m} value={m}>{salaryMonthTitle(m)}</option>)}</select></label>
   <label>Buscar<input type="search" data-salary-month-search aria-label="Buscar en los valores del mes" value={query} onChange={e=>setQuery(e.target.value)} maxLength={80} placeholder="Presentismo"/></label>
  </div>
  <div className="sm-tabs" role="group" aria-label="Qué ver">{TABS.map(([key,label])=><button type="button" key={key} data-salary-month-tab={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label} · {view[key].length}</button>)}</div>
  {rows.length?<><div className="sm-head" aria-hidden="true"><span>{codeHead}</span><span>{nameHead}</span><span>{valueHead}</span><span></span></div>
   <ul className="sm-list" data-salary-month-rows>{rows.map(r=><li key={r.key}><details><summary><span className="sm-code">{r.code}</span><span className="sm-name">{r.name}{r.nature&&<small>{r.nature}</small>}</span><span className={'sm-value'+(r.value===null?' is-empty':'')}>{r.value??'Sin valor declarado'}</span><span className="sm-more" aria-hidden="true"></span></summary>
    <div className="sm-detail"><p>{r.validity} {r.previous}</p><p>Respaldo: {r.reference}</p>{r.dependencies>0&&<p>{r.dependencies===1?'Usa otra definición del maestro.':'Usa otras '+r.dependencies+' definiciones del maestro.'}</p>}</div></details></li>)}</ul></>
   :<p className="sm-empty" data-salary-month-empty>{query.trim()?'Nada coincide con «'+query.trim()+'» en esta lista.':'No hay '+TABS.find(t=>t[0]===tab)[1].toLowerCase()+' con valor para el convenio '+agreement+' en '+salaryMonthTitle(month).toLowerCase()+'.'}</p>}
 </section>;
}
