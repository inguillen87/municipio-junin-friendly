import test from 'node:test';import assert from 'node:assert/strict';import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {assistanceParts,assistanceZip,assistanceCapture} from './fixtures/payroll-assistance-synthetic.js';
import {readAssistanceXlsx} from '../assets/payroll-assistance-xlsx-reader.js';
import {createAssistanceReference,compareAssistanceSelection} from '../assets/payroll-assistance-xlsx-model.js';
import {parseAssistanceXml} from '../assets/payroll-assistance-xml.js';
const single=()=>assistanceParts({profileIds:['jurisdiction42'],external:false});
async function mutated(change){const parts=single(),before=strFromU8(parts['xl/worksheets/sheet1.xml']),after=change(before);assert.notEqual(after,before,'mutation changed the synthetic source');parts['xl/worksheets/sheet1.xml']=strToU8(after);return readAssistanceXlsx(zipSync(parts),{unzipSync});}
for(const[name,change]of [
 ['fila999sin cierre',s=>s.replace(/(<row r="999">[\s\S]*?)<\/row>(?=<\/sheetData>)/,'$1')],
 ['celdaD999sin cierre',s=>s.replace(/(<c r="D999">[\s\S]*?)<\/c>(?=<\/row><\/sheetData>)/,'$1')],
 ['celdaD999cierre equivocado',s=>s.replace(/(<c r="D999">[\s\S]*?)<\/c>(?=<\/row><\/sheetData>)/,'$1</cx>')]
])test('regresión exacta del peer: '+name+' rechaza el XLSX entero',async()=>{await assert.rejects(()=>mutated(change),/XML inválido|cierre|anidamiento/);});
const badStructures=[
 ['anidamiento inverso',s=>s.replace('</row></sheetData>','</sheetData></row>')],
 ['múltiples raíces',s=>s+'<worksheet/>'],
 ['texto residual en sheetData',s=>s.replace('<sheetData>','<sheetData>NO CONSUMIDO')],
 ['texto residual en row',s=>s.replace('<row r="999">','<row r="999">NO CONSUMIDO')],
 ['texto residual en cell',s=>s.replace('<c r="D999">','<c r="D999">NO CONSUMIDO')],
 ['elemento ajeno en sheetData',s=>s.replace('<sheetData>','<sheetData><unknown/>')],
 ['elemento ajeno en row',s=>s.replace('<row r="999">','<row r="999"><unknown/>')],
 ['elemento ajeno dentro de v',s=>s.replace('<v>0</v>','<v><n>0</n></v>')],
 ['dos valores en cell',s=>s.replace('<c r="D999"><v>0</v>','<c r="D999"><v>0</v><v>0</v>')],
 ['atributo duplicado',s=>s.replace('<row r="999">','<row r="999" r="999">')],
 ['atributo sin comillas',s=>s.replace('<row r="999">','<row r=999>')],
 ['procesamiento',s=>s.replace('<sheetData>','<?execute source="never"?><sheetData>')],
 ['entidad desconocida',s=>s.replace('CAJAS ASISTENCIALES','CAJAS &unknown; ASISTENCIALES')],
 ['entidad externa declarada',s=>s.replace('<worksheet','<!DOCTYPE worksheet [<!ENTITY x SYSTEM "https://example.invalid/private">]><worksheet')],
 ['namespace falso en filas',s=>s.replace('<row r="999">','<row xmlns="urn:wrong" r="999">')],
 ['CDATA no escalar en sheetData',s=>s.replace('<sheetData>','<sheetData><![CDATA[<row r="700"><c r="D700"><v>1</v></c></row>]]>')],
 ['cierre de XML equivocado',s=>s.replace('</worksheet>','</workbook>')]
];
for(const[name,change]of badStructures)test('estructura cerrada: '+name+' no emite complete:true',async()=>{await assert.rejects(()=>mutated(change));});
test('comentarios con row/c aparentes no se convierten en filas y CDATA escalar se conserva como texto',async()=>{const p=await mutated(s=>s.replace('<sheetData>','<sheetData><!-- <row r="700"><c r="D700"><v>1</v></c></row> -->').replace('Entidad inventada sin efecto municipal','<![CDATA[Entidad inventada sin efecto municipal]]>'));const sheet=p.sheets[0];assert.equal(sheet.rows.at(-1).number,999);assert.equal(sheet.rows.some(r=>r.number===700),false);assert.equal(sheet.rows.find(r=>r.number===6).cells.find(c=>c.ref==='C6').raw,'Entidad inventada sin efecto municipal');});
test('parser rechaza comentarios mal formados, declaración duplicada y atributos expandidos duplicados',()=>{for(const s of ['<a><!-- nope---></a>','<?xml version="1.0" version="1.0"?><a/>','<a xmlns:x="urn:q" xmlns:y="urn:q" x:r="1" y:r="2"/>','<a>&#0;</a>','<a><b></a></b>','<a/><b/>','<a>text]]></a>','<a><b></b>'] )assert.throws(()=>parseAssistanceXml(s));assert.equal(parseAssistanceXml('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a xmlns="urn:a"><b><![CDATA[<not-a-node/>]]></b></a>').children[0].text,'<not-a-node/>');});
test('cabeceras GENERAL E5/F5 intercambiadas nunca permiten compararJ55comoJ42',async()=>{const capture=assistanceCapture(),reference=await createAssistanceReference(capture),row=capture.saved.result.rows.find(r=>r.unit==='money'&&r.nature!=='auxiliary');const parts=assistanceParts({profileIds:['general42and55'],headerPatch:{E5:'JUR. 55',F5:'JUR. 42'},extraCells:[{ref:'E6',value:row.amount}]});await assert.rejects(()=>readAssistanceXlsx(zipSync(parts),{unzipSync}),/todas las cabeceras/);assert.ok(reference.jurisdictionCaptured);});
const changedHeaders=[['general42and55','E4','LIQUIDACION'],['general42and55','D3','SUPLEMENTARIAS'],['general42and55','I5','A DEVOLVER'],['general42and55','E3','NUEVA LIQUIDACION'],['jurisdiction42','E5','JUR. 55'],['jurisdiction42','E4','LIQUIDACION'],['jurisdiction42','G3','OTRO'],['jurisdiction42','G5','A DEVOLVER'],['jurisdiction55','E5','JUR. 42'],['jurisdiction55','E4','LIQUIDACION'],['jurisdiction55','F4','A DEVOLVER'],['jurisdiction55','G4','RETENCIONES'],['jurisdiction55','J3','OTRA COLUMNA']];
for(const[id,cell,value]of changedHeaders)test('contrato completo de cabeceras: '+id+' '+cell,async()=>{await assert.rejects(()=>readAssistanceXlsx(assistanceZip({profileIds:[id],headerPatch:{[cell]:value}}),{unzipSync}),/todas las cabeceras/);});
test('codes sparse length1 y propiedades ajenas no producen igualdad cero sin conceptos',async()=>{const preview=await readAssistanceXlsx(assistanceZip({profileIds:['jurisdiction42']}),{unzipSync}),reference=await createAssistanceReference(assistanceCapture()),args={preview,reference,sheetId:preview.sheets[0].id,cellReference:'D8',jurisdiction:'42',scopeConfirmed:true},code=reference.codes[0],sparse=new Array(1),named=[code];named.extra=code;const symbolic=[code];symbolic[Symbol('extra')]=code;const accessor=[];Object.defineProperty(accessor,0,{get(){return code;},enumerable:true});for(const codes of [sparse,named,symbolic,accessor,{0:code,length:1}])assert.throws(()=>compareAssistanceSelection({...args,codes}),/conjunto exacto/);const valid=compareAssistanceSelection({...args,codes:Object.freeze([code])});assert.ok(valid.coverage.selectedMoneyRows>0);});

test('hoja XML no identificada no se ignora para declarar previa completa',async()=>{const parts=single();parts['xl/worksheets/sheet999.xml']=strToU8('<worksheet><row>UNCONSUMED');await assert.rejects(()=>readAssistanceXlsx(zipSync(parts),{unzipSync}),/hoja XML no identificada/);});
