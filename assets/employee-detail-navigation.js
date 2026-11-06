// Local navigation and quick actions over sections already rendered by the authorized detail view.
// No network requests, storage or lifecycle operations: summary, exports and print read the visible DOM only.
import { storedZip } from './clock-dashboard-zip.js';

const MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** '04 de sept de 2012', '04/09/2012' or '2012-09-04' → 'YYYY-MM-DD' (null when it is not a date). */
export function parseFichaDate(text) {
  const value = String(text || '').trim().toLowerCase().replace(/\./g, '');
  let m = /^(\d{1,2}) de ([a-zñ]+) de (\d{4})$/.exec(value);
  if (m && MONTHS[m[2]]) return [m[3], String(MONTHS[m[2]]).padStart(2, '0'), m[1].padStart(2, '0')].join('-');
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (m) return [m[3], m[2].padStart(2, '0'), m[1].padStart(2, '0')].join('-');
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? value : null;
}

/** Whole years and months between two ISO dates (to >= from), or null. */
export function elapsedBetween(from, to) {
  if (!from || !to || to < from) return null;
  const [y1, m1, d1] = from.split('-').map(Number), [y2, m2, d2] = to.split('-').map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) return null;
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** Visible label/value pairs of the ficha, grouped by section title. */
export function fichaRows(container) {
  const rows = [];
  for (const field of container.querySelectorAll('.detail-field')) {
    if (field.closest('[hidden]')) continue;
    const label = field.querySelector('dt')?.textContent?.trim(), value = field.querySelector('dd')?.textContent?.trim();
    const section = field.closest('section,details')?.querySelector('h3, summary')?.textContent?.trim() || 'Ficha';
    if (label && value !== undefined) rows.push({ section, label, value });
  }
  return rows;
}

const findValue = (rows, ...labels) => rows.find(row => labels.some(label => row.label.toLowerCase() === label.toLowerCase()) && row.value && row.value !== '—')?.value || null;

export function fichaSummary(rows, today = new Date().toISOString().slice(0, 10)) {
  const ingreso = parseFichaDate(findValue(rows, 'Ingreso', 'Fecha de ingreso')), birth = parseFichaDate(findValue(rows, 'Nacimiento', 'Fecha de nacimiento'));
  const service = elapsedBetween(ingreso, today), age = elapsedBetween(birth, today);
  return {
    status: findValue(rows, 'Situación', 'Estado'),
    service, age: age ? age.years : null,
    agreement: findValue(rows, 'Convenio'), category: findValue(rows, 'Categoría'),
    unit: findValue(rows, 'Repartición', 'Sector', 'Organización'),
  };
}

export function fichaText(title, subtitle, rows) {
  const lines = [title, subtitle, 'Generado ' + new Date().toLocaleString('es-AR') + ' · MuniControl', ''];
  let current = null;
  for (const row of rows) {
    if (row.section !== current) { current = row.section; lines.push('', current.toUpperCase()); }
    lines.push('  ' + row.label + ': ' + row.value);
  }
  return lines.join('\r\n') + '\r\n';
}

