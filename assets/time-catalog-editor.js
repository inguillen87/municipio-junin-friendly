import {timeCatalogPayload, timeCatalogReferenceKey, timeCatalogInteger} from './time-catalog-contract.js';
import {TimeCatalogReviewSession, catalogCivilDate, CATALOG_KIND_LABELS as kinds} from './time-catalog-review-model.js';
import {pickerQuery, pickerResult} from './employee-picker-model.js';
import {assignmentBulkPlan, ASSIGNMENT_BULK_LIMIT} from './time-catalog-bulk-assignment.js';

const make = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
const option = (value, title) => { const n = make('option', title); n.value = value; return n; };
let fieldIndex = 0;
const label = (title, input) => {
  const n = make('label'), text = make('span', title); text.id = 'catalog-field-label-' + (++fieldIndex);
  input.setAttribute('aria-labelledby', text.id); n.append(text, input); return n;
};
function input(type = 'text', value = '', required = true) { const n = make('input'); n.type = type; n.value = value; n.required = required; return n; }
function select(options, value = '') { const n = make('select'); n.required = true; n.append(option('', 'Elegí una opción'), ...options.map(([v, t]) => option(v, t))); n.value = value; return n; }
const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const integer = (text, min, max) => {
  if (!/^(0|[1-9]\d*)$/.test(text) || !timeCatalogInteger(Number(text), min, max)) throw Error('Revisá los números de revisión, secuencia y tolerancia.');
  return Number(text);
};
const clock = text => /^\d{2}:\d{2}$/.test(text) ? text + ':00' : text;
export function catalogEditorPayload(kind, fields, spec, original, hash) {
  const reference = {title: fields.title, ...(fields.code ? {code: fields.code} : {}), ...(fields.legalReference ? {legalReference: fields.legalReference} : {})};
  if (!original && !fields.code) throw Error('La nueva configuración necesita un código estable.');
  if (original && fields.code !== (original.reference?.code || '')) throw Error('El código del borrador no puede cambiar.');
  return timeCatalogPayload(kind, {effectiveFrom: fields.from, ...(fields.to ? {effectiveTo: fields.to} : {}),
    logicalKeyHash: original?.logicalKeyHash || hash, revision: original?.revision || integer(fields.revision, 1, 999999),
    timezone: 'America/Argentina/Mendoza', ...(original?.sourceContractId ? {sourceContractId: original.sourceContractId} : {}), reference, spec});
}

