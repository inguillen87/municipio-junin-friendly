// A municipality without a salary master yet starts «Preparar nueva versión» from an empty draft. The grid counted the
// draft changes with salaryDiff, which refuses an empty catalog: the throw happened while rendering, React dropped the
// whole Parámetros task and its notice was erased, so the person saw a blank screen. Behaviour is exercised end to end by
// scripts/verify-native-salary-file-browser.mjs («first master prepared from complete concept and scale»); these guards
// keep the two fixes from being undone by a refactor that never runs the browser verifier.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {salaryDiff,salaryItems,salaryRowKey,SalaryInputError} from '../assets/native-salary-catalog-model.js';
import {row} from './fixtures/native-salary-synthetic.js';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const catalog=read('src/islands/NativeSalaryCatalog.jsx'),entry=read('src/islands/payroll-parameters-entry.jsx');

test('salaryDiff rechaza un catálogo propuesto vacío: el render no puede llamarlo con el primer borrador',()=>{
 assert.throws(()=>salaryDiff([],[]),error=>error instanceof SalaryInputError&&/entre 1 y 10000 filas/.test(error.message));
});

test('el conteo de cambios del borrador no lanza con el primer maestro y sigue contando los cambios reales',()=>{
 const body=catalog.match(/draftKeys=(draft\?[^;]+);/)?.[1];
 assert.ok(body,'draftKeys se calcula en el render');
 const draftKeys=new Function('salaryDiff','draft','return '+body).bind(null,salaryDiff);
 assert.equal(draftKeys(null),null,'sin borrador no hay conteo');
 const empty=draftKeys({baseItems:[],items:[]});
 assert.ok(empty instanceof Set);assert.equal(empty.size,0,'primer maestro: borrador vacío, cero cambios, sin excepción');
 const base=salaryItems([row({code:'1'}),row({code:'2'})]),first=salaryItems([row({code:'1'})]);
 assert.deepEqual([...draftKeys({baseItems:[],items:first})],[salaryRowKey(first[0])],'la primera fila del primer maestro es un cambio');
 assert.equal(draftKeys({baseItems:base,items:structuredClone(base)}).size,0,'un borrador igual a la versión consultada no tiene cambios');
 const edited=structuredClone(base);edited[1].label='Concepto sintético revisado';
 assert.deepEqual([...draftKeys({baseItems:base,items:edited})],[salaryRowKey(edited[1])]);
 // Deleting history is still refused where it is prepared (add/apply call salaryDiff before setDraft): the guard only covers «empty».
 assert.throws(()=>draftKeys({baseItems:base,items:[base[0]]}),/No borres antecedentes/);
});

test('la comparación del borrador y el envío siguen protegidos con el primer maestro vacío',()=>{
 assert.ok(catalog.includes("function Differences({before,after}){if(!after.length)return <p>Todavía no hay definiciones en el borrador.</p>;"));
 assert.ok(catalog.includes("<button disabled={disabled||!draft.items.length} className=\"sc-primary\" onClick={()=>ask('propose')}>Revisar versión completa</button>"));
});

test('si Parámetros falla al dibujarse, el aviso se escribe cuando React terminó y no queda una tarea en blanco',()=>{
 assert.ok(entry.includes("onUncaughtError() { queueMicrotask(() => { root.unmount(); host.textContent = 'No se pudo abrir Parámetros. Actualizá la página antes de iniciar una operación.'; }); }"));
 assert.doesNotMatch(entry,/onUncaughtError\(\) \{ root\.unmount\(\)/,'desmontar dentro del aviso de React vacía el contenedor después de escribir el mensaje');
});
