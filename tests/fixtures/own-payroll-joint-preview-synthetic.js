// General recovered tariffs plus invented identities, approvals and quantities.
// This is a closed interaction fixture, not a proposal or municipal absence read.
import {salaryItems} from '../../assets/native-salary-catalog-model.js';
import {nonapplicationHash,NONAPPLICATION_CODES,NONAPPLICATION_ADDITIVE_GROUPS,OWN_PAYROLL_NONAPPLICATION_CAPTURE_VERSION} from '../../lib/own-payroll-nonapplication.js';
import {familyTariffSources,provenPairs} from './own-payroll-family-tariff-synthetic.js';
import {emissionPreparerEvidence} from './own-payroll-row-emission-synthetic.js';
import {sealFamilySources} from './own-payroll-family-consumer-synthetic.js';
import {nonapplicationFixture,fictitiousDefinition,repinPolicy,repinCapture,uid} from './own-payroll-nonapplication-synthetic.js';

const literal=value=>({op:'literal',unit:'money',value});
const sum=codes=>codes.map(code=>({op:'concept',code,stage:'exact'})).reduce((left,right)=>({op:'add',left,right}));
const catalogue=d=>({kind:d.kind,agreementCode:d.agreementCode,categoryCode:null,code:d.code,label:d.label,active:d.active,nature:d.nature,unit:d.kind==='concept'?d.quantityUnit:d.outputUnit,precision:d.precision,validFrom:d.validFrom,validUntil:d.validUntil,value:d.value,dependencies:d.dependencies,ruleReference:d.ruleReference});
export const jointOptIns=()=>({nonapplication:true,quantityPhases:true,officialTotals:true,rowEmission:true,familyTariffs:true});
export const jointArgs=f=>({source:f.source,policy:f.policy,capture:f.capture,sources:f.sources,optIns:jointOptIns()});

export function resealJointFamily(f){
  sealFamilySources(f.sources);
  f.capture.population=structuredClone(f.sources.population);
  return repinCapture(f);
}

export function jointPreviewFixture({days='30',quantities=['0','1'],region='1',average='0.00'}={}){
  const sources=familyTariffSources({days,quantity:'1',region,average,count:quantities.length,emission:true});
  for(const [i,record]of sources.familyPayrollFacts.records.entries())for(const [,,,field]of provenPairs)record.definition.quantities[field]=quantities[i];
  sealFamilySources(sources);
  const source=emissionPreparerEvidence(sources),absence=nonapplicationFixture();
  source.definitions.push(...absence.source.definitions.filter(d=>d.kind==='concept'&&NONAPPLICATION_CODES.includes(d.code)).map(d=>structuredClone(d)));
  source.bindings.push(...structuredClone(absence.source.bindings));
  source.programmeOptions.noveltyPresenceVersion=absence.source.programmeOptions.noveltyPresenceVersion;
  source.definitions.push(fictitiousDefinition('102',{nature:'non_remuneration',expression:literal('2.00')}),fictitiousDefinition('600',{nature:'deduction',expression:literal('1.00')}));
  const kept={'800000993':['1','48'],'800000994':['102'],'800000995':provenPairs.map(([code])=>code),'800000996':['600']};
  for(const [code,members]of Object.entries(NONAPPLICATION_ADDITIVE_GROUPS)){
    const expression=sum([...(kept[code]??['1']),...members]);
    const existing=source.definitions.find(d=>d.kind==='auxiliary'&&d.code===code);
    if(existing)existing.expression=expression;
    else source.definitions.push(fictitiousDefinition(code,{kind:'auxiliary',role:'dependency',nature:'auxiliary',quantityUnit:null,expression}));
  }
  // Policies describe the effective economic rules after the exact 14N pruning.
  // The source definitions above preserve all original terms and originals.
  source.programmeOptions.officialTotalsPolicies[0].contributions['994']=['102'];
  source.programmeOptions.officialTotalsPolicies[0].contributions['996']=['600'];
  const items=salaryItems(source.definitions.map(catalogue));
  source.salary.catalog.items=structuredClone(items);
  source.programme.salaryCatalog.items=structuredClone(items);
  source.source.expectedDefinitions=source.definitions.length;
  source.source.sha256=nonapplicationHash({qaOnly:true,definitions:source.definitions,bindings:source.bindings});
  sources.programState=structuredClone(source.programme);
  sources.monthly={complete:true,batches:[],nativeBatches:[]};
  const capture={version:OWN_PAYROLL_NONAPPLICATION_CAPTURE_VERSION,origin:'MUNICONTROL',tenantId:uid(999),scopeVersion:source.programme.scopeVersion,period:'2026-10',liquidationType:'monthly',agreementCode:'1',contractIds:sources.population.employees.map(e=>e.contractId).sort(),population:structuredClone(sources.population),monthly:structuredClone(sources.monthly),fixed:structuredClone(sources.fixed),completeness:{population:true,monthly:true,fixed:true},sourceSha256:{population:null,monthly:null,fixed:null},sourceReference:'QA only: synthetic complete source read, no municipal certification'};
  return repinCapture(repinPolicy({source,sourceRows:structuredClone(absence.sourceRows),sources,capture,policy:null}));
}