// One volatile form. The shared review session owns all receipts and attempts.
export class TimeCatalogEditor {
  constructor({container, session, catalogRead, directoryRead, changed, failed}) {
    Object.assign(this, {container, session, catalogRead, directoryRead, changed, failed}); this.clear();
  }
  clear() { this.generation = (this.generation || 0) + 1; this.container.replaceChildren(); this.rows = []; this.target = null; this.selectedTargets = null; this.employeeResults = null; this.targets = new Map(); this.multiple = false; this.dependencies = {}; this.original = null; this.fields = {}; this.kind = null; this.loading = false; }
  field(title, node, name) { this.fields[name] = node; this.grid.append(label(title, node)); return node; }
  start(kind, original = null, assignment = null) {
    this.clear(); this.kind = kind; this.original = original ? structuredClone(original) : null;
    this.grid = make('div'); this.grid.className = 'editor-grid'; this.container.append(this.grid);
    const title = this.field('Nombre de la configuración', input('text', original?.reference?.title || ''), 'title'); title.maxLength = 120; title.minLength = 3;
    const code = this.field('Código estable', input('text', original?.reference?.code || '', !original), 'code'); code.maxLength = 64; code.pattern = '[a-z][a-z0-9_.-]{1,63}'; code.readOnly = Boolean(original);
    if (original && !original.reference?.code) code.placeholder = 'Revisión anterior sin código visible';
    const legal = this.field('Referencia documental (opcional)', input('text', original?.reference?.legalReference || '', false), 'legalReference'); legal.maxLength = 200; legal.minLength = 3;
    const revision = this.field('Número de revisión', input('number', original?.revision || '1'), 'revision'); revision.min = 1; revision.max = 999999; revision.readOnly = Boolean(original);
    this.field('Vigente desde', input('date', original?.effectiveFrom || ''), 'from'); this.field('Vigente hasta (opcional)', input('date', original?.effectiveTo || '', false), 'to');
    this.container.append(make('p', 'El código identifica esta configuración y se conserva en sus revisiones. Los valores requieren respaldo municipal; guardar un borrador no lo aprueba ni calcula asistencia.'));
    if (original?.sourceContractId) this.container.append(make('p', 'La fuente vinculada y las huellas documentales existentes se conservan.'));
    if (kind === 'shift') {
      for (const [name, title] of [['entryToleranceSeconds','Tolerancia de entrada (segundos)'],['exitToleranceSeconds','Tolerancia de salida (segundos)']]) {
        const n = this.field(title, input('number', original?.spec[name] ?? ''), name); n.min = 0; n.max = 21600;
      }
    }
    if (kind === 'assignment') { this.assignment(assignment); return; }
    const description = {calendar: 'Declarar días', shift: 'Declarar tramos de trabajo, pausa o guardia', rule_profile: 'Declarar parámetros documentados'}[kind];
    this.container.append(make('h4', description));
    this.rowList = make('div'); this.container.append(this.rowList);
    const entries = original?.spec[{calendar:'days',shift:'intervals',rule_profile:'parameters'}[kind]] || [{}]; entries.forEach(r => this.addRow(r));
    this.add = make('button', 'Agregar ' + ({calendar:'día',shift:'tramo',rule_profile:'parámetro'})[kind]); this.add.type = 'button'; this.add.addEventListener('click', () => { this.addRow({}); this.changed(); }); this.container.append(this.add);
    this.limit();
  }
  limit() { const max = {calendar:732,shift:224,rule_profile:256}[this.kind]; if (this.add) this.add.disabled = this.rows.length >= max; }
  addRow(value) {
    const max = {calendar:732,shift:224,rule_profile:256}[this.kind]; if (this.rows.length >= max) throw Error('Se alcanzó el límite de filas de esta configuración.');
    const row = {node:make('fieldset'), values:{}, evidence:value.evidenceSha256}; row.node.className = 'editor-row'; row.node.append(make('legend', ({calendar:'Día',shift:'Tramo',rule_profile:'Parámetro'})[this.kind]));
    const add = (name, title, n) => { row.values[name] = n; row.node.append(label(title, n)); return n; };
    if (this.kind === 'calendar') {
      add('date', 'Fecha', input('date', value.date || ''));
      add('kind', 'Tipo de día', select([['working','Laborable'],['non_working','No laborable'],['holiday','Feriado'],['special','Especial']], value.kind));
      const code = add('code', 'Código del día', input('text', value.code || '')); code.maxLength = 64;
      if (row.evidence) row.node.append(make('p', 'Huella documental existente conservada.'));
    } else if (this.kind === 'shift') {
      add('day', 'Día de la semana', select(weekdays.map((w,i) => [String(i + 1), w]), String(value.day || '')));
      const sequence = add('sequence', 'Secuencia en el día', input('number', value.sequence || '')); sequence.min = 1; sequence.max = 32;
      add('kind', 'Tipo de tramo', select([['work','Trabajo'],['break','Pausa'],['on_call','Guardia']], value.kind));
      for (const [k,t] of [['start','Inicio'],['end','Fin']]) { const n = add(k, t, input('time', value[k] || '')); n.step = 1; }
      const cross = input('checkbox', '', false); cross.checked = value.crossesMidnight === true; add('crossesMidnight','Termina al día siguiente',cross);
    } else {
      add('key', 'Clave del parámetro', input('text', value.key || '')).maxLength = 96;
      const type = add('valueKind', 'Tipo de valor', select([['integer','Entero'],['decimal','Decimal'],['boolean','Sí / No'],['time','Horario'],['code','Código']], value.valueKind));
      add('unitCode', 'Unidad documentada', input('text', value.unitCode || '')).maxLength = 32;
      const valueLabel = make('div'); row.node.append(valueLabel);
      const setValue = (v = '') => { const n = type.value === 'boolean' ? select([['true','Sí'],['false','No']], String(v)) : input(type.value === 'time' ? 'time' : 'text', v); if (n.type === 'time') n.step = 1; else if (type.value !== 'boolean') n.maxLength = 96; valueLabel.replaceChildren(label('Valor declarado',n)); row.values.value = n; };
      setValue(value.value ?? ''); type.addEventListener('change', () => setValue());
    }
    const remove = make('button', 'Quitar fila'); remove.type = 'button'; remove.addEventListener('click', () => { this.rows = this.rows.filter(r => r !== row); row.node.remove(); this.limit(); this.changed(); }); row.node.append(remove);
    this.rows.push(row); this.rowList.append(row.node); this.limit();
  }
  assignment(current) {
    this.target = current ? {...current.target} : null;
    if (!current) {
      const multiple = input('checkbox', '', false);
      const mode = label('Preparar para varios contratos', multiple); mode.className='check'; this.container.append(mode);
      multiple.addEventListener('change',()=>{this.multiple=multiple.checked;this.targets.clear();if(this.multiple&&this.target)this.targets.set(this.target.contractId.toLowerCase(),{...this.target});this.employeeResults.replaceChildren();this.renderTarget();this.changed();});
      this.container.append(make('p','Para varios contratos, elegí hasta 100 entre páginas y búsquedas. El código común admite hasta 47 caracteres; cada borrador recibe un código estable propio.'));
    }
    this.container.append(make('h4', 'Contrato destinatario'));
    this.targetLabel = make('p'); this.renderTarget(); this.container.append(this.targetLabel);
    this.selectedTargets = make('div'); this.container.append(this.selectedTargets);
    const search = input('search', '', false); search.minLength = 2; search.maxLength = 100;
    const find = make('button', 'Buscar contrato'); find.type = 'button';
    const row = make('div'); row.className = 'editor-grid'; row.append(label('Nombre o número de legajo', search), find); this.container.append(row);
    this.employeeResults = make('div'); this.container.append(this.employeeResults);
    const employeePage = async (page) => {
      const generation = this.generation, query = pickerQuery(search.value, page); this.loading = true; this.changed();
      try { const result = pickerResult(await this.directoryRead(query), page); if (generation !== this.generation) return;
        this.employeeResults.replaceChildren(make('p', `${result.pagination.total} contratos del filtro · Página ${page} de ${result.pagination.pages}`));
        if(this.multiple){for(const [title,selecting] of [['Seleccionar esta página',true],['Quitar esta página',false]]){const button=make('button',title);button.type='button';button.addEventListener('click',()=>{const size=new Set([...this.targets.keys(),...result.rows.map(r=>r.contractId.toLowerCase())]).size;if(selecting&&size>ASSIGNMENT_BULK_LIMIT){this.failed(Error('Esta página supera el límite conjunto de 100 contratos. No se seleccionó parcialmente.'));return;}for(const r of result.rows){const key=r.contractId.toLowerCase();if(selecting)this.targets.set(key,{contractId:r.contractId,legajo:r.legajo,name:r.nombre});else this.targets.delete(key);}this.target=[...this.targets.values()][0]||null;this.renderTarget();this.changed();});this.employeeResults.append(button);}}
        result.rows.forEach(r => {
          if(this.multiple){const chosen=input('checkbox','',false);chosen.dataset.assignmentContract=r.contractId.toLowerCase();chosen.checked=this.targets.has(r.contractId.toLowerCase());chosen.disabled=!chosen.checked&&this.targets.size>=ASSIGNMENT_BULK_LIMIT;
            const item=label(`Seleccionar ${r.legajo} · ${r.nombre || 'Nombre no informado'}`,chosen);item.className='check assignment-target';
            chosen.addEventListener('change',()=>{const key=r.contractId.toLowerCase();if(chosen.checked){if(this.targets.size>=ASSIGNMENT_BULK_LIMIT){chosen.checked=false;this.failed(Error('La selección admite hasta 100 contratos; no se recorta.'));return;}this.targets.set(key,{contractId:r.contractId,legajo:r.legajo,name:r.nombre});}else this.targets.delete(key);this.target=[...this.targets.values()][0]||null;this.renderTarget();this.changed();});this.employeeResults.append(item);
          }else{const b = make('button', `Elegir ${r.legajo} · ${r.nombre || 'Nombre no informado'}`); b.type = 'button'; b.addEventListener('click', () => { this.target = {contractId:r.contractId,legajo:r.legajo,name:r.nombre}; this.renderTarget(); this.employeeResults.replaceChildren(); this.changed(); }); this.employeeResults.append(b);}
        });
        for (const [title, next, disabled] of [['Anterior',page-1,page<=1],['Siguiente',page+1,page>=result.pagination.pages]]) { const b = make('button',title); b.type='button'; b.disabled=disabled; b.addEventListener('click',()=>employeePage(next).catch(this.failed)); this.employeeResults.append(b); }
      } finally { if (generation === this.generation) { this.loading=false; this.changed(); } }
    };
    find.addEventListener('click',()=>employeePage(1).catch(this.failed));
    for (const [key, kind] of [['shift','shift'],['calendar','calendar'],['ruleProfile','rule_profile']]) {
      const section=make('section'); section.append(make('h4',kinds[kind]+' aprobados')); const chosen=make('p'); section.append(chosen);
      this.dependencies[key] = {record:current?.[key] ? structuredClone(current[key]) : null, chosen};
      const showChosen=()=>{ const r=this.dependencies[key].record; chosen.textContent=r ? `${r.reference?.title || kinds[kind]+' sin nombre visible'} · Revisión ${r.revision} · Desde ${catalogCivilDate(r.effectiveFrom)}` : 'Sin elegir'; }; showChosen();
      const results=make('div'), load=make('button','Consultar '+kinds[kind].toLowerCase()+' aprobados'); load.type='button'; section.append(load,results); this.container.append(section);
      const loadPage=async(offset)=>{const generation=this.generation; this.loading=true; this.changed();
        try {const data=await this.catalogRead({resource:'list',kind,status:'approved',limit:'25',offset:String(offset)}); if(generation!==this.generation)return;
          const validator=new TimeCatalogReviewSession(); validator.scope=this.session.scope; validator.permissions={...this.session.permissions}; validator.list(data,{kind,status:'approved',limit:25,offset});
          results.replaceChildren(make('p',`${validator.page.total} revisiones aprobadas · ${validator.records.length} en esta página`));
          validator.records.forEach(r=>{const b=make('button',`Elegir ${r.reference?.title || kinds[kind]+' sin nombre visible'} · Revisión ${r.revision} · Desde ${catalogCivilDate(r.effectiveFrom)}`); b.type='button'; b.addEventListener('click',()=>{this.dependencies[key].record=structuredClone(r);showChosen();results.replaceChildren();this.changed();});results.append(b);});
          for(const [title,next,disabled] of [['Anterior',offset-25,offset===0],['Siguiente',offset+25,!validator.page.hasMore||offset+25>100000]]){const b=make('button',title);b.type='button';b.disabled=disabled;b.addEventListener('click',()=>loadPage(next).catch(this.failed));results.append(b);}
        } finally {if(generation===this.generation){this.loading=false;this.changed();}}
      }; load.addEventListener('click',()=>loadPage(0).catch(this.failed));
    }
    this.container.append(make('p','La búsqueda muestra contratos administrativamente activos. El servidor verifica su vínculo, período laboral y las vigencias al enviar a revisión y aprobar.'));
  }
  renderTarget() {
    this.targetLabel.textContent=this.multiple ? `${this.targets.size} contratos seleccionados · Las páginas y búsquedas no recortan la selección.` : this.target ? `${this.target.legajo} · ${this.target.name || 'Nombre no informado'}` : 'Sin contrato elegido';
    this.employeeResults?.querySelectorAll('input[data-assignment-contract]').forEach(n=>{n.checked=this.targets.has(n.dataset.assignmentContract);n.disabled=!n.checked&&this.targets.size>=ASSIGNMENT_BULK_LIMIT;});
    if(this.selectedTargets){this.selectedTargets.replaceChildren();if(this.multiple)for(const target of this.targets.values()){const row=make('div');row.className='assignment-target';row.append(make('span',`${target.legajo} · ${target.name || 'Nombre no informado'}`));const remove=make('button','Quitar '+target.legajo);remove.type='button';remove.addEventListener('click',()=>{this.targets.delete(target.contractId.toLowerCase());this.target=[...this.targets.values()][0]||null;this.employeeResults.replaceChildren();this.renderTarget();this.changed();});row.append(remove);this.selectedTargets.append(row);}}
  }
  async bulkPlan() {
    if(!this.multiple||this.original||this.kind!=='assignment')throw Error('La preparación conjunta sólo crea borradores nuevos de asignación.');
    return assignmentBulkPlan(await this.payload(),[...this.targets.values()],Object.fromEntries(Object.entries(this.dependencies).map(([key,value])=>[key,value.record])));
  }
  async payload() {
    if(this.loading) throw Error('Esperá a que finalice la consulta de contratos o configuraciones.');
    const fields=Object.fromEntries(Object.entries(this.fields).map(([k,n])=>[k,n.value])); let spec;
    if(this.kind==='assignment') {
      if(!this.target || Object.values(this.dependencies).some(d=>!d.record)) throw Error('Elegí el contrato y las tres revisiones de configuración.');
      spec={employmentContractId:this.target.contractId,shiftEntryId:this.dependencies.shift.record.id,calendarEntryId:this.dependencies.calendar.record.id,ruleProfileEntryId:this.dependencies.ruleProfile.record.id};
    } else {
      const rows=this.rows.map(r=>Object.fromEntries(Object.entries(r.values).map(([k,n])=>[k,n.type==='checkbox'?n.checked:n.value])));
      if(this.kind==='calendar') spec={days:rows.map((r,i)=>({...r,...(this.rows[i].evidence?{evidenceSha256:this.rows[i].evidence}:{})}))};
      if(this.kind==='shift') spec={entryToleranceSeconds:integer(fields.entryToleranceSeconds,0,21600),exitToleranceSeconds:integer(fields.exitToleranceSeconds,0,21600),intervals:rows.map(r=>({...r,day:integer(r.day,1,7),sequence:integer(r.sequence,1,32),start:clock(r.start),end:clock(r.end)}))};
      if(this.kind==='rule_profile') spec={parameters:rows.map(r=>{
        if(r.valueKind==='boolean' && !['true','false'].includes(r.value))throw Error('Elegí Sí o No para cada parámetro lógico.');
        return {...r,value:r.valueKind==='boolean'?r.value==='true':r.valueKind==='time'?clock(r.value):r.value};
      })};
    }
    const hash=this.original?.logicalKeyHash || await timeCatalogReferenceKey(this.kind,fields.code);
    return catalogEditorPayload(this.kind,fields,spec,this.original,hash);
  }
}
