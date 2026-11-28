import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {spawnSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
import {openReadingSource,READING_FAILED,READER_UNAVAILABLE} from '../assets/document-reader-source.js';

// PDF.js 6.3 llama a métodos que sólo traen los navegadores más nuevos. En un Chrome o Edge desactualizado la lectura de
// certificados mostraba «this[#Yr].getOrInsertComputed is not a function» y el cotejo presupuestario y el centro de reportes
// no leían ningún PDF. Lo recorren en un navegador real los verificadores verify-family-schooling-reading-browser,
// verify-budget-cotejo-browser, verify-report-centre-browser y verify-document-payment-date-browser; estas guardas fijan las
// dos mitades del arreglo para que un cambio que no corre el navegador no las separe.
const root=fileURLToPath(new URL('..',import.meta.url)),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const build=read('scripts/build-friendly.mjs');
const shipped=name=>{const found=new RegExp("source: '([^']+)',\\s*destination: 'assets/vendor/"+name.replaceAll('.','\\.')+"'").exec(build);assert.ok(found,'el build no publica '+name);return found[1];};
const vendored=['pdf.min.mjs','pdf.worker.min.mjs'];

test('se publica la compilación de PDF.js para navegadores sin los métodos nuevos, en la página y en el worker',()=>{
 for(const name of vendored)assert.equal(shipped(name),'node_modules/pdfjs-dist/legacy/build/'+name);
 // Estos verificadores corren sobre assets/ y toman los dos archivos de node_modules: tienen que probar lo que se publica.
 for(const verifier of ['scripts/verify-budget-cotejo-browser.mjs','scripts/verify-budget-structure-browser.mjs']){
  const mapped=/startsWith\('\/assets\/vendor\/pdf'\)\?path\.join\(root,'([^']+)'/.exec(read(verifier));
  assert.equal(mapped?.[1],path.dirname(shipped('pdf.min.mjs')),verifier);
 }
 // Todos los puntos del producto que abren un PDF cargan esos dos archivos publicados, nunca otra copia del motor.
 const loaders=fs.readdirSync(path.join(root,'assets')).filter(file=>file.endsWith('.js')&&/vendor\/pdf\./.test(read('assets/'+file))).sort();
 assert.deepEqual(loaders,['budget-structure-worker.js','document-reader-source.js','legal-pdf-text-worker.js','monthly-close-grh-summary-worker.js']);
 for(const file of loaders){
  const source=read('assets/'+file),paths=source.match(/['"][^'"]*vendor\/pdf[^'"]*['"]/g).map(text=>text.slice(1,-1).replace(/^(\.|\/assets)\/vendor\//,''));
  assert.deepEqual([...new Set(paths)].sort(),vendored,file);
 }
});

// Un proceso aparte sin esos métodos (se borran si esta versión de Node ya los trae) carga el archivo que se publica y
// comprueba que quedan definidos con la semántica de la especificación: devuelven el valor que ya estaba sin tocarlo y,
// si la clave falta, guardan el valor (o el resultado de la función, llamada una sola vez con la clave) y lo devuelven.
const semantics=`
import assert from 'node:assert/strict';
for(const C of [Map,WeakMap]){delete C.prototype.getOrInsert;delete C.prototype.getOrInsertComputed;}
delete Math.sumPrecise;delete Promise.try;delete Uint8Array.prototype.toHex;
assert.equal(typeof Map.prototype.getOrInsertComputed,'undefined');assert.equal(typeof WeakMap.prototype.getOrInsert,'undefined');
await import(process.argv[1]);
const map=new Map([['previo','valor']]);let calls=[];
assert.equal(map.getOrInsert('previo','otro'),'valor');assert.equal(map.get('previo'),'valor');
assert.equal(map.getOrInsert('nuevo','insertado'),'insertado');assert.equal(map.get('nuevo'),'insertado');
assert.equal(map.getOrInsertComputed('previo',key=>{calls.push(key);return 'otro';}),'valor');assert.deepEqual(calls,[]);
assert.equal(map.getOrInsertComputed('calculado',key=>{calls.push(key);return key+'!';}),'calculado!');assert.deepEqual(calls,['calculado']);
assert.equal(map.getOrInsertComputed('calculado',key=>{calls.push(key);return 'otro';}),'calculado!');assert.deepEqual(calls,['calculado']);
map.set('vacío',undefined);assert.equal(map.getOrInsertComputed('vacío',()=>{calls.push('vacío');return 1;}),undefined);
assert.equal(map.getOrInsert('vacío',1),undefined);assert.deepEqual(calls,['calculado']);assert.equal(map.size,4);
const list=map.getOrInsertComputed('lista',()=>[]);list.push(1);assert.equal(map.getOrInsertComputed('lista',()=>[]),list);
assert.throws(()=>map.getOrInsertComputed('sin función','no es función'),TypeError);assert.equal(map.has('sin función'),false);
const weak=new WeakMap(),first={},second={};calls=[];
assert.equal(weak.getOrInsert(first,'a'),'a');assert.equal(weak.getOrInsert(first,'b'),'a');
assert.equal(weak.getOrInsertComputed(second,key=>{calls.push(key);return 'c';}),'c');
assert.equal(weak.getOrInsertComputed(second,key=>{calls.push(key);return 'd';}),'c');assert.deepEqual(calls,[second]);
assert.equal(weak.get(first),'a');assert.equal(weak.get(second),'c');
assert.throws(()=>weak.getOrInsert('texto','a'),TypeError);assert.throws(()=>weak.getOrInsertComputed('texto',()=>'a'),TypeError);
// Los otros métodos recientes que el mismo motor usa sin preguntar (suma de tamaños, mensajes del worker, huella del PDF).
assert.equal(Math.sumPrecise([1,2,3]),6);assert.equal(await Promise.try(()=>7),7);assert.equal(new Uint8Array([255,1]).toHex(),'ff01');
process.stdout.write('ok');
`;
for(const name of vendored)test(name+' define getOrInsert y getOrInsertComputed de Map y WeakMap cuando el navegador no los trae',()=>{
 // import() recibe una URL: en Windows una ruta «C:\\…» no es un especificador válido y la carga fallaba antes de probar nada.
 const run=spawnSync(process.execPath,['--input-type=module','-e',semantics,pathToFileURL(path.join(root,shipped(name))).href],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr.slice(-2000));assert.equal(run.stdout,'ok');
});

// Si el motor igual falla, la persona no lee el texto interno: el lector lo cambia por qué pasó y qué puede hacer.
const bytes=new TextEncoder().encode('%PDF-1.7 sintético'),file={name:'certificado.pdf',size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer};
const page=(text='Institución: Escuela de ensayo')=>({getJSActions:async()=>null,getAnnotations:async()=>[],getTextContent:async()=>({items:[{str:text,hasEOL:true}]}),cleanup(){}});
const engine=({loading,numPages=1,getPage=async()=>page()}={})=>{let destroyed=0;return{destroyed:()=>destroyed,importer:async()=>({GlobalWorkerOptions:{},getDocument:()=>({promise:loading?Promise.reject(loading):Promise.resolve({numPages,isPureXfa:false,getPermissions:async()=>null,getJSActions:async()=>null,getAttachments:async()=>null,getFieldObjects:async()=>null,getPage}),destroy:async()=>{destroyed++;}})})};};
const rejection=async promise=>{try{await promise;}catch(error){return error;}assert.fail('la lectura tenía que fallar');};
const internal=/getOrInsertComputed|is not a function|Invalid PDF|Worker was destroyed|Failed to fetch|#Yr/;

test('lo que rechaza el motor de PDF llega a la persona en sus palabras, nunca con el texto interno',async()=>{
 const missing=new TypeError('this[#Yr].getOrInsertComputed is not a function');
 const broken=Object.assign(new Error('Invalid PDF structure.'),{name:'InvalidPDFException'});
 for(const loading of [missing,broken,new Error('Worker was destroyed during onPassword callback'),'texto suelto']){
  const pdf=engine({loading}),error=await rejection(openReadingSource(file,{pdfjsImporter:pdf.importer}));
  assert.equal(error.message,READING_FAILED);assert.equal(error.code,'READING_FAILED');assert.doesNotMatch(error.message,internal);assert.equal(pdf.destroyed(),1);
 }
 assert.match(READING_FAILED,/archivo/);assert.match(READING_FAILED,/Probá con otra copia/);assert.match(READING_FAILED,/Chrome o Edge actualizados/);
 // El motor que no llega a cargar (sin conexión, o un navegador que no puede interpretarlo) dice qué hacer con eso.
 const unavailable=await rejection(openReadingSource(file,{pdfjsImporter:async()=>{throw new TypeError('Failed to fetch dynamically imported module: /assets/vendor/pdf.min.mjs');}}));
 assert.equal(unavailable.message,READER_UNAVAILABLE);assert.equal(unavailable.code,'READING_FAILED');assert.doesNotMatch(unavailable.message,internal);
 assert.match(READER_UNAVAILABLE,/Revisá la conexión/);assert.match(READER_UNAVAILABLE,/actualizá Chrome o Edge/);
 // También al dibujar una página ya abierta: ahí fallaba la fecha de pago (getOptionalContentConfig).
 let calls=0;const late=engine({getPage:async()=>{if(++calls>1)throw missing;return page();}}),source=await openReadingSource(file,{pdfjsImporter:late.importer});
 const drawing=await rejection(source.render(1));assert.equal(drawing.message,READING_FAILED);assert.equal(drawing.code,'READING_FAILED');
});

test('los mensajes propios del lector se conservan tal cual y una cancelación sigue siendo una cancelación',async()=>{
 const limit=await rejection(openReadingSource(file,{pdfjsImporter:engine({numPages:31}).importer}));
 assert.equal(limit.message,'El lector admite hasta 30 páginas por documento.');assert.equal(limit.code,undefined);
 const control=await rejection(openReadingSource(file,{pdfjsImporter:engine({getPage:async()=>page('texto con \u0001 control')}).importer}));
 assert.equal(control.message,'No se pudo verificar el texto extraído del PDF seleccionado.');assert.equal(control.code,undefined);
 assert.equal((await rejection(openReadingSource({name:'vacío.pdf',size:2,arrayBuffer:async()=>new ArrayBuffer(2)}))).message,'Seleccioná un PDF, PNG o JPG de hasta 8 MiB.');
 assert.equal((await rejection(openReadingSource({name:'nota.txt',size:bytes.length,arrayBuffer:async()=>new TextEncoder().encode('texto sin formato..').buffer}))).message,'Imagen no compatible o demasiado grande. Usá PNG o JPG de hasta 20 megapíxeles.');
 const opened=await openReadingSource(file,{pdfjsImporter:engine().importer});assert.equal(opened.kind,'pdf');assert.equal(opened.pages[0].method,'native');
 assert.equal((await rejection(opened.render(2))).message,'Página no disponible.');
 // Cancelar destruye la tarea y el motor rechaza con «Worker was destroyed»: la pantalla tiene que recibir la cancelación.
 const controller=new AbortController(),stopping=engine({loading:new Error('Worker was destroyed')});
 const pending=openReadingSource(file,{signal:controller.signal,pdfjsImporter:async()=>{controller.abort();return stopping.importer();}});
 assert.equal((await rejection(pending)).name,'AbortError');
});

test('la lectura de certificados agrega que la carga manual sigue disponible y no muestra otro mensaje del motor',()=>{
 const panel=read('assets/family-schooling-reading.js');
 assert.ok(panel.includes("const readingError=error=>error.code==='READING_FAILED'?error.message+' La carga manual sigue disponible: podés completar los datos a mano.':error.message||'No se pudo leer el archivo. Completá los datos manualmente.';"));
 assert.ok(panel.includes("clear(error.name==='AbortError'?'La lectura se canceló. Podés completar los datos manualmente.':readingError(error));"));
 assert.ok(panel.includes('catch(error){if(valid(token))clear(readingError(error));}'));
 assert.doesNotMatch(panel,/clear\(error\.message\)/);
 // Los otros tres lectores no pasan el error del motor a la pantalla: lo cambian por un código o por su propio texto.
 assert.ok(read('assets/budget-structure-worker.js').includes("}catch{self.postMessage({type:'error',code:'STRUCTURE_NOT_VERIFIED'})}"));
 assert.ok(read('assets/legal-pdf-text-worker.js').includes("}catch{outcome={ok:false,code:'PDF_TEXT_UNAVAILABLE'};}"));
 assert.match(read('assets/monthly-close-grh-summary-worker.js'),/message: error instanceof PayrollMonthlyGrhSummaryError\s*\? error\.message : 'No se pudieron validar los tres PDF'/);
});
