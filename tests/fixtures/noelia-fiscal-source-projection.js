import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const rows=Object.freeze([
  {
    "path": "scripts/lib/noelia-circuit-runtime.mjs",
    "beforeBytes": 3462,
    "beforeSha256": "b84d6b4d74a1b237e264e708bd703cd9bb2477d7df830ea0170bdf8b1df1197f",
    "afterBytes": 3683,
    "afterSha256": "0e3ef4ec627861558412ac04c5fafe9e9abda65d2c90e8b372fe8f8b3b55457b",
    "inverse": [
      {
        "from": "jurisdictions:args.jurisdictions === 'true',...(args.fiscal==='true'?{fiscal:true}:{})};",
        "to": "jurisdictions:args.jurisdictions === 'true'};"
      },
      {
        "from": "  if(args.fiscal==='true')assert.ok(args.browser!==undefined&&args.positions==='true'&&args.jurisdictions==='true','QA_FISCAL_COMPLETE_PREREQUISITES_REQUIRED');\n  return {major:Number(args.major)",
        "to": "  return {major:Number(args.major)"
      },
      {
        "from": "for(const option of ['positions', 'jurisdictions', 'fiscal'])",
        "to": "for(const option of ['positions', 'jurisdictions'])"
      },
      {
        "from": "positions|jurisdictions|fiscal|transport)",
        "to": "positions|jurisdictions|transport)"
      }
    ]
  },
  {
    "path": "scripts/verify-noelia-payroll-circuit.mjs",
    "beforeBytes": 50929,
    "beforeSha256": "f45c1d8d1b6032afa95952f05cbddce96110bd4b5203d87c732744240f8b89f0",
    "afterBytes": 52062,
    "afterSha256": "2f9e752dac96a66308fe9a0af4a6a3de095473b56505911381609390cdd5c036",
    "inverse": [
      {
        "from": " if(report.passed&&report.nativeFiscalTail){report.nativeFiscalTail.status='complete_after_outer_cleanup';report.nativeFiscalTail.cleanupConfirmed=true;fs.writeFileSync(path.join(destination,'noelia-fiscal-tail-cleanup-proof.json'),JSON.stringify(report.nativeFiscalTail,null,2)+'\\n',{flag:'wx'});}\n if(report.passed&&report.nativeAccountingTail)",
        "to": " if(report.passed&&report.nativeAccountingTail)"
      },
      {
        "from": "accountingTailChecks:coreChecksBeforeFiscalTail-coreChecksBeforeAccountingTail,...(fiscal?{nativeFiscalTail,coreChecksBeforeFiscalTail,fiscalTailChecks:checks.length-coreChecksBeforeFiscalTail}:{}),connections:",
        "to": "accountingTailChecks:checks.length-coreChecksBeforeAccountingTail,connections:"
      },
      {
        "from": "  const coreChecksBeforeFiscalTail=checks.length;\n  const nativeFiscalTail=fiscal?await verifyNoeliaFiscal160Tail({db,qa,sourceCommit,major,fullQa,ready:datedReadyForSuccession,maker,checker,getCurrent:()=>current,setCurrent:actor=>{current=actor;},journey:nativeEmployeeJourney,handlers,deps,period,transport:browserQa,output:destination,executeStage:accountingStage,run,tx,ok,read:p=>fs.readFileSync(path.join(root,p),'utf8')}):null;\n  if(browserQa){await browserQa.close();browserQaClosed=true;}",
        "to": "  if(browserQa){await browserQa.close();browserQaClosed=true;}"
      },
      {
        "from": " assert.equal(typeof fiscal,'boolean','QA_FISCAL_OPTION_INVALID');if(fiscal)assert.ok(browser!=='none'&&positions&&jurisdictions,'QA_FISCAL_COMPLETE_PREREQUISITES_REQUIRED');\n assert.ok([17,18].includes(major));",
        "to": " assert.ok([17,18].includes(major));"
      },
      {
        "from": "jurisdictions=false,transport='local',fiscal=false})",
        "to": "jurisdictions=false,transport='local'})"
      },
      {
        "from": "import {verifyNoeliaFiscal160Tail} from './lib/noelia-fiscal160-tail-qa.mjs';\nconst root=path.resolve(import.meta.dirname,'..');",
        "to": "const root=path.resolve(import.meta.dirname,'..');"
      }
    ]
  },
  {
    "path": "scripts/lib/noelia-payroll-circuit-browser.mjs",
    "beforeBytes": 87197,
    "beforeSha256": "979d04c8189662097cea506d5551f9a9d5bb958608fb00f4ed504c330d7e7737",
    "afterBytes": 87464,
    "afterSha256": "bc6fe5f808cf43357e134dbeaee8397fbe3c3c8d625595b84a714e28be441dee",
    "inverse": [
      {
        "from": "return {nativeF931ReadExport:input=>verifyNativeF931Ui({page,origin,output,check,browserName,...input}),origin,prepare,",
        "to": "return {origin,prepare,"
      },
      {
        "from": "['/api/internal-own-fiscal-facts','fiscalFacts'],['/api/internal-employment-changes','employmentChanges'],['/api/internal-own-payroll-novelties','novelty']",
        "to": "['/api/internal-own-payroll-novelties','novelty']"
      },
      {
        "from": "import {verifyNativeF931Ui} from './noelia-fiscal160-ui-qa.mjs';\nconst root=path.resolve(import.meta.dirname,'../..');",
        "to": "const root=path.resolve(import.meta.dirname,'../..');"
      }
    ]
  }
]);
const hash=value=>createHash('sha256').update(value).digest('hex');
export const NOELIA_FISCAL_SOURCE_PINS=Object.freeze(rows.map(({inverse,...row})=>Object.freeze(row)));
export function projectNoeliaFiscalSource(file,value){const row=rows.find(v=>v.path===file);if(!row)return value;assert.equal(typeof value,'string','NOELIA_FISCAL_SOURCE_TEXT_REQUIRED');assert.equal(Buffer.byteLength(value),row.afterBytes,'NOELIA_FISCAL_CURRENT_BYTES_CHANGED');assert.equal(hash(value),row.afterSha256,'NOELIA_FISCAL_CURRENT_SOURCE_CHANGED');let restored=value;for(const span of row.inverse){assert.equal(restored.split(span.from).length,2,'NOELIA_FISCAL_INVERSE_ANCHOR_CHANGED');restored=restored.replace(span.from,()=>span.to);}assert.equal(Buffer.byteLength(restored),row.beforeBytes,'NOELIA_FISCAL_PARENT_BYTES_CHANGED');assert.equal(hash(restored),row.beforeSha256,'NOELIA_FISCAL_PARENT_SOURCE_CHANGED');return restored;}