const xml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
export function fichaXlsx(title, subtitle, rows) {
  const table = [['Sección', 'Dato', 'Valor'], ...rows.map(row => [row.section, row.label, row.value])];
  const cells = table.map((row, i) => `<row r="${i + 1}">` + row.map((value, j) => `<c r="${'ABC'[j]}${i + 1}" t="inlineStr" s="${i ? 0 : 1}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('') + '</row>').join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="2" width="30" customWidth="1"/><col min="3" max="3" width="48" customWidth="1"/></cols><sheetData>${cells}</sheetData><autoFilter ref="A1:C${table.length}"/></worksheet>`;
  const info = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${[['Ficha', title], ['Detalle', subtitle], ['Generado', new Date().toLocaleString('es-AR')], ['Alcance', 'Datos visibles en la ficha al momento de exportar; no es un certificado.']].map((r, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr" s="1"><is><t>${xml(r[0])}</t></is></c><c r="B${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(r[1])}</t></is></c></row>`).join('')}</sheetData></worksheet>`;
  const rel = 'http://schemas.openxmlformats.org/package/2006/relationships', office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return storedZip([
    ['[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', `<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${office}"><sheets><sheet name="Ficha" sheetId="1" r:id="rId1"/><sheet name="Datos" sheetId="2" r:id="rId2"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${office}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="styles" Type="${office}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>'],
    ['xl/worksheets/sheet1.xml', sheet], ['xl/worksheets/sheet2.xml', info],
  ]);
}

function download(name, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function countUp(node, target, suffix) {
  if (reduceMotion() || !Number.isFinite(target) || target <= 0) { node.textContent = target + suffix; return; }
  const start = performance.now(), duration = 650;
  const step = now => { const t = Math.min(1, (now - start) / duration), eased = 1 - (1 - t) ** 3; node.textContent = Math.round(target * eased) + suffix; if (t < 1 && node.isConnected) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

export function mountEmployeeDetailNavigation(container){
 if(!container||container.querySelector(':scope > .employee-section-nav'))return;
 const collect=()=>[...container.children].filter(el=>el.matches('section,details')&&!el.hidden)
  .map(section=>{const heading=section.matches('details')?section.querySelector(':scope > summary'):section.querySelector('h3');
   const label=heading?.querySelector('strong')?.textContent||heading?.textContent;
   return{section,heading,label:label?.trim()};}).filter(x=>x.heading&&x.label);
 let sections=collect();if(sections.length<2)return;
 const nav=document.createElement('nav');nav.className='employee-section-nav';nav.setAttribute('aria-label','Navegación de la ficha');
 const copy=document.createElement('div'),title=document.createElement('strong'),hint=document.createElement('span');
 copy.className='esn-copy';title.textContent='Encontrá lo que necesitás en esta ficha';hint.textContent='Saltá a una sección o usá las acciones rápidas. No se modifica ningún dato.';copy.append(title,hint);
 const controls=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select'),go=document.createElement('button');
 controls.className='employee-section-controls';label.append(document.createTextNode('Ir a una sección'));
 const options=()=>sections.forEach((x,i)=>select.add(new Option(x.label,String(i))));options();label.append(select);
 go.type='button';go.className='button';go.textContent='Ir';go.setAttribute('aria-label','Ir a la sección');controls.append(label,go);
 // Summary strip (from the visible fields), section chips with scroll-spy and quick actions. Controls stay first in DOM order.
 const summary=document.createElement('div');summary.className='esn-summary';summary.setAttribute('aria-label','Resumen del legajo');
 const chips=document.createElement('div');chips.className='esn-chips';chips.setAttribute('role','group');chips.setAttribute('aria-label','Secciones de la ficha');
 const actions=document.createElement('div');actions.className='esn-actions';actions.setAttribute('role','group');actions.setAttribute('aria-label','Acciones rápidas de la ficha');
 const feedback=document.createElement('span');feedback.className='esn-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 nav.append(copy,controls,chips,actions);
 const dialog=container.closest('dialog');
 const heading=()=>({title:dialog?.querySelector('#dialogTitle, h2')?.textContent?.trim()||'Ficha de legajo',subtitle:dialog?.querySelector('#dialogSubtitle')?.textContent?.trim()||''});
 const fileBase=()=>{const legajo=fichaRows(container).find(r=>r.label.toLowerCase()==='legajo')?.value;return 'ficha-legajo-'+(/^\d{1,20}$/.test(legajo||'')?legajo:'sin-numero');};
 function scrollTo(index){
  if(!nav.isConnected||!container.isConnected)return;
  const item=sections[index];
  if(!item||item.section.parentElement!==container||item.section.hidden||!item.heading.isConnected)return;
  if(!item.heading.matches('summary'))item.heading.tabIndex=-1;
  // The body already reserves scroll padding for the bar; align it to the bar's real height so the title lands right under it.
  container.style.scrollPaddingTop=Math.ceil(nav.getBoundingClientRect().height)+'px';item.heading.style.scrollMarginTop='18px';
  item.heading.scrollIntoView({block:'start',behavior:reduceMotion()?'auto':'smooth'});item.heading.focus({preventScroll:true});
 }
 function jump(){if(/^\d+$/.test(select.value))scrollTo(Number(select.value));}
 function renderChips(){
  chips.replaceChildren(...sections.map((item,i)=>{const b=document.createElement('button');b.type='button';b.className='esn-chip';b.textContent=item.label;b.dataset.esnIndex=String(i);
   b.addEventListener('click',()=>{select.value=String(i);scrollTo(i);});return b;}));
 }
 function renderSummary(){
  const s=fichaSummary(fichaRows(container)),items=[];
  if(s.status)items.push(['Situación',s.status,null]);
  if(s.service)items.push(['Antigüedad',null,s.service]);
  if(Number.isInteger(s.age))items.push(['Edad',null,{years:s.age}]);
  if(s.agreement||s.category)items.push(['Convenio · categoría',[s.agreement,s.category].filter(Boolean).join(' · '),null]);
  if(s.unit)items.push(['Repartición',s.unit,null]);
  summary.replaceChildren(...items.map(([name,text,elapsed],i)=>{const card=document.createElement('div');card.className='esn-kpi';card.style.setProperty('--esn-i',String(i));
   const value=document.createElement('strong'),caption=document.createElement('span');caption.textContent=name;
   if(elapsed){value.textContent='0 años';countUp(value,elapsed.years,elapsed.years===1?' año':' años');if(elapsed.months!==undefined&&name==='Antigüedad'){const extra=document.createElement('small');extra.textContent=elapsed.months+(elapsed.months===1?' mes':' meses');card.append(value,extra,caption);return card;}}
   else value.textContent=text;
   card.append(value,caption);return card;}));
  summary.hidden=!items.length;
 }
 const say=text=>{feedback.textContent=text;};
 const action=(text,label,run)=>{const b=document.createElement('button');b.type='button';b.className='esn-action';b.textContent=text;b.setAttribute('aria-label',label);b.addEventListener('click',()=>{try{run();}catch{say('No se pudo completar la acción.');}});return b;};
 actions.append(
  action('Imprimir / PDF','Imprimir la ficha o guardarla como PDF',()=>{document.body.classList.add('mc-print-ficha');const done=()=>document.body.classList.remove('mc-print-ficha');addEventListener('afterprint',done,{once:true});window.print();setTimeout(done,1500);}),
  action('Excel','Descargar la ficha en Excel',()=>{const h=heading();download(fileBase()+'.xlsx',fichaXlsx(h.title,h.subtitle,fichaRows(container)),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');say('Excel descargado con los datos visibles.');}),
  action('TXT','Descargar la ficha como texto',()=>{const h=heading();download(fileBase()+'.txt','﻿'+fichaText(h.title,h.subtitle,fichaRows(container)),'text/plain;charset=utf-8');say('Texto descargado.');}),
  action('Copiar resumen','Copiar el resumen de la ficha',()=>{const h=heading();navigator.clipboard?.writeText(fichaText(h.title,h.subtitle,fichaRows(container))).then(()=>say('Resumen copiado.'),()=>say('El navegador no permitió copiar.'));}),
  feedback);
 renderChips();renderSummary();
 go.addEventListener('click',jump);select.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();jump();}});
 container.prepend(nav);nav.before(summary);
 // Scroll-spy: the chip of the last section whose title passed under the bar stays highlighted.
 let frame=0;
 const spy=()=>{frame=0;if(!nav.isConnected)return;const box=container.getBoundingClientRect(),line=nav.getBoundingClientRect().bottom+Math.max(24,(box.bottom-nav.getBoundingClientRect().bottom)*0.25);let index=0;
  sections.forEach((x,i)=>{if(x.section.getBoundingClientRect().top<=line)index=i;});
  if(container.scrollTop+container.clientHeight>=container.scrollHeight-2)index=sections.length-1;
  chips.querySelectorAll('.esn-chip').forEach(c=>c.toggleAttribute('aria-current',c.dataset.esnIndex===String(index)));
  const active=chips.querySelector('[aria-current]');if(active&&(active.offsetLeft<chips.scrollLeft||active.offsetLeft+active.offsetWidth>chips.scrollLeft+chips.clientWidth))chips.scrollLeft=active.offsetLeft-12;};
 const watch=()=>{if(!frame)frame=requestAnimationFrame(spy);};
 watch();
 const onScroll=()=>watch();container.addEventListener('scroll',onScroll,{passive:true});
 let stopped=false;
 const observer=new MutationObserver(()=>{
  if(stopped)return;
  if(nav.parentElement!==container||!container.isConnected){summary.remove();dispose();return;}
  const next=collect();
  if(next.length===sections.length&&next.every((x,i)=>x.section===sections[i].section&&x.heading===sections[i].heading&&x.label===sections[i].label))return;
  const selected=sections[Number(select.value)]?.section;
  sections=next;select.replaceChildren();options();const index=sections.findIndex(x=>x.section===selected);select.value=String(Math.max(0,index));nav.hidden=sections.length<2;
  renderChips();renderSummary();watch();
 });
 function dispose(){if(stopped)return;stopped=true;observer.disconnect();cancelAnimationFrame(frame);container.removeEventListener('scroll',onScroll);dialog?.removeEventListener('close',dispose);}
 observer.observe(container,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden']});dialog?.addEventListener('close',dispose,{once:true});return dispose;
}
