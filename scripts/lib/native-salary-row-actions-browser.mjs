import assert from 'node:assert/strict';
import path from 'node:path';
import {row} from '../../tests/fixtures/native-salary-synthetic.js';
import {salaryItems,salaryRowKey} from '../../assets/native-salary-catalog-model.js';

// «Acciones» of one draft row on the compiled UI, with the real handler and synthetic SQL only: activate a period,
// increase by coefficient and end a validity are compared and incorporated into the draft without any request that
// writes; the only POST is the voluntary proposal sent at the end.
export async function verifySalaryRowActions({page,w,getState,load,commit,writes,checks,out}){
 const panel=w.locator('[data-salary-row-actions-panel]'),impact=panel.locator('[data-salary-row-impact]'),rows=w.locator('.sc-grid tbody tr');
 const sent=[],observe=request=>{if(request.method()!=='GET')sent.push(request.method()+' '+new URL(request.url()).pathname);};
 const bonus=row({code:'550',label:'Bono no remunerativo sintético',nature:'non_remuneration',unit:'money',value:null,validFrom:'2026-01'});
 const school=row({code:'311',label:'Ayuda escolar sintética',unit:'money',value:'15000.00',validFrom:'2026-02',validUntil:'2026-02'});
 const fixed=row({code:'10',label:'Importe fijo sintético',unit:'money',value:'1000.00',validFrom:'2026-01'});
 const hours=row({code:'20',label:'Horas sintéticas',unit:'hours',value:'12.50',validFrom:'2026-01'});
 const fixture=()=>salaryItems([bonus,school,fixed,hours,...Array.from({length:60},(_,n)=>row({code:String(700+n),label:'Definición sintética '+(700+n)}))]);
 const title=item=>`Concepto ${item.code} · convenio ${item.agreementCode} · desde ${item.validFrom}`;
 const opener=item=>w.getByRole('button',{name:'Acciones de '+title(item),exact:true});
 async function prepare(){
  await load();getState().boot.catalog.items=fixture();await w.getByRole('button',{name:'Consultar maestro propio',exact:true}).click();await w.getByText('64 definiciones propias',{exact:false}).waitFor();
  // Outside the draft the grid is read-only: no «Editar», no «Acciones».
  assert.equal(await rows.count(),50);assert.equal(await w.locator('[data-salary-row-actions]').count(),0);
  await w.getByRole('button',{name:'Preparar nueva versión',exact:true}).click();await w.locator('[data-salary-row-actions]').first().waitFor();
  // One «Acciones» per row beside «Editar», and nothing else: the panel opens apart from the table.
  assert.equal(await w.locator('[data-salary-row-actions]').count(),50);assert.equal(await rows.getByRole('button',{name:'Editar',exact:true}).count(),50);assert.equal(await rows.locator('button').count(),100);assert.equal(await panel.count(),0);
 }
 async function open(item){await w.getByLabel('Buscar',{exact:true}).fill(item.label);await opener(item).click();await panel.getByRole('heading',{name:'Acciones · '+title(item),exact:true}).waitFor();}
 async function compare(){await panel.getByRole('button',{name:'Comparar antes y después',exact:true}).click();await impact.waitFor();}
 async function incorporate(item){await panel.getByRole('button',{name:'Incorporar al borrador',exact:true}).click();await w.getByRole('status').filter({hasText:'Todavía no se guardó ni aprobó la versión.'}).waitFor();await panel.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Acciones de '+title(item),'the keyboard returns to the row that opened the panel');}
 async function activate(from,until,value,reference){await panel.getByRole('button',{name:'Activar para un mes o período',exact:true}).click();await panel.getByLabel('Mes inicial',{exact:true}).fill(from);await panel.getByLabel('Mes final',{exact:true}).fill(until);if(value!==null)await panel.getByLabel('Valor',{exact:true}).fill(value);await panel.getByLabel('Documento que respalda la vigencia',{exact:true}).fill(reference);}
 const measure=()=>page.evaluate(()=>{const dialog=document.querySelector('[data-salary-row-actions-panel]'),box=dialog.getBoundingClientRect();return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dialogLeft:box.left,dialogRight:box.right,dialogScroll:dialog.scrollWidth,dialogClient:dialog.clientWidth,modal:dialog.matches(':modal'),low:[...dialog.querySelectorAll('button,input,select')].filter(control=>control.getBoundingClientRect().width>0&&control.getBoundingClientRect().height<44).map(control=>control.textContent||control.type),outside:[...dialog.querySelectorAll('*')].filter(node=>node.getBoundingClientRect().width>0&&(node.getBoundingClientRect().right>box.right+1||node.getBoundingClientRect().left<box.left-1)).map(node=>node.tagName+'.'+node.className).slice(0,8)};});
 const fits=layout=>{assert.ok(layout.modal,'the panel is a modal dialog, apart from the table');assert.ok(layout.scrollWidth<=layout.width&&layout.dialogLeft>=0&&layout.dialogRight<=layout.width&&layout.dialogScroll<=layout.dialogClient,JSON.stringify(layout));assert.deepEqual(layout.low,[],JSON.stringify(layout));assert.deepEqual(layout.outside,[],JSON.stringify(layout));};

 page.on('request',observe);
 try{
  // The bonus of the week: 240000 in November and December 2026, nothing afterwards, at desk and phone widths.
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await prepare();const before=writes.length,start=sent.length;await open(bonus);
   assert.equal(await panel.getByRole('button',{name:'Aumentar desde un mes',exact:true}).isDisabled(),true);await panel.getByText('«Aumentar desde un mes» necesita un importe informado',{exact:false}).waitFor();
   assert.equal(await panel.getByRole('button',{name:'Dar de baja desde un mes',exact:true}).isEnabled(),true);
   await activate('2026-11','2026-12','240000','Decreto sintético QA del bono');fits(await measure());await panel.screenshot({path:path.join(out,'salary-row-actions-form-'+width+'.png')});
   await compare();assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Antes y después · Activar para un mes o período','the keyboard follows to the comparison');
   await impact.getByText('Vigencia nueva de Concepto 550 · convenio 1: de 2026-11 a 2026-12, con valor 240000.00.',{exact:true}).waitFor();await impact.getByText('La vigencia anterior (desde 2026-01) se cierra en 2026-10 y conserva su valor.',{exact:true}).waitFor();await impact.getByText('Desde 2027-01 esta definición queda sin vigencia, hasta que la actives otra vez.',{exact:true}).waitFor();
   assert.equal(await impact.locator('table').count(),2);assert.deepEqual(await impact.locator('table').nth(0).locator('tbody tr').nth(1).locator('td').allInnerTexts(),['2026-01 a sin término','2026-01 a 2026-10']);assert.deepEqual(await impact.locator('table').nth(1).locator('tbody tr').nth(0).locator('td').allInnerTexts(),['No existía','240000.00']);
   fits(await measure());await panel.screenshot({path:path.join(out,'salary-row-actions-'+width+'.png')});await page.screenshot({path:path.join(out,'salary-row-actions-viewport-'+width+'.png')});
   await incorporate(bonus);assert.equal(await rows.count(),2);assert.equal(await w.locator('.sc-grid tr.sc-changed').count(),2);
   const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,low:[...document.querySelectorAll('[data-native-salary] .sc-grid button')].filter(button=>button.getBoundingClientRect().height<44).length}));assert.ok(layout.scrollWidth<=layout.width&&layout.low===0,JSON.stringify(layout));
   assert.equal(writes.length,before);assert.deepEqual(sent.slice(start),[]);checks.push(width+'px row action: one «Acciones» per draft row, bonus 550 activated for November–December in a modal with 44px controls, compared before/after and incorporated without any POST');
  }
  await page.setViewportSize({width:1440,height:1000});await prepare();const before=writes.length,start=sent.length;
  // Keyboard only: Enter opens, Escape closes without touching the draft and returns to the same row.
  await w.getByLabel('Buscar',{exact:true}).fill(fixed.label);await opener(fixed).focus();await page.keyboard.press('Enter');await panel.waitFor();assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Activar para un mes o período');
  await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});await w.getByRole('status').filter({hasText:'Acciones cerradas. El borrador no cambió.'}).waitFor();assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Acciones de '+title(fixed));assert.equal(await w.locator('.sc-grid tr.sc-changed').count(),0);
  checks.push('row action keyboard: Enter opens the modal on its first action, Escape closes it with the draft untouched and focus back on the row');
  // A period that steps on an existing validity stops in words, inside the dialog, and nothing is prepared.
  await open(school);assert.equal(await panel.getByRole('button',{name:'Dar de baja desde un mes',exact:true}).isDisabled(),true);await activate('2026-02','2026-03',null,'Resolución sintética QA de ayuda escolar');await panel.getByRole('button',{name:'Comparar antes y después',exact:true}).click();
  await panel.getByRole('alert').filter({hasText:'Esta vigencia ya empieza en 2026-02.'}).waitFor();await panel.getByLabel('Mes inicial',{exact:true}).fill('2026-01');await panel.getByRole('button',{name:'Comparar antes y después',exact:true}).click();await panel.getByRole('alert').filter({hasText:'Ese período se superpone con la vigencia de esta misma definición que rige sólo 2026-02.'}).waitFor();assert.equal(await impact.count(),0);
  checks.push('row action overlap: a period over an existing validity is refused inside the dialog in plain words, with no comparison');
  // School aid only in February of the next year, from its finished validity; the source stays as it is.
  await panel.getByLabel('Mes inicial',{exact:true}).fill('2027-02');await panel.getByLabel('Mes final',{exact:true}).fill('2027-02');await compare();await impact.getByText('Vigencia nueva de Concepto 311 · convenio 1: sólo 2027-02, con valor 15000.00.',{exact:true}).waitFor();await impact.getByText('La vigencia de origen (sólo 2026-02) no cambia.',{exact:true}).waitFor();assert.equal(await impact.locator('table').count(),1);await incorporate(school);
  // An agreed «por 1,02» is the exact 2 % on a fixed amount.
  await open(fixed);await panel.getByRole('button',{name:'Aumentar desde un mes',exact:true}).click();await panel.getByLabel('Mes inicial del aumento',{exact:true}).fill('2026-11');await panel.getByLabel('Cómo informás el aumento',{exact:true}).selectOption('coefficient');await panel.getByLabel('Coeficiente de aumento',{exact:true}).fill('1,02');await panel.getByText('Equivale a un aumento del 2 %.',{exact:false}).waitFor();await panel.getByLabel('Documento que respalda el aumento',{exact:true}).fill('Acta sintética QA de aumento');
  await compare();await impact.getByText('Aumento del 2 % (coeficiente 1,02) para Concepto 10 · convenio 1: de 1000.00 a 1020.00 desde 2026-11. Incremento exacto: 20.00.',{exact:true}).waitFor();await incorporate(fixed);
  // Hours cannot be increased; ending gives the open validity its last month.
  await open(hours);assert.equal(await panel.getByRole('button',{name:'Aumentar desde un mes',exact:true}).isDisabled(),true);await panel.getByText('«Aumentar desde un mes» es sólo para valores en pesos. Esta definición está en horas.',{exact:true}).waitFor();
  await panel.getByRole('button',{name:'Dar de baja desde un mes',exact:true}).click();await panel.getByLabel('Último mes en que vale',{exact:true}).fill('2026-12');await panel.getByText('Deja de regir desde 2027-01.',{exact:true}).waitFor();await compare();await impact.getByText('Concepto 20 · convenio 1 vale hasta 2026-12 inclusive. Su valor y su documento no cambian.',{exact:true}).waitFor();await incorporate(hours);
  assert.equal(writes.length,before);assert.deepEqual(sent.slice(start),[],'three more actions incorporated without a request that writes');
  // Only the person's own «Revisar versión completa» and confirmation send anything: once, with the whole master.
  await w.getByLabel('Motivo de la versión',{exact:true}).fill('Acciones sintéticas sobre cuatro definiciones del borrador');await w.getByRole('button',{name:'Revisar versión completa',exact:true}).click();await w.locator('dialog').getByRole('heading',{name:'Enviar versión a revisión',exact:true}).waitFor();assert.equal(await w.locator('dialog [data-sc-comparison] details').count(),4);await commit();await w.getByText('Propuesta completa guardada',{exact:false}).waitFor();
  assert.equal(writes.length,before+1);assert.deepEqual(sent.slice(start),['POST /api/internal-native-salary']);const body=writes.at(-1).body,find=(code,validFrom)=>body.items.find(item=>item.code===code&&item.validFrom===validFrom);
  assert.equal(body.command,'propose');assert.equal(body.reviewConfirmed,false);assert.equal(body.items.length,66);
  assert.deepEqual(find('311','2026-02'),school);assert.deepEqual(find('311','2027-02'),{...school,validFrom:'2027-02',validUntil:'2027-02',ruleReference:'Resolución sintética QA de ayuda escolar'});
  assert.deepEqual(find('10','2026-01'),{...fixed,validUntil:'2026-10'});assert.deepEqual(find('10','2026-11'),{...fixed,validFrom:'2026-11',value:'1020.00',ruleReference:'Acta sintética QA de aumento'});
  assert.deepEqual(find('20','2026-01'),{...hours,validUntil:'2026-12'});assert.deepEqual(find('550','2026-01'),bonus);
  const touched=new Set([school,fixed,hours].map(salaryRowKey));for(const original of fixture())if(!touched.has(salaryRowKey(original)))assert.deepEqual(body.items.find(item=>salaryRowKey(item)===salaryRowKey(original)),original);
  checks.push('row actions: school aid only in February, increase by coefficient 1,02 and end of validity change exactly their own definitions; nothing is written until the one voluntary proposal with all 66 definitions');
 }finally{page.off('request',observe);}
}
